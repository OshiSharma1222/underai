import type { Mismatch } from "@/lib/api";

function formatValue(v: string | number | string[] | null): string {
  if (v === null || v === undefined) return "—";
  if (Array.isArray(v)) return v.join(", ");
  return String(v);
}

export function SlipVsPolicyCard({ mismatch }: { mismatch: Mismatch }) {
  const isCritical = mismatch.severity === "critical";
  const isWarning = mismatch.severity === "warning";
  const isInfo = mismatch.severity === "info";

  const headerLabel = isInfo ? "Review note" : "Discrepancy found";
  const footerLabel = isCritical
    ? "Mismatch detected"
    : isWarning
      ? "Review recommended"
      : "For your review";

  const policyBg = isCritical
    ? "bg-rose-50 border-rose-100"
    : isWarning
      ? "bg-amber-50 border-amber-100"
      : "bg-slate-50 border-slate-200";

  const policyText = isCritical
    ? "text-rose-700"
    : isWarning
      ? "text-amber-800"
      : "text-slate-700";

  const footerClass = isCritical
    ? "text-rose-600 bg-rose-100"
    : isWarning
      ? "text-amber-700 bg-amber-100"
      : "text-slate-600 bg-slate-100";

  return (
    <div className="rounded-2xl border border-gray-100 bg-gray-50 p-4 space-y-3">
      <div className="flex justify-between items-center">
        <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">
          {headerLabel}
        </span>
        <span
          className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${
            isCritical
              ? "bg-rose-100 text-rose-600"
              : isWarning
                ? "bg-amber-100 text-amber-700"
                : "bg-slate-100 text-slate-600"
          }`}
        >
          {mismatch.severity}
        </span>
      </div>
      <p className="text-sm font-semibold text-gray-900">{mismatch.label}</p>
      <div className="flex gap-2 items-stretch">
        <div className="flex-1 bg-emerald-50 rounded-xl p-3 border border-emerald-100">
          <div className="text-[9px] font-bold text-emerald-600 uppercase mb-1">
            Slip
          </div>
          <div className="text-sm font-bold text-gray-900 break-words">
            {formatValue(mismatch.expected)}
          </div>
        </div>
        <div className="flex items-center text-[10px] font-bold text-gray-300">
          vs
        </div>
        <div className={`flex-1 rounded-xl p-3 border ${policyBg}`}>
          <div
            className={`text-[9px] font-bold uppercase mb-1 ${
              isCritical ? "text-rose-600" : isWarning ? "text-amber-600" : "text-slate-500"
            }`}
          >
            Policy
          </div>
          <div className={`text-sm font-bold break-words ${policyText}`}>
            {formatValue(mismatch.actual)}
          </div>
        </div>
      </div>
      {mismatch.note && (
        <p className="text-xs text-gray-500">{mismatch.note}</p>
      )}
      <div
        className={`text-center text-[10px] font-bold rounded-full py-1 ${footerClass}`}
      >
        {footerLabel}
      </div>
    </div>
  );
}
