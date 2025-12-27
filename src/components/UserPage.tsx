import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { BadgeCheck, Loader2, Home, XCircle, Clock, CheckCircle } from 'lucide-react';
import { fetchHiveWrapped2025, validateUsername, type HiveWrappedStats } from '../services/hive';
import logo from '../assets/logo.png';
import Story from './Story';

type JobStatus = 'queued' | 'running' | 'done' | 'error';

export default function UserPage() {
  const { username } = useParams<{ username: string }>();
  const navigate = useNavigate();
  const [status, setStatus] = useState<JobStatus>('queued');
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<HiveWrappedStats | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);

  useEffect(() => {
    if (!username) {
      navigate('/');
      return;
    }

    async function startJob() {
      try {
        const response = await fetch('/api/wrapped/jobs', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username }),
        });

        const data = await response.json();
        if (!response.ok) {
          throw new Error(data.error || 'Failed to start job');
        }

        setJobId(data.jobId);
        setStatus(data.status);

        if (data.status === 'done' && data.result) {
          setStats(data.result);
        } else if (data.status === 'cached' && data.result) {
          setStats(data.result);
        }
      } catch (e: any) {
        setError(e?.message || 'Failed to start processing');
      }
    }

    startJob();
  }, [username, navigate]);

  useEffect(() => {
    if (!jobId || status === 'done' || status === 'error') return;

    const interval = setInterval(async () => {
      try {
        const response = await fetch(`/api/wrapped/jobs/${jobId}`);
        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || 'Failed to check status');
        }

        setStatus(data.status);

        if (data.status === 'done' && data.result) {
          setStats(data.result);
          clearInterval(interval);
        } else if (data.status === 'error') {
          setError(data.error || 'Processing failed');
          clearInterval(interval);
        }
      } catch (e: any) {
        setError(e?.message || 'Failed to check status');
        clearInterval(interval);
      }
    }, 2000);

    return () => clearInterval(interval);
  }, [jobId, status]);

  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-hive-black to-hive-black text-white flex items-center justify-center">
        <div className="text-center">
          <XCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
          <h1 className="text-2xl font-bold mb-2">Processing Failed</h1>
          <p className="text-hive-grey mb-6">{error}</p>
          <button
            onClick={() => navigate('/')}
            className="px-6 py-2 bg-hive-red rounded-lg hover:bg-hive-red/80 transition-colors"
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  if (stats) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-hive-black to-hive-black text-white">
        <div className="mx-auto max-w-5xl px-6 py-10">
          <div className="flex items-center gap-3 mb-8">
            <a href="/" className="flex items-center gap-3 hover:opacity-80 transition-opacity">
              <img src={logo} alt="Hive Wrapped 2025" className="w-10 h-10" />
              <h1 className="text-2xl font-bold">Hive Wrapped 2025</h1>
            </a>
            <span className="text-hive-grey">|</span>
            <h2 className="text-2xl font-bold">@{stats.username}</h2>
          </div>
          <Story stats={stats} />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-hive-black to-hive-black text-white flex items-center justify-center">
      <div className="text-center">
        <div className="mb-8">
          <img src={logo} alt="Hive Wrapped 2025" className="w-32 h-32 mx-auto mb-4" />
          <h1 className="text-4xl font-bold mb-2">@{username}</h1>
          <p className="text-hive-grey">Hive Wrapped 2025</p>
        </div>

        <div className="rounded-3xl bg-white/5 backdrop-blur border border-white/10 p-8 w-full max-w-md">
          <div className="flex items-center justify-center mb-4">
            {status === 'queued' && <Clock className="w-8 h-8 text-yellow-500 animate-pulse" />}
            {status === 'running' && <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />}
            {status === 'done' && <CheckCircle className="w-8 h-8 text-green-500" />}
            {status === 'error' && <XCircle className="w-8 h-8 text-red-500" />}
          </div>

          <h2 className="text-xl font-semibold mb-2">
            {status === 'queued' && 'Queued for processing'}
            {status === 'running' && 'Processing your Hive data...'}
            {status === 'done' && 'Processing complete!'}
            {status === 'error' && 'Processing failed'}
          </h2>

          <p className="text-hive-grey text-sm">
            {status === 'queued' && 'Your request is in the queue. This usually takes a few minutes.'}
            {status === 'running' && 'Analyzing your posts, votes, rewards, and more. This may take several minutes.'}
            {status === 'done' && 'Preparing your wrapped story...'}
            {status === 'error' && 'Something went wrong while processing your data.'}
          </p>

          {status === 'running' && (
            <div className="mt-4">
              <div className="w-full bg-hive-grey/30 rounded-full h-2">
                <div className="bg-hive-red h-2 rounded-full animate-pulse" style={{ width: '60%' }} />
              </div>
            </div>
          )}
        </div>

        <div className="mt-8 text-hive-grey text-sm">
          <p>This may take 2-5 minutes depending on your activity.</p>
          <p>Please keep this tab open.</p>
        </div>
      </div>
    </div>
  );
}
