import { useState } from 'react';
import { FileText, Layers, Clock, CheckCircle2, XCircle, RefreshCw, Loader2, Printer, Lock } from 'lucide-react';

const STATUS_CONFIG = {
  pending: { label: 'Pending', bg: 'bg-brand-500/15', text: 'text-brand-400', dot: 'bg-brand-500', icon: Clock },
  waiting_for_flip: { label: 'Waiting Flip', bg: 'bg-orange-500/15', text: 'text-orange-400', dot: 'bg-orange-500', icon: RefreshCw },
  printed: { label: 'Printed', bg: 'bg-green-500/15', text: 'text-green-400', dot: 'bg-green-500', icon: CheckCircle2 },
  failed: { label: 'Failed', bg: 'bg-red-500/15', text: 'text-red-400', dot: 'bg-red-500', icon: XCircle },
};

function formatTime(iso) {
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min}m ago`;
  return `${Math.floor(min / 60)}h ago`;
}

export default function QueueCard({ job, onPrint, isLocked = false, queuePosition }) {
  const [printing, setPrinting] = useState(false);
  const physicalSheets = Math.ceil(job.printed_pages / 2);
  const cfg = STATUS_CONFIG[job.status] ?? STATUS_CONFIG.pending;
  const Icon = cfg.icon;
  const canPrint = job.status === 'pending' && !isLocked;

  const handlePrint = async () => {
    if (printing) return;          // hard guard — ignore extra clicks
    setPrinting(true);
    try {
      await onPrint(job.id);       // waits for POST + queue refresh
    } finally {
      setPrinting(false);          // re-enables only if job somehow stays pending
    }
  };

  return (
    <div className={`relative rounded-2xl border transition-all duration-300 overflow-hidden
      ${canPrint
        ? 'bg-[--color-surface-800] border-white/8 hover:border-[--color-brand-500]/40 hover:bg-[--color-surface-700]'
        : 'bg-[--color-surface-900] border-white/5 opacity-70'
      }`}>

      {/* Top color accent */}
      <div className={`h-0.5 w-full ${job.status === 'pending' ? 'bg-gradient-to-r from-[--color-brand-500] to-[--color-brand-700]' :
          job.status === 'waiting_for_flip' ? 'bg-gradient-to-r from-orange-500 to-orange-700' :
            job.status === 'printed' ? 'bg-gradient-to-r from-green-500 to-green-700' :
              'bg-gradient-to-r from-red-500 to-red-700'
        }`} />

      <div className="p-4 flex gap-4 items-start">
        {/* PDF Icon / Thumbnail placeholder */}
        <div className="flex-shrink-0 w-14 h-16 rounded-xl bg-[--color-surface-700] border border-white/8
          flex flex-col items-center justify-center gap-1 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-4 h-4 bg-[--color-surface-600]
            clip-path-[polygon(100%_0,100%_100%,0_100%)] rounded-bl" />
          <FileText className="w-6 h-6 text-[--color-brand-400]" />
          <span className="text-[9px] font-bold text-white/40 uppercase tracking-wider">PDF</span>
        </div>

        {/* Job Info */}
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-sm text-white truncate pr-2" title={job.filename}>
            {job.filename}
          </p>
          <p className="text-xs text-white/40 mt-0.5">{formatTime(job.created_at)}</p>

          {/* Stats row */}
          <div className="flex items-center gap-3 mt-2.5 flex-wrap">
            <Pill icon="📄" label={`${job.printed_pages} pages`} />
            <Pill icon={<Layers className="w-3 h-3" />} label={`${physicalSheets} sheets`} highlight />
          </div>
        </div>

        {/* Right: Status + Action */}
        <div className="flex flex-col items-end gap-2 flex-shrink-0">
          {/* Status badge */}
          <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider ${cfg.bg} ${cfg.text}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot} animate-pulse`} />
            {cfg.label}
          </span>

          {canPrint ? (
            <button
              id={`print-btn-${job.id}`}
              onClick={handlePrint}
              disabled={printing}
              className={`group mt-1 px-4 py-2 text-xs font-bold rounded-xl
                transition-all duration-300 shadow-lg relative overflow-hidden
                text-white uppercase tracking-wider
                flex items-center gap-1.5
                ${printing
                  ? 'bg-[--color-surface-600] cursor-not-allowed opacity-70 scale-95'
                  : 'bg-gradient-to-br from-[--color-brand-500] to-[--color-brand-700] hover:shadow-xl hover:shadow-[--color-brand-500]/30 hover:-translate-y-0.5 active:scale-95 active:translate-y-0'
                }`}
            >
              {/* Subtle animated shine effect on hover */}
              {!printing && (
                <div className="absolute inset-0 -translate-x-[150%] bg-gradient-to-r from-transparent via-white/20 to-transparent group-hover:animate-[shimmer_1.5s_infinite]" />
              )}

              <span className="relative flex items-center gap-1.5">
                {printing ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    Printing…
                  </>
                ) : (
                  <>
                    <Printer className="w-3.5 h-3.5 transition-transform duration-300 group-hover:scale-110 group-hover:-rotate-6" />
                    Print
                  </>
                )}
              </span>
            </button>
          ) : job.status === 'pending' ? (
            <div className="mt-1 px-3 py-1.5 rounded-xl bg-[--color-surface-900] border border-white/5 flex items-center gap-1.5 text-white/30 shadow-inner">
               <Lock className="w-3.5 h-3.5" />
               <span className="text-[10px] font-bold uppercase tracking-wider">Pos #{queuePosition}</span>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function Pill({ icon, label, highlight = false }) {
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-lg
      ${highlight
        ? 'bg-[--color-brand-500]/20 text-[--color-brand-300]'
        : 'bg-white/5 text-white/50'}`}>
      <span className="text-[10px]">{icon}</span>
      {label}
    </span>
  );
}