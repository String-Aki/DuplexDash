import { useState, useEffect, useCallback } from 'react';
import QueuePage from './pages/QueuePage.jsx';
import AnalyticsPage from './pages/AnalyticsPage.jsx';
import FlipLockScreen from './components/FlipLockScreen.jsx';
import { getQueue, triggerPrint } from './api/api.js';
import { Printer, BarChart3, Wifi, WifiOff } from 'lucide-react';

const TABS = [
  { id: 'queue', label: 'Print Queue', icon: Printer },
  { id: 'analytics', label: 'Analytics', icon: BarChart3 },
];

export default function App() {
  const [activeTab, setActiveTab] = useState('queue');
  const [jobs, setJobs] = useState([]);
  const [isMock, setIsMock] = useState(false);
  const [loading, setLoading] = useState(true);

  const flipJob = jobs.find((j) => j.status === 'waiting_for_flip');

  const fetchQueue = useCallback(async () => {
    const data = await getQueue();
    if (data?.success) {
      setJobs(data.jobs ?? []);
      setIsMock(!!data._mock);
    }
    setLoading(false);
  }, []);

  // Poll queue every 3s — recovers Flip state across browser reloads
  useEffect(() => {
    fetchQueue();
    const id = setInterval(fetchQueue, 3000);
    return () => clearInterval(id);
  }, [fetchQueue]);

  const handlePrint = async (jobId) => {
    await triggerPrint(jobId);
    await fetchQueue();
  };

  return (
    <div className="min-h-screen bg-[--color-surface-950] text-white font-sans antialiased select-none">
      {/* Full-screen Flip Lock — renders above everything */}
      {flipJob && <FlipLockScreen job={flipJob} onConfirm={handlePrint} />}

      {/* ── Header ── */}
      <header className="sticky top-0 z-40 bg-[--color-surface-900]/90 backdrop-blur-md border-b border-white/5 px-4 py-3">
        <div className="max-w-2xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[--color-brand-500] to-[--color-brand-700] flex items-center justify-center">
              <Printer className="w-4 h-4 text-white" />
            </div>
            <span className="font-bold text-lg tracking-tight">DuplexDash</span>
          </div>
          {/* Connection badge */}
          <div className={`flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full font-medium
            ${isMock
              ? 'bg-yellow-500/15 text-yellow-400 border border-yellow-500/20'
              : 'bg-green-500/15 text-green-400 border border-green-500/20'}`}>
            {isMock ? <WifiOff className="w-3 h-3" /> : <Wifi className="w-3 h-3" />}
            {isMock ? 'Demo Mode' : 'Live'}
          </div>
        </div>
      </header>

      {/* ── Tab Bar ── */}
      <nav className="sticky top-[57px] z-30 bg-[--color-surface-900]/80 backdrop-blur-md border-b border-white/5">
        <div className="max-w-2xl mx-auto flex">
          {TABS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              id={`tab-${id}`}
              onClick={() => setActiveTab(id)}
              className={`flex-1 flex items-center justify-center gap-2 py-3 text-sm font-medium transition-all duration-200 relative
                ${activeTab === id
                  ? 'text-[--color-brand-400]'
                  : 'text-white/40 hover:text-white/70'}`}
            >
              <Icon className="w-4 h-4" />
              {label}
              {activeTab === id && (
                <span className="absolute bottom-0 left-4 right-4 h-0.5 rounded-full bg-[--color-brand-500]" />
              )}
            </button>
          ))}
        </div>
      </nav>

      {/* ── Page Content ── */}
      <main className="max-w-2xl mx-auto px-4 py-5">
        {activeTab === 'queue' && (
          <QueuePage jobs={jobs} loading={loading} onPrint={handlePrint} onRefresh={fetchQueue} />
        )}
        {activeTab === 'analytics' && <AnalyticsPage />}
      </main>
    </div>
  );
}
