import { useState } from 'react';
import { X, Save } from 'lucide-react';
import { updateSettings } from '../api/api.js';

export default function SettingsModal({ currentStats, onClose, onSaved }) {
  const [priceBW, setPriceBW]  = useState(currentStats?.pricePerPageBWLKR ?? 10);
  const [priceColor, setPriceColor]  = useState(currentStats?.pricePerPageColorLKR ?? 25);
  const [paper, setPaper]  = useState(currentStats?.paperInventory ?? 500);
  const [ink, setInk]      = useState(currentStats?.inkLevel ?? 100);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved]   = useState(false);

  const handleSave = async () => {
    setSaving(true);
    await updateSettings({
      lkr_price_per_page_bw: Number(priceBW),
      lkr_price_per_page_color: Number(priceColor),
      paper_inventory: Number(paper),
      ink_level: Number(ink),
    });
    setSaving(false);
    setSaved(true);
    setTimeout(() => { setSaved(false); onSaved?.(); onClose(); }, 800);
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

      {/* Sheet */}
      <div className="relative w-full max-w-sm bg-[--color-surface-800] border border-white/10
        rounded-3xl shadow-2xl p-6 space-y-5 animate-[slideUp_0.25s_ease-out]">

        {/* Header */}
        <div className="flex items-center justify-between">
          <h2 className="font-bold text-lg text-white">Settings</h2>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-white/8 hover:bg-white/15 flex items-center justify-center transition-colors">
            <X className="w-4 h-4 text-white/70" />
          </button>
        </div>

        {/* Fields */}
        <div className="grid grid-cols-2 gap-3">
          <Field label="B&W Price (LKR ₨)" id="setting-price-bw">
            <Input id="setting-price-bw" type="number" value={priceBW} onChange={setPriceBW} min="0" step="0.5" />
          </Field>
          <Field label="Color Price (LKR ₨)" id="setting-price-color">
            <Input id="setting-price-color" type="number" value={priceColor} onChange={setPriceColor} min="0" step="0.5" />
          </Field>
        </div>

        <Field label="Paper Inventory (sheets)" id="setting-paper">
          <Input id="setting-paper" type="number" value={paper} onChange={setPaper} min="0" />
        </Field>

        <Field label="Ink Level (%)" id="setting-ink">
          <Input id="setting-ink" type="number" value={ink} onChange={setInk} min="0" max="100" step="0.1" />
        </Field>

        {/* Save button */}
        <button
          id="settings-save-btn"
          onClick={handleSave}
          disabled={saving || saved}
          className={`w-full py-3.5 rounded-xl font-bold text-sm flex items-center justify-center gap-2
            transition-all duration-200
            ${saved
              ? 'bg-green-500 text-white'
              : 'bg-gradient-to-br from-[--color-brand-500] to-[--color-brand-700] text-white hover:from-[--color-brand-400] active:scale-95'
            }`}
        >
          <Save className="w-4 h-4" />
          {saved ? 'Saved!' : saving ? 'Saving…' : 'Save Settings'}
        </button>
      </div>
    </div>
  );
}

function Field({ label, id, children }) {
  return (
    <div>
      <label htmlFor={id} className="block text-xs font-semibold text-white/60 uppercase tracking-wider mb-1.5">{label}</label>
      {children}
    </div>
  );
}

function Input({ id, type, value, onChange, ...rest }) {
  return (
    <input
      id={id}
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full bg-[--color-surface-700] border border-white/10 rounded-xl px-4 py-2.5
        text-white text-sm font-medium outline-none
        focus:border-[--color-brand-500]/60 focus:ring-2 focus:ring-[--color-brand-500]/20
        transition-all"
      {...rest}
    />
  );
}
