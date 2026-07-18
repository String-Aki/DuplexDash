/**
 * ProgressBar component
 * Renders a labeled progress bar with optional color thresholds and animated fill.
 */
export default function ProgressBar({ label, value, max, unit = '', colorMode = 'default' }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;

  const getColor = () => {
    if (colorMode === 'ink') {
      if (pct > 50) return 'from-green-500 to-green-400';
      if (pct > 20) return 'from-yellow-500 to-yellow-400';
      return 'from-red-600 to-red-400';
    }
    if (colorMode === 'paper') {
      if (pct > 40) return 'from-[--color-brand-600] to-[--color-brand-400]';
      if (pct > 15) return 'from-yellow-600 to-yellow-400';
      return 'from-red-600 to-red-400';
    }
    return 'from-[--color-brand-600] to-[--color-brand-400]';
  };

  const getTrackGlow = () => {
    if (colorMode === 'ink') {
      if (pct > 50) return 'shadow-green-900/50';
      if (pct > 20) return 'shadow-yellow-900/50';
      return 'shadow-red-900/50';
    }
    return 'shadow-[--color-brand-900]/50';
  };

  return (
    <div className="w-full">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-semibold text-white/80">{label}</span>
        <span className="text-sm font-bold text-white">
          {value.toLocaleString()}{unit}
          <span className="text-white/40 font-normal text-xs ml-1">/ {max.toLocaleString()}{unit}</span>
        </span>
      </div>
      <div className="relative h-3 rounded-full bg-white/8 overflow-hidden">
        <div
          className={`h-full rounded-full bg-gradient-to-r ${getColor()} shadow-lg ${getTrackGlow()}
            transition-all duration-700 ease-out`}
          style={{ width: `${pct}%` }}
        >
          {/* Animated shimmer */}
          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent
            animate-[shimmer_2s_ease-in-out_infinite]
            [background-size:200%_100%]" />
        </div>
      </div>
      <div className="flex justify-between mt-1">
        <span className="text-xs text-white/30">{pct.toFixed(0)}% remaining</span>
        {pct < 20 && (
          <span className="text-xs font-semibold text-red-400 animate-pulse">⚠ Low</span>
        )}
      </div>
    </div>
  );
}
