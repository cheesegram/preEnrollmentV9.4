function LoadingState({ label = "Loading data..." }) {
  return (
    <div className="flex min-h-64 flex-col gap-5 p-5 sm:p-6" role="status" aria-live="polite">
      <p className="text-sm text-slate-500">{label}</p>
      <div className="space-y-4" aria-hidden="true">
        {[0, 1, 2, 3].map((row) => (
          <div key={row} className="grid grid-cols-[1fr_2fr_1fr] gap-6 border-b border-slate-100 pb-4">
            <span className="h-3 w-3/4 rounded bg-slate-100" />
            <span className="h-3 rounded bg-slate-100" />
            <span className="h-3 w-1/2 rounded bg-slate-100" />
          </div>
        ))}
      </div>
    </div>
  );
}
export default LoadingState;
