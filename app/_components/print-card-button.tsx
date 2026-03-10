'use client';

export default function PrintCardButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="px-6 py-3 rounded-xl bg-slate-900 text-white font-bold text-sm hover:bg-indigo-700 transition-colors"
    >
      Print Card
    </button>
  );
}
