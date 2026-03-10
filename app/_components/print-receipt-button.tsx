'use client';

export default function PrintReceiptButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="bg-indigo-600 text-white px-4 py-2 rounded shadow hover:bg-indigo-700 font-bold text-sm transition-colors cursor-pointer inline-block"
    >
      Print / Save PDF
    </button>
  );
}
