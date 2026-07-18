/**
 * StatCard — Analytics metric display card
 */
export default function StatCard({ label, value, sub, icon, accent = 'brand', size = 'md' }) {
  const accentMap = {
    brand:   { text: 'text-[--color-brand-400]',  bg: 'bg-[--color-brand-500]/10',  border: 'border-[--color-brand-500]/15' },
    green:   { text: 'text-green-400',              bg: 'bg-green-500/10',             border: 'border-green-500/15' },
    red:     { text: 'text-red-400',                bg: 'bg-red-500/10',               border: 'border-red-500/15' },
    orange:  { text: 'text-orange-400',             bg: 'bg-orange-500/10',            border: 'border-orange-500/15' },
    purple:  { text: 'text-purple-400',             bg: 'bg-purple-500/10',            border: 'border-purple-500/15' },
  };
  const a = accentMap[accent] ?? accentMap.brand;

  return (
    <div className={`rounded-2xl bg-[--color-surface-800] border border-white/8 p-4
      hover:border-white/12 transition-all duration-200 relative overflow-hidden`}>
      {/* Background glow */}
      <div className={`absolute top-0 right-0 w-32 h-32 rounded-full ${a.bg} blur-2xl -translate-y-1/2 translate-x-1/2 pointer-events-none`} />

      <div className="relative">
        {/* Icon */}
        {icon && (
          <div className={`w-9 h-9 rounded-xl ${a.bg} border ${a.border} flex items-center justify-center mb-3`}>
            <span className={`text-lg ${a.text}`}>{icon}</span>
          </div>
        )}
        <p className="text-xs text-white/50 font-medium uppercase tracking-wider mb-1">{label}</p>
        <p className={`font-black ${size === 'lg' ? 'text-3xl' : 'text-2xl'} ${a.text} leading-none`}>{value}</p>
        {sub && <p className="text-xs text-white/40 mt-1.5 font-medium">{sub}</p>}
      </div>
    </div>
  );
}
