import { enqueueJob, getJobStatus } from './database.js';

export async function enqueueOrGetJob(username, periodFrom = '2025-01-01', periodTo = '2026-01-01') {
  return enqueueJob(username, periodFrom, periodTo);
}

export async function getWrappedStats(username, periodFrom = '2025-01-01', periodTo = '2026-01-01') {
  const job = await enqueueOrGetJob(username, periodFrom, periodTo);
  
  if (job.status === 'cached' || job.status === 'done') {
    return job.result;
  }
  
  if (job.status === 'queued' || job.status === 'running') {
    // Poll for completion
    let attempts = 0;
    const maxAttempts = 120; // 2 minutes max
    
    while (attempts < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, 1000));
      const status = await getJobStatus(job.jobId);
      
      if (status?.status === 'done') {
        return status.result;
      }
      
      if (status?.status === 'error') {
        throw new Error(status.error_message || 'Job failed');
      }
      
      attempts++;
    }
    
    throw new Error('Job timed out');
  }
  
  throw new Error('Unexpected job status');
}
