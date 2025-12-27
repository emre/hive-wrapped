import { hiveClient } from './utils.js';
import { normalizeUsername } from './utils.js';
import { SPAM_USERS } from './constants.js';
import { computeWrapped } from './compute.js';
import pg from 'pg';

const { Pool } = pg;
export const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/hive_wrapped',
  ssl: process.env.PGSSL === 'true' ? { rejectUnauthorized: false } : false,
});

function nowMs() {
  return Date.now();
}

function createJobId() {
  return typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : String(nowMs()) + Math.random().toString(16).slice(2);
}

export async function withDb(fn) {
  const client = await pool.connect();
  try {
    return await fn(client);
  } finally {
    client.release();
  }
}

export async function migrate() {
  await withDb(async (db) => {
    await db.query(`
      CREATE TABLE IF NOT EXISTS wrapped_jobs (
        id text PRIMARY KEY,
        username text NOT NULL,
        status text NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        started_at timestamptz,
        finished_at timestamptz,
        error text,
        result jsonb,
        period_from date NOT NULL,
        period_to date NOT NULL
      )
    `);

    await db.query('CREATE INDEX IF NOT EXISTS wrapped_jobs_status_created_at_idx ON wrapped_jobs(status, created_at)');
    await db.query('CREATE INDEX IF NOT EXISTS wrapped_jobs_username_period_idx ON wrapped_jobs(username, period_from, period_to)');

    await db.query(`
      CREATE TABLE IF NOT EXISTS wrapped_cache (
        username text NOT NULL,
        period_from date NOT NULL,
        period_to date NOT NULL,
        expires_at timestamptz NOT NULL,
        result jsonb NOT NULL,
        PRIMARY KEY(username, period_from, period_to)
      )
    `);
    await db.query('CREATE INDEX IF NOT EXISTS wrapped_cache_expires_at_idx ON wrapped_cache(expires_at)');
  });
}

function parseAssetAmount(asset) {
  if (!asset) return null;
  if (typeof asset !== 'string') return null;
  const parts = asset.trim().split(' ');
  if (parts.length !== 2) return null;
  const amount = Number(parts[0]);
  if (!Number.isFinite(amount)) return null;
  return { amount, symbol: parts[1] };
}

function addAsset(totals, asset) {
  if (!asset) return;
  const parsed = parseAssetAmount(asset);
  if (!parsed) return;
  if (parsed.symbol === 'HBD') totals.hbd += parsed.amount;
  if (parsed.symbol === 'VESTS') totals.vests += parsed.amount;
}


export async function enqueueOrGetJob(username, periodFrom = '2025-01-01', periodTo = '2026-01-01') {
  return withDb(async (db) => {
    await db.query('BEGIN');
    try {
      await db.query('SELECT pg_advisory_xact_lock(hashtext($1))', [username]);

      const cached = await db.query(
        `
          SELECT result
          FROM wrapped_cache
          WHERE username = $1 AND period_from = $2 AND period_to = $3
            AND expires_at > now()
        `,
        [username, periodFrom, periodTo],
      );

      if (cached.rows.length) {
        await db.query('COMMIT');
        return { jobId: null, status: 'done', result: cached.rows[0].result };
      }

      const existing = await db.query(
        `
          SELECT id, status
          FROM wrapped_jobs
          WHERE username = $1 AND period_from = $2 AND period_to = $3
            AND status IN ('queued', 'running')
          ORDER BY created_at DESC
          LIMIT 1
        `,
        [username, periodFrom, periodTo],
      );

      if (existing.rows.length) {
        await db.query('COMMIT');
        return { jobId: existing.rows[0].id, status: existing.rows[0].status };
      }

      const jobId = createJobId();
      await db.query(
        `
          INSERT INTO wrapped_jobs(id, username, status, period_from, period_to)
          VALUES ($1, $2, 'queued', $3, $4)
        `,
        [jobId, username, periodFrom, periodTo],
      );

      await db.query('COMMIT');
      return { jobId, status: 'queued' };
    } catch (e) {
      await db.query('ROLLBACK');
      throw e;
    }
  });
}

