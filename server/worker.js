import {
  ensureTables as migrate,
  claimJob as claimNextJob,
  completeJob,
  failJob,
} from './database.js';
import { computeWrapped } from './compute.js';

let running = false;
let timer = null;

async function runOnce() {
  if (running) return;
  running = true;
  try {
    while (true) {
      const job = await claimNextJob();
      if (!job) break;
            console.log('[worker] claimNextJob returned:', job);


      console.log(`[worker] Claimed job ${job.id} for username: ${job.username}`);
      try {
        const result = await computeWrapped(job.username);
        console.log(`[worker] Completed job ${job.id} for ${job.username} — posts:${result.posts} votes:${result.votes} scannedOps:${result.scannedOps}`);
        await completeJob(job.id, result, job.username, job.period_from, job.period_to);
      } catch (e) {
        console.error(`[worker] Failed job ${job.id} for ${job.username}:`, e?.message || e);
        await failJob(job.id, e);
      }
    }
  } finally {
    running = false;
  }
}

function startLoop() {
  if (timer) return;
  timer = setInterval(() => {
    runOnce();
  }, 300);
  runOnce();
}

function stopLoop() {
  if (!timer) return;
  clearInterval(timer);
  timer = null;
}

async function main() {
  console.log('[worker] DATABASE_URL:', process.env.DATABASE_URL || 'fallback default');
  await migrate();
  startLoop();
  console.log('Worker started');
}

process.on('SIGINT', () => {
  stopLoop();
  process.exit(0);
});

process.on('SIGTERM', () => {
  stopLoop();
  process.exit(0);
});

main().catch((e) => {
  console.error(String(e?.message || e));
  process.exit(1);
});
