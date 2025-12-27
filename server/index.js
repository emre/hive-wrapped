import express from 'express';
import { hiveClient } from './utils.js';
import {
  ensureTables as migrate,
  enqueueJob,
  getJobStatus as getJob,
} from './database.js';
import {
  enqueueOrGetJob,
  getWrappedStats,
} from './api.js';
import { computeWrapped } from './compute.js';
import { withDb, normalizeUsername } from './utils.js';

const app = express();

app.use(express.json());

const PORT = Number(process.env.API_PORT || 8787);

app.get('/api/health', async (_req, res) => {
  try {
    await withDb((db) => db.query('SELECT 1'));
    res.json({ ok: true, queue: 'postgres' });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

// Validate username exists on Hive
app.post('/api/validate-username', async (req, res) => {
  const username = normalizeUsername(req.body?.username);
  if (!username) return res.status(400).json({ error: 'Missing username' });

  try {
    const accounts = await hiveClient.database.getAccounts([username]);
    if (accounts.length === 0) {
      return res.json({ valid: false, error: 'User not found on Hive' });
    }
    return res.json({ valid: true, username });
  } catch (e) {
    return res.status(500).json({ error: String(e?.message || e) });
  }
});

app.post('/api/wrapped/jobs', async (req, res) => {
  const username = normalizeUsername(req.body?.username);
  if (!username) return res.status(400).json({ error: 'Missing username' });

  try {
    const out = await enqueueOrGetJob(username);
    return res.json(out);
  } catch (e) {
    return res.status(500).json({ error: String(e?.message || e) });
  }
});

app.post('/api/wrapped/stats', async (req, res) => {
  const username = normalizeUsername(req.body?.username);
  if (!username) return res.status(400).json({ error: 'Missing username' });

  try {
    const result = await getWrappedStats(username);
    return res.json(result);
  } catch (e) {
    return res.status(500).json({ error: String(e?.message || e) });
  }
});

app.get('/api/wrapped/jobs/:jobId', async (req, res) => {
  const jobId = String(req.params.jobId);
  
  // Handle cached job IDs
  if (jobId.startsWith('cached-')) {
    // Extract username from the cache or return a done status
    try {
      // For cached jobs, we can't track the original request, so return done
      // The frontend should have already received the result
      return res.json({
        id: jobId,
        status: 'done',
        result: null, // Frontend already has the result
        username: 'cached',
      });
    } catch (e) {
      return res.status(500).json({ error: String(e?.message || e) });
    }
  }
  
  try {
    const job = await getJob(jobId);
    if (!job) return res.status(404).json({ error: 'Job not found' });
    return res.json(job);
  } catch (e) {
    return res.status(500).json({ error: String(e?.message || e) });
  }
});

app.get('/api/wrapped', async (req, res) => {
  const username = normalizeUsername(req.query.username);
  if (!username) return res.status(400).json({ error: 'Missing username' });

  try {
    const cached = await getCached(username);
    if (cached) return res.json(cached);
    const data = await computeWrapped(username);
    await upsertCache(username, data);

    res.json(data);
  } catch (e) {
    res.status(500).json({ error: String(e?.message || e) });
  }
});

migrate()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`API server listening on http://localhost:${PORT}`);
    });
  })
  .catch((e) => {
    console.error(String(e?.message || e));
    process.exit(1);
  });
