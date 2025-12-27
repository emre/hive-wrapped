import crypto from 'crypto';
import { Client } from '@hiveio/dhive';
import pg from 'pg';

const hiveClient = new Client(['https://api.deathwing.me',]);

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

export function normalizeUsername(raw) {
  return String(raw || '').trim().replace(/^@/, '');
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

export async function computeWrapped(username) {
  const from = new Date('2025-01-01T00:00:00.000Z');
  const to = new Date('2026-01-01T00:00:00.000Z');

  let posts = 0;
  let votes = 0;
  let rewardEvents = 0;
  let claimEvents = 0;
  const totals = { hbd: 0, vests: 0 };
  let scannedOps = 0;

  // Story metrics
  const postsByMonth = {};
  const topVotedAuthors = new Map(); // author -> vote count
  const topDownvotedAuthors = new Map(); // author -> downvote count
  let comments = 0;
  let downvotes = 0;
  
  // Track top 5 buddies directly (more memory efficient)
  const topBuddies = new Map(); // author -> comment count
  
  // New metrics
  const tagsUsed = new Set(); // unique tags
  const topTags = new Map(); // tag -> usage count
  const postsByDay = new Map(); // day -> posts count (for streak)
  let totalVotesOnPosts = 0; // sum of votes received on posts
  let totalCommentsOnPosts = 0; // sum of comments received on posts

  const pageSize = 1000;
  const maxPages = 5000;
  const concurrency = 4;
  let start = -1;
  let reachedBefore2025 = false;

  // Fetch global properties for VESTS to HP conversion
  const globalProps = await hiveClient.database.getDynamicGlobalProperties();
  const totalVestingFund = parseFloat(globalProps.total_vesting_fund_hive.split(' ')[0]);
  const totalVestingShares = parseFloat(globalProps.total_vesting_shares.split(' ')[0]);
  const vestsToHpRatio = totalVestingFund / totalVestingShares;

  console.log(`[compute] Starting scan for @${username} (concurrency=${concurrency})`);
  console.log(`[compute] VESTS to HP ratio: ${vestsToHpRatio}`);

  for (let batchStartPage = 0; batchStartPage < maxPages; batchStartPage += concurrency) {
    // Prepare start positions for this batch
    const batchStarts = [];
    for (let i = 0; i < concurrency && (batchStartPage + i) < maxPages; i++) {
      batchStarts.push(start);
    }

    // Fetch pages in parallel
    const pages = await Promise.all(
      batchStarts.map((s) => hiveClient.database.getAccountHistory(username, s, pageSize))
    );

    // Process pages sequentially to update start and count ops
    for (let i = 0; i < pages.length; i++) {
      const history = pages[i];
      if (!history.length) break;

      const oldestIndexInPage = history[0][0];
      start = Math.max(oldestIndexInPage - 1, pageSize - 1);

      const oldestTs = history[0][1].timestamp;
      const newestTs = history[history.length - 1][1].timestamp;
      const pageIdx = batchStartPage + i;

      if ((pageIdx + 1) % 10 === 0 || pageIdx === 0) {
        console.log(`[compute] @${username} page ${pageIdx + 1}/${maxPages} — ops ${scannedOps + 1}-${scannedOps + history.length} — time range ${oldestTs} … ${newestTs}`);
      }

      for (const [, item] of history) {
        scannedOps += 1;

        const ts = new Date(item.timestamp);
        if (Number.isNaN(ts.getTime())) continue;

        if (ts < from) {
          reachedBefore2025 = true;
          continue;
        }
        if (ts >= to) continue;

        const [opType, opValue] = item.op;
        const monthKey = `${ts.getFullYear()}-${String(ts.getMonth() + 1).padStart(2, '0')}`;

        if (opType === 'comment') {
          if (opValue && typeof opValue.parent_author === 'string') {
            if (opValue.parent_author.length === 0) {
              // Top-level post
              posts += 1;
              postsByMonth[monthKey] = (postsByMonth[monthKey] || 0) + 1;
              
              // Track posts per day (for streak) - use date string as key
              const dayKey = ts.toISOString().split('T')[0]; // YYYY-MM-DD
              postsByDay.set(dayKey, (postsByDay.get(dayKey) || 0) + 1);
              
              // Track tags from post metadata
              if (opValue.json_metadata) {
                try {
                  const metadata = JSON.parse(opValue.json_metadata);
                  if (metadata.tags && Array.isArray(metadata.tags)) {
                    metadata.tags.forEach(tag => {
                      if (typeof tag === 'string' && tag.length > 0) {
                        tagsUsed.add(tag);
                        topTags.set(tag, (topTags.get(tag) || 0) + 1);
                      }
                    });
                  }
                } catch (e) {
                  // Invalid JSON, ignore
                }
              }
            } else {
              // Reply/comment
              if (opValue.parent_author === username && opValue.author !== username) {
                // Comments received on your posts (from others)
                totalCommentsOnPosts += 1;
              }
              
              if (opValue.parent_author !== username) {
                // Reply/comment on someone else's post (exclude self-comments)
                comments += 1;
                const author = opValue.parent_author;
                topBuddies.set(author, (topBuddies.get(author) || 0) + 1);
              }
            }
          }
        }

        if (opType === 'vote') {
          const author = opValue?.author;
          const voter = opValue?.voter;
          const weight = opValue?.weight || 0;
          
          // Skip self-votes
          if (voter === username) continue;
          
          // Track votes received on your posts
          if (author === username && weight > 0) {
            totalVotesOnPosts += 1;
          }
          
          if (weight > 0) {
            votes += 1;
            if (author) {
              topVotedAuthors.set(author, (topVotedAuthors.get(author) || 0) + 1);
            }
          } else if (weight < 0) {
            downvotes += 1;
            if (author) {
              topDownvotedAuthors.set(author, (topDownvotedAuthors.get(author) || 0) + 1);
            }
          }
        }

        if (opType === 'author_reward') {
          rewardEvents += 1;
          addAsset(totals, opValue?.hbd_payout);
          addAsset(totals, opValue?.vests_payout);
        }

        if (opType === 'curation_reward') {
          rewardEvents += 1;
          addAsset(totals, opValue?.reward);
        }

        if (opType === 'claim_reward_balance') {
          claimEvents += 1;
        }
      }

      if (reachedBefore2025) break;
    }

    if (reachedBefore2025) break;
  }

  // Calculate story insights
  const busiestMonth = Object.entries(postsByMonth).sort((a, b) => b[1] - a[1])[0] || null;
  
  // Top 5 voted authors from Map (more memory efficient)
  const topVotedAuthorsList = Array.from(topVotedAuthors.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([author, count]) => ({ author, votes: count }));
  
  // Top 5 buddies from Map (more memory efficient)
  const topCommentedAuthors = Array.from(topBuddies.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([author, count]) => ({ author, comments: count }));
  
  const topDownvotedAuthor = Array.from(topDownvotedAuthors.entries())
    .sort((a, b) => b[1] - a[1])[0] || null;

  // Calculate new metrics
  const uniqueTagsCount = tagsUsed.size;
  const topCommunities = Array.from(topTags.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([tag, count]) => ({ community: tag, posts: count }));
  
  // Calculate posting streak
  const sortedDays = Array.from(postsByDay.keys()).sort();
  let longestStreak = 0;
  let currentStreak = 0;
  let prevDay = null;
  
  for (const day of sortedDays) {
    const dayDate = new Date(day);
    if (!prevDay) {
      currentStreak = 1;
    } else {
      const prevDate = new Date(prevDay);
      const diffDays = Math.floor((dayDate - prevDate) / (1000 * 60 * 60 * 24));
      if (diffDays === 1) {
        currentStreak += 1;
      } else {
        currentStreak = 1;
      }
    }
    longestStreak = Math.max(longestStreak, currentStreak);
    prevDay = day;
  }
  
  console.log(`[compute] Finished scan for @${username} — total ops: ${scannedOps}, posts: ${posts}, votes: ${votes}`);
  console.log(`[compute] Totals — HBD: ${totals.hbd}, VESTS: ${totals.vests}`);

  const totalHp = totals.vests * vestsToHpRatio;
  console.log(`[compute] Total HP: ${totalHp}`);
  
  // Calculate averages (now that totalHp is available)
  const avgVotesPerPost = posts > 0 ? Math.round((totalVotesOnPosts / posts) * 10) / 10 : 0;
  const avgCommentsPerPost = posts > 0 ? Math.round((totalCommentsOnPosts / posts) * 10) / 10 : 0;
  const rewardEfficiency = posts > 0 ? Math.round((totalHp / posts) * 100) / 100 : 0;

  return {
    username,
    from: from.toISOString(),
    to: to.toISOString(),
    scannedOps,
    posts,
    comments,
    votes,
    downvotes,
    rewardEvents,
    claimEvents,
    totalHbd: totals.hbd,
    totalHp,
    // Story insights
    busiestMonth: busiestMonth ? { month: busiestMonth[0], posts: busiestMonth[1] } : null,
    topVotedAuthors: topVotedAuthorsList,
    topCommentedAuthors,
    topDownvotedAuthor: topDownvotedAuthor ? { author: topDownvotedAuthor[0], downvotes: topDownvotedAuthor[1] } : null,
    // New metrics
    uniqueTagsCount,
    topCommunities,
    longestStreak,
    avgVotesPerPost,
    avgCommentsPerPost,
    rewardEfficiency,
  };
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
        VALUES ($1, $2, $3, now() + interval '15 minutes', $4::jsonb)
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
        VALUES ($1, $2, $3, now() + interval '15 minutes', $4::jsonb)
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