export async function getJob(jobId) {
  const job = await withDb((db) =>
    db.query(
      `
        SELECT id, username, status,
               (extract(epoch from created_at) * 1000)::bigint as "createdAt",
               (extract(epoch from started_at) * 1000)::bigint as "startedAt",
               (extract(epoch from finished_at) * 1000)::bigint as "finishedAt",
               error, result
        FROM wrapped_jobs
        WHERE id = $1
      `,
      [jobId],
    ),
  );

  if (!job.rows.length) return null;
  const row = job.rows[0];
  return {
    id: row.id,
    username: row.username,
    status: row.status,
    createdAt: row.createdAt,
    startedAt: row.startedAt,
    finishedAt: row.finishedAt,
    error: row.error,
    result: row.result,
  };
}

export async function getCached(username, periodFrom = '2025-01-01', periodTo = '2026-01-01') {
  const cached = await withDb((db) =>
    db.query(
      `
        SELECT result
        FROM wrapped_cache
        WHERE username = $1 AND period_from = $2 AND period_to = $3
          AND expires_at > now()
      `,
      [username, periodFrom, periodTo],
    ),
  );

  if (!cached.rows.length) return null;
  return cached.rows[0].result;
}

export async function upsertCache(username, result, periodFrom = '2025-01-01', periodTo = '2026-01-01') {
  await withDb((db) =>
    db.query(
      `
        INSERT INTO wrapped_cache(username, period_from, period_to, expires_at, result)
        VALUES ($1, $2, $3, now() + interval '1 day', $4::jsonb)
        ON CONFLICT (username, period_from, period_to)
        DO UPDATE SET expires_at = EXCLUDED.expires_at, result = EXCLUDED.result
      `,
      [username, periodFrom, periodTo, JSON.stringify(result)],
    ),
  );
}

export async function claimNextJob() {
  return withDb(async (db) => {
    await db.query('BEGIN');
    try {
      const picked = await db.query(
        `
          SELECT id, username, period_from, period_to
          FROM wrapped_jobs
          WHERE status = 'queued'
          ORDER BY created_at ASC
          LIMIT 1
          FOR UPDATE SKIP LOCKED
        `,
      );

      if (!picked.rows.length) {
        await db.query('COMMIT');
        return null;
      }

      const job = picked.rows[0];
      await db.query(
        `
          UPDATE wrapped_jobs
          SET status = 'running', started_at = now()
          WHERE id = $1
        `,
        [job.id],
      );

      await db.query('COMMIT');
      return job;
    } catch (e) {
      await db.query('ROLLBACK');
      throw e;
    }
  });
}

export async function completeJob(jobId, result, username, periodFrom, periodTo) {
  await withDb(async (db) => {
    await db.query(
      `
        UPDATE wrapped_jobs
        SET status = 'done', finished_at = now(), result = $2::jsonb, error = NULL
        WHERE id = $1
      `,
      [jobId, JSON.stringify(result)],
    );

    await db.query(
      `
        INSERT INTO wrapped_cache(username, period_from, period_to, expires_at, result)
        VALUES ($1, $2, $3, now() + interval '1 day', $4::jsonb)
        ON CONFLICT (username, period_from, period_to)
        DO UPDATE SET expires_at = EXCLUDED.expires_at, result = EXCLUDED.result
      `,
      [username, periodFrom, periodTo, JSON.stringify(result)],
    );
  });
}

export async function failJob(jobId, error) {
  await withDb((db) =>
    db.query(
      `
        UPDATE wrapped_jobs
        SET status = 'error', finished_at = now(), error = $2
        WHERE id = $1
      `,
      [jobId, String(error?.message || error)],
    ),
  );
}
