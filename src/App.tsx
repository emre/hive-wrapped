import { useMemo, useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Link } from 'react-router-dom';
import { BadgeCheck, Loader2, Home } from 'lucide-react';
import { fetchHiveWrapped2025, validateUsername, type HiveWrappedStats } from './services/hive';
import logo from './assets/logo.png';
import Story from './components/Story';
import UserPage from './components/UserPage';

function HomePage() {
  const [username, setUsername] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const header = useMemo(() => {
    const u = username.trim().replace(/^@/, '');
    return u ? `@${u}` : 'Hive Wrapped 2025';
  }, [username]);

  async function onFetch() {
    setError(null);
    
    const cleanUsername = username.trim().replace(/^@/, '');
    if (!cleanUsername) {
      setError('Please enter a Hive username');
      return;
    }

    setLoading(true);
    try {
      // First validate username exists
      const validation = await validateUsername(cleanUsername);
      if (!validation.valid) {
        setError(validation.error || 'Invalid username');
        return;
      }

      // Redirect to user page with processing
      window.location.href = `/${validation.username}`;
    } catch (e: any) {
      setError(e?.message ?? 'Failed to validate username');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-hive-black to-hive-black text-white">
      <div className="mx-auto max-w-5xl px-6 py-10">
        <div className="flex items-center gap-3">
          <img src={logo} alt="Hive Wrapped 2025" className="w-10 h-10" />
          <h1 className="text-2xl font-bold">{header}</h1>
        </div>

        <div className="mt-16 text-center">
          <img src={logo} alt="Hive Wrapped 2025" className="w-32 h-32 mx-auto mb-8" />
          <h2 className="text-5xl font-bold mb-4">Hive Wrapped 2025</h2>
          <p className="text-hive-grey text-lg mb-8 max-w-2xl mx-auto">
            Discover your Hive journey in 2025. See your top posts, engagement, rewards, and more in an interactive story format.
          </p>

          <div className="max-w-md mx-auto">
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="Enter your Hive username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && onFetch()}
                className="flex-1 px-4 py-3 bg-hive-grey/20 border border-hive-grey/30 rounded-lg text-white placeholder-hive-grey focus:outline-none focus:border-hive-red"
              />
              <button
                onClick={onFetch}
                disabled={loading}
                className="px-6 py-3 bg-hive-red rounded-lg hover:bg-hive-red/80 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <BadgeCheck className="w-4 h-4" />}
                {loading ? 'Validating...' : 'Generate'}
              </button>
            </div>

            {error && (
              <div className="mt-4 p-3 bg-red-500/20 border border-red-500/50 rounded-lg text-red-300 text-sm">
                {error}
              </div>
            )}
          </div>

          <div className="mt-16 text-hive-grey text-sm">
            <p>Processing takes 2-5 minutes depending on your activity.</p>
            <p className="mt-2">Your data is processed securely and temporarily cached.</p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/:username" element={<UserPage />} />
      </Routes>
    </Router>
  );
}
