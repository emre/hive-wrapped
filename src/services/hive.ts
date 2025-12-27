export interface HiveWrappedStats {
  username: string;
  from: string;
  to: string;
  scannedOps: number;
  posts: number;
  comments: number;
  votes: number;
  downvotes: number;
  rewardEvents: number;
  claimEvents: number;
  totalHbd: number;
  totalHp: number;
  busiestMonth?: { month: string; posts: number } | null;
  topVotedAuthors?: Array<{ author: string; votes: number }>;
  topCommentedAuthors?: Array<{ author: string; comments: number }>;
  topDownvotedAuthor?: { author: string; downvotes: number } | null;
  uniqueTagsCount: number;
  topCommunities?: Array<{ community: string; posts: number }>;
  longestStreak: number;
  avgVotesPerPost: number;
  avgCommentsPerPost: number;
  hpEfficiency: number;
  hbdEfficiency: number;
  totalReceivedVotes: number;
  totalOutgoingVotes: number;
  snapPostsCount: number;
  witnessVotes: number;
  proposalVotes: number;
  totalGovernanceActions: number;
  witnessHp: number;
  witnessHbd: number;
  blocksProduced: number;
};

type WrappedJob = {
  id: string;
  username: string;
  status: 'queued' | 'running' | 'done' | 'error';
  createdAt?: number;
  startedAt?: number;
  finishedAt?: number;
  result?: HiveWrappedStats;
  error?: string;
};

async function sleep(ms: number) {
  await new Promise((r) => setTimeout(r, ms));
}

export async function validateUsername(username: string): Promise<{ valid: boolean; username?: string; error?: string }> {
  try {
    const response = await fetch('/api/validate-username', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username }),
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || 'Validation failed');
    }

    return data;
  } catch (e: any) {
    throw new Error(e?.message || 'Failed to validate username');
  }
}

export async function fetchHiveWrapped2025(usernameRaw: string): Promise<HiveWrappedStats> {
  const username = usernameRaw.trim().replace(/^@/, '');
  if (!username) throw new Error('Please enter a Hive username.');

  const startRes = await fetch('/api/wrapped/jobs', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username }),
  });

  if (!startRes.ok) {
    let msg = `Request failed (${startRes.status})`;
    try {
      const body = await startRes.json();
      if (body?.error) msg = String(body.error);
    } catch {
      // ignore
    }
    throw new Error(msg);
  }

  const started = (await startRes.json()) as { jobId: string | null; status: string; result?: HiveWrappedStats; error?: string };
  if (started.status === 'done' && started.result) return started.result;
  if (started.status === 'cached' && started.result) return started.result;
  if (!started.jobId) throw new Error(started.error || 'Job could not be started');

  const jobId = started.jobId;
  const deadline = Date.now() + 5 * 60_000;

  while (Date.now() < deadline) {
    const jobRes = await fetch(`/api/wrapped/jobs/${encodeURIComponent(jobId)}`);
    if (!jobRes.ok) {
      let msg = `Request failed (${jobRes.status})`;
      try {
        const body = await jobRes.json();
        if (body?.error) msg = String(body.error);
      } catch {
        // ignore
      }
      throw new Error(msg);
    }

    const job = (await jobRes.json()) as WrappedJob;
    if (job.status === 'done' && job.result) return job.result;
    if (job.status === 'error') throw new Error(job.error || 'Job failed');
    await sleep(1250);
  }

  throw new Error(`Timed out while generating Wrapped (jobId: ${jobId}). The job may still be running; try again in a bit.`);
}
