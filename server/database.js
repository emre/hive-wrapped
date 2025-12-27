import { withDb } from './utils.js';

// Generate simple unique ID
function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

// Database migrations
export async function ensureTables() {
  return withDb(async (db) => {
    await db.query(`
      CREATE TABLE IF NOT EXISTS wrapped_jobs (
        id VARCHAR(36) PRIMARY KEY,
        username VARCHAR(50) NOT NULL,
        status VARCHAR(20) NOT NULL DEFAULT 'queued',
        created_at TIMESTAMPTZ DEFAULT NOW(),
        started_at TIMESTAMPTZ,
        finished_at TIMESTAMPTZ,
        result JSONB,
        error_message TEXT,
        period_from DATE,
        period_to DATE,
        CONSTRAINT valid_status CHECK (status IN ('queued', 'running', 'done', 'error'))
      );
    `);

    // Add missing columns if they don't exist
    try {
      await db.query('ALTER TABLE wrapped_jobs ADD COLUMN IF NOT EXISTS period_from DATE');
      await db.query('ALTER TABLE wrapped_jobs ADD COLUMN IF NOT EXISTS period_to DATE');
      await db.query('ALTER TABLE wrapped_jobs ADD COLUMN IF NOT EXISTS error_message TEXT');
    } catch (e) {
      // Columns might already exist, ignore errors
    }

    await db.query(`
      CREATE TABLE IF NOT EXISTS wrapped_cache (
        username text NOT NULL,
        period_from date NOT NULL,
        period_to date NOT NULL,
        result jsonb NOT NULL,
        expires_at TIMESTAMPTZ NOT NULL DEFAULT now() + interval '24 hours',
        PRIMARY KEY(username, period_from, period_to)
      );
    `);

    await db.query('CREATE INDEX IF NOT EXISTS wrapped_cache_expires_at_idx ON wrapped_cache(expires_at)');
  });
}

// Job queue operations
export async function enqueueJob(username, periodFrom, periodTo) {
  return withDb(async (db) => {
    await db.query('BEGIN');
    try {
      await db.query('SELECT pg_advisory_xact_lock(hashtext($1))', [username]);

      const cached = await db.query(
        'SELECT result FROM wrapped_cache WHERE username = $1 AND period_from = $2 AND period_to = $3 AND expires_at > NOW()',
        [username, periodFrom, periodTo]
      );

      if (cached.rows.length > 0) {
        // Force refresh for debugging rewards
        await db.query('DELETE FROM wrapped_cache WHERE username = $1 AND period_from = $2 AND period_to = $3',
          [username, periodFrom, periodTo]
        );
      }

      const existing = await db.query(
        'SELECT id, status, result FROM wrapped_jobs WHERE username = $1 AND period_from = $2 AND period_to = $3 ORDER BY created_at DESC LIMIT 1',
        [username, periodFrom, periodTo]
      );

      if (existing.rows.length > 0) {
        const job = existing.rows[0];
        if (job.status === 'done') {
          await db.query('ROLLBACK');
          return { status: 'done', result: job.result, jobId: job.id };
        } else if (job.status === 'running') {
          await db.query('ROLLBACK');
          return { status: 'running', jobId: job.id };
        } else if (job.status === 'queued') {
          // Check if the queued job is too old (stuck)
          const jobAge = await db.query(
            'SELECT EXTRACT(EPOCH FROM (NOW() - created_at)) as age_seconds FROM wrapped_jobs WHERE id = $1',
            [job.id]
          );
          const ageSeconds = jobAge.rows[0]?.age_seconds || 0;
          
          if (ageSeconds > 300) { // 5 minutes
            // Mark old queued job as failed and create new one
            await db.query('UPDATE wrapped_jobs SET status = $2, finished_at = NOW(), error_message = $3 WHERE id = $1',
              [job.id, 'error', 'Job timed out']
            );
          } else {
            // Still a valid queued job, return it
            await db.query('ROLLBACK');
            return { status: 'queued', jobId: job.id };
          }
        }
      }

      const jobId = generateId();
      const result = await db.query(
        'INSERT INTO wrapped_jobs (id, username, period_from, period_to, status, created_at) VALUES ($1, $2, $3, $4, $5, NOW()) RETURNING id',
        [jobId, username, periodFrom, periodTo, 'queued']
      );

      await db.query('COMMIT');
      return { status: 'queued', jobId: result.rows[0].id };
    } catch (e) {
      await db.query('ROLLBACK');
      throw e;
    }
  });
}

export async function claimJob() {
  return withDb(async (db) => {
    await db.query('BEGIN');
    try {
      const result = await db.query(
        `UPDATE wrapped_jobs 
         SET status = 'running', started_at = NOW() 
         WHERE id = (
           SELECT id FROM wrapped_jobs 
           WHERE status = 'queued' 
           ORDER BY created_at ASC 
           LIMIT 1 
           FOR UPDATE SKIP LOCKED
         )
         RETURNING id, username, period_from, period_to`,
      );

      if (result.rows.length === 0) {
        await db.query('ROLLBACK');
        return null;
      }

      await db.query('COMMIT');
      return result.rows[0];
    } catch (e) {
      await db.query('ROLLBACK');
      throw e;
    }
  });
}

export async function completeJob(jobId, result) {
  return withDb(async (db) => {
    await db.query(
      'UPDATE wrapped_jobs SET status = $2, finished_at = NOW(), result = $3 WHERE id = $1',
      [jobId, 'done', result]
    );

    const job = await db.query(
      'SELECT username, period_from, period_to FROM wrapped_jobs WHERE id = $1',
      [jobId]
    );

    if (job.rows.length > 0) {
      const { username, period_from, period_to } = job.rows[0];
      await db.query(
        `INSERT INTO wrapped_cache(username, period_from, period_to, expires_at, result)
         VALUES ($1, $2, $3, now() + interval '24 hours', $4::jsonb)
         ON CONFLICT (username, period_from, period_to)
         DO UPDATE SET expires_at = EXCLUDED.expires_at, result = EXCLUDED.result`,
        [username, period_from, period_to, result]
      );
    }
  });
}

export async function failJob(jobId, errorMessage) {
  return withDb(async (db) => {
    await db.query(
      'UPDATE wrapped_jobs SET status = $2, finished_at = NOW(), error_message = $3 WHERE id = $1',
      [jobId, 'error', errorMessage]
    );
  });
}

export async function getJobStatus(jobId) {
  return withDb(async (db) => {
    const result = await db.query(
      'SELECT id, username, status, created_at, started_at, finished_at, result, error_message FROM wrapped_jobs WHERE id = $1',
      [jobId]
    );
    return result.rows[0] || null;
  });
}
