import { useState } from 'react';
import { Layers, RefreshCw, CheckCheck } from 'lucide-react';

/**
 * FlipLockScreen
 * Full-screen blocking overlay shown when a job is in 'waiting_for_flip' state.
 * The user must flip the paper and press the big button to continue printing.
 */
export default function FlipLockScreen({ job, onConfirm }) {
  const [confirming, setConfirming] = useState(false);
  const [success, setSuccess] = useState(false);
  const physicalSheets = Math.ceil(job.printed_pages / 2);

  const handleConfirm = async () => {
    if (confirming || success) return;
    setConfirming(true);
    try {
      await onConfirm(job.id);
      setSuccess(true);
    } finally {
      setConfirming(false);
    }
  };

  return (
    <div
      id="flip-lock-screen"
      className="fixed inset-0 z-[9999] flex flex-col items-center justify-center
        bg-gradient-to-b from-orange-950 via-[#1a0a00] to-[--color-surface-950]
        px-6 text-center"
    >
      {/* Pulsing glow */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2
          w-[400px] h-[400px] rounded-full
          bg-orange-500/20 blur-[120px] animate-pulse" />
      </div>

      {/* Content */}
      <div className="relative flex flex-col items-center gap-6 max-w-sm w-full">

        {/* Icon */}
        <div className="w-24 h-24 rounded-3xl bg-orange-500/20 border border-orange-500/30
          flex items-center justify-center
          shadow-2xl shadow-orange-900/50">
          <RefreshCw className="w-12 h-12 text-orange-400 animate-spin [animation-duration:3s]" />
        </div>

        {/* Title */}
        <div>
          <p className="text-orange-400 text-xs font-bold uppercase tracking-[0.3em] mb-2">
            Action Required
          </p>
          <h1 className="text-3xl font-black text-white leading-tight">
            Flip the Paper
          </h1>
          <p className="text-lg font-semibold text-orange-300 mt-1">
            &amp; Print Even Pages
          </p>
        </div>

        {/* Job info card */}
        <div className="w-full bg-white/5 border border-white/10 rounded-2xl p-4 text-left">
          <p className="text-xs text-white/50 mb-1 font-medium uppercase tracking-wider">Current Job</p>
          <p className="font-bold text-white truncate" title={job.filename}>{job.filename}</p>
          <div className="flex items-center gap-4 mt-3">
            <div className="flex items-center gap-1.5 text-sm text-orange-300">
              <Layers className="w-4 h-4" />
              <span className="font-semibold">{physicalSheets} sheets</span>
              <span className="text-white/30">to flip</span>
            </div>
            <div className="flex items-center gap-1.5 text-sm text-white/50">
              <span className="text-white/30">📄</span>
              <span>{job.printed_pages} pages total</span>
            </div>
          </div>
        </div>

        {/* Instructions */}
        <div className="w-full space-y-2">
          {[
            { n: '1', text: 'Remove printed pages from tray' },
            { n: '2', text: 'Flip the stack face-down' },
            { n: '3', text: 'Reload into the paper tray' },
            { n: '4', text: 'Press the button below' },
          ].map(({ n, text }) => (
            <div key={n} className="flex items-center gap-3 text-left">
              <span className="flex-shrink-0 w-6 h-6 rounded-full bg-orange-500/20 border border-orange-500/30
                text-orange-400 text-xs font-bold flex items-center justify-center">
                {n}
              </span>
              <span className="text-sm text-white/70">{text}</span>
            </div>
          ))}
        </div>

        {/* THE BIG BUTTON */}
        <button
          id="flip-confirm-btn"
          onClick={handleConfirm}
          disabled={confirming || success}
          className={`w-full py-6 rounded-2xl text-xl font-black uppercase tracking-wider
            transition-all duration-200 relative overflow-hidden
            shadow-2xl shadow-orange-900/70
            ${success
              ? 'bg-green-600 text-white shadow-green-900/70'
              : confirming
              ? 'bg-orange-800 text-orange-300 scale-95'
              : 'bg-gradient-to-b from-orange-400 to-orange-600 text-white active:scale-95 hover:from-orange-300 hover:to-orange-500'
            }`}
        >
          {/* Shine overlay */}
          {!confirming && !success && (
            <span className="absolute inset-0 bg-gradient-to-b from-white/20 to-transparent pointer-events-none" />
          )}
          <span className="relative flex items-center justify-center gap-3">
            {success ? (
              <>
                <CheckCheck className="w-6 h-6" />
                Success!
              </>
            ) : confirming ? (
              <>
                <RefreshCw className="w-6 h-6 animate-spin" />
                Sending Job…
              </>
            ) : (
              <>
                <CheckCheck className="w-6 h-6" />
                Done — Print Even Pages
              </>
            )}
          </span>
        </button>

        <p className="text-xs text-white/25 mt-2">
          Screen will unlock automatically after printing completes
        </p>
      </div>
    </div>
  );
}
