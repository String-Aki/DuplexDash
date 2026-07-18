import { useState, useEffect, useCallback } from 'react';
import StatCard from '../components/StatCard.jsx';
import ProgressBar from '../components/ProgressBar.jsx';
import SettingsModal from '../components/SettingsModal.jsx';
import { getStats } from '../api/api.js';
import { RefreshCw, Settings } from 'lucide-react';

const MAX_PAPER = 500; // Total ream capacity

const LKR = (amount) =>
  `₨ ${Math.round(amount).toLocaleString('en-LK')}`;

export default function AnalyticsPage() {
  const [stats, setStats]       = useState(null);
  const [loading, setLoading]   = useState(true);
  const [showSettings, setShowSettings] = useState(false);
  const [lastUpdated, setLastUpdated]   = useState(null);

  const fetchStats = useCallback(async () => {
    const data = await getStats();
    if (data?.success) {
      setStats(data.stats);
      setLastUpdated(new Date());
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchStats();
    const id = setInterval(fetchStats, 30000);
    return () => clearInterval(id);
  }, [fetchStats]);

  // Derived calculations
  const costPerPage     = 2.5;  // estimated LKR cost (paper + ink amortized)
  const totalCostLKR    = stats ? stats.totalPagesPrinted * costPerPage : 0;
  const netProfitLKR    = stats ? stats.totalRevenueLKR - totalCostLKR : 0;
  const isProfitable    = netProfitLKR >= 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">Analytics</h1>
          <p className="text-xs text-white/40 mt-0.5">
            {lastUpdated ? `Updated ${lastUpdated.toLocaleTimeString()}` : 'Loading…'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            id="analytics-refresh-btn"
            onClick={fetchStats}
            className="w-9 h-9 rounded-xl bg-white/5 border border-white/8 hover:bg-white/10
              flex items-center justify-center transition-colors"
          >
            <RefreshCw className={`w-4 h-4 text-white/60 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button
            id="analytics-settings-btn"
            onClick={() => setShowSettings(true)}
            className="w-9 h-9 rounded-xl bg-white/5 border border-white/8 hover:bg-white/10
              flex items-center justify-center transition-colors"
          >
            <Settings className="w-4 h-4 text-white/60" />
          </button>
        </div>
      </div>

      {/* Loading skeleton */}
      {loading && (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-24 rounded-2xl bg-[--color-surface-800] border border-white/5 animate-pulse" />
          ))}
        </div>
      )}

      {!loading && stats && (
        <>
          {/* ─── Financial Summary ─────────────────────── */}
          <section>
            <SectionTitle>💰 Financial Summary (LKR)</SectionTitle>
            <div className="grid grid-cols-2 gap-3">
              <StatCard
                label="Total Revenue"
                value={LKR(stats.totalRevenueLKR)}
                sub={`${stats.totalPagesPrinted.toLocaleString()} pages @ ₨${stats.pricePerPageLKR}/pg`}
                icon="📈"
                accent="green"
                size="lg"
              />
              <StatCard
                label="Total Cost"
                value={LKR(totalCostLKR)}
                sub={`Est. ₨${costPerPage}/page`}
                icon="📉"
                accent="red"
              />
            </div>

            {/* Net Profit — full width, prominent */}
            <div className={`mt-3 rounded-2xl border p-5 relative overflow-hidden
              ${isProfitable
                ? 'bg-green-950/60 border-green-500/20'
                : 'bg-red-950/60 border-red-500/20'}`}>
              <div className={`absolute top-0 right-0 w-40 h-40 rounded-full blur-3xl pointer-events-none
                ${isProfitable ? 'bg-green-500/10' : 'bg-red-500/10'} -translate-y-1/2 translate-x-1/2`} />
              <p className="text-xs text-white/50 uppercase tracking-wider font-semibold mb-1">Net Profit</p>
              <p className={`text-4xl font-black ${isProfitable ? 'text-green-400' : 'text-red-400'}`}>
                {isProfitable ? '' : '-'}{LKR(Math.abs(netProfitLKR))}
              </p>
              <p className="text-xs text-white/30 mt-1 font-medium">
                {isProfitable ? '✅ In the green' : '⚠ Operating at a loss'}
              </p>
            </div>
          </section>

          {/* ─── Inventory ─────────────────────────────── */}
          <section>
            <SectionTitle>📦 Inventory Status</SectionTitle>
            <div className="bg-[--color-surface-800] border border-white/8 rounded-2xl p-5 space-y-6">
              <ProgressBar
                label="Paper Inventory"
                value={stats.paperInventory}
                max={MAX_PAPER}
                unit=" sheets"
                colorMode="paper"
              />
              <ProgressBar
                label="Estimated Ink"
                value={parseFloat(stats.inkLevel.toFixed(1))}
                max={100}
                unit="%"
                colorMode="ink"
              />
            </div>
          </section>

          {/* ─── Additional KPIs ───────────────────────── */}
          <section>
            <SectionTitle>📊 Key Metrics</SectionTitle>
            <div className="grid grid-cols-2 gap-3">
              <StatCard
                label="Pages Printed"
                value={stats.totalPagesPrinted.toLocaleString()}
                sub="Total lifetime"
                icon="🖨️"
                accent="brand"
              />
              <StatCard
                label="Price / Page"
                value={`₨ ${stats.pricePerPageLKR}`}
                sub="Current rate"
                icon="🏷️"
                accent="purple"
              />
            </div>
          </section>
        </>
      )}

      {/* Settings Modal */}
      {showSettings && (
        <SettingsModal
          currentStats={stats}
          onClose={() => setShowSettings(false)}
          onSaved={fetchStats}
        />
      )}
    </div>
  );
}

function SectionTitle({ children }) {
  return (
    <h2 className="text-xs font-bold uppercase tracking-wider text-white/50 mb-3">{children}</h2>
  );
}
