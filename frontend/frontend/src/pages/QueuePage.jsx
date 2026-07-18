import { RefreshCw, Inbox } from 'lucide-react';
import QueueCard from '../components/QueueCard.jsx';

export default function QueuePage({ jobs, loading, onPrint, onRefresh }) {
  const pendingJobs  = jobs.filter((j) => j.status === 'pending');
  const activeJobs   = jobs.filter((j) => j.status === 'waiting_for_flip');
  const doneJobs     = jobs.filter((j) => j.status === 'printed' || j.status === 'failed');

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">Print Queue</h1>
          <p className="text-xs text-white/40 mt-0.5">
            {loading ? 'Loading…' : `${pendingJobs.length} pending · polls every 3s`}
          </p>
        </div>
        <button
          id="queue-refresh-btn"
          onClick={onRefresh}
          className="w-9 h-9 rounded-xl bg-white/5 border border-white/8 hover:bg-white/10
            flex items-center justify-center transition-colors"
        >
          <RefreshCw className={`w-4 h-4 text-white/60 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Loading skeleton */}
      {loading && (
        <div className="space-y-3">
          {[1, 2].map((i) => (
            <div key={i} className="h-24 rounded-2xl bg-[--color-surface-800] border border-white/5 animate-pulse" />
          ))}
        </div>
      )}

      {/* Flip-waiting jobs (informational — lock screen handles interaction) */}
      {!loading && activeJobs.length > 0 && (
        <Section title="⏳ Waiting for Flip" badge={activeJobs.length} badgeColor="orange">
          {activeJobs.map((job) => <QueueCard key={job.id} job={job} onPrint={onPrint} />)}
        </Section>
      )}

      {/* Pending jobs */}
      {!loading && pendingJobs.length > 0 && (
        <Section title="🖨️ Ready to Print" badge={pendingJobs.length} badgeColor="brand">
          {pendingJobs.map((job) => <QueueCard key={job.id} job={job} onPrint={onPrint} />)}
        </Section>
      )}

      {/* Completed jobs */}
      {!loading && doneJobs.length > 0 && (
        <Section title="✅ Completed" collapsible>
          {doneJobs.map((job) => <QueueCard key={job.id} job={job} onPrint={onPrint} />)}
        </Section>
      )}

      {/* Empty state */}
      {!loading && jobs.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 gap-4">
          <div className="w-16 h-16 rounded-2xl bg-white/5 flex items-center justify-center">
            <Inbox className="w-8 h-8 text-white/20" />
          </div>
          <div className="text-center">
            <p className="font-semibold text-white/40">No jobs in queue</p>
            <p className="text-xs text-white/25 mt-1">Send a PDF via WhatsApp to get started</p>
          </div>
        </div>
      )}
    </div>
  );
}

function Section({ title, badge, badgeColor = 'brand', children, collapsible = false }) {
  const colorMap = {
    brand:  'bg-[--color-brand-500]/20 text-[--color-brand-400]',
    orange: 'bg-orange-500/20 text-orange-400',
  };
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <h2 className="text-xs font-bold uppercase tracking-wider text-white/50">{title}</h2>
        {badge !== undefined && (
          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${colorMap[badgeColor] ?? colorMap.brand}`}>
            {badge}
          </span>
        )}
      </div>
      <div className="space-y-3">{children}</div>
    </div>
  );
}
