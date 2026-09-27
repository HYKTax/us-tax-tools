export function Brand({
  compact = false,
  inverse = false,
}: {
  compact?: boolean;
  inverse?: boolean;
}) {
  return (
    <div className="flex items-center gap-3">
      <span
        aria-hidden="true"
        className="flex h-9 w-9 items-end justify-center gap-0.5 rounded-lg bg-white p-1.5 shadow-sm ring-1 ring-slate-200"
      >
        <span className="h-2 w-1.5 rounded-sm bg-blue-600" />
        <span className="h-4 w-1.5 rounded-sm bg-emerald-500" />
        <span className="h-6 w-1.5 rounded-sm bg-blue-700" />
      </span>
      {!compact && (
        <span className={`text-base font-semibold tracking-tight ${inverse ? "text-white" : "text-ink"}`}>
          Tax Preparer Tools
        </span>
      )}
    </div>
  );
}
