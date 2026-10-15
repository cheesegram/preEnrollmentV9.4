function StatCard({ label, value, caption, icon, featured = false, onClick }) {
  return (
    <button type="button" onClick={onClick}
      className={`group flex min-h-32 sm:min-h-36 w-full flex-col justify-between rounded-xl border p-4 sm:p-5 text-left transition-colors ${featured
        ? "border-[#1f5a3c] bg-[#1f5a3c] text-white hover:bg-[#174c35]"
        : "border-slate-200 bg-white text-slate-900 hover:border-[#72916d]"}`}>
      <span className="flex items-center justify-between gap-3">
        <span className={`text-sm font-medium ${featured ? "text-white/90" : "text-slate-600"}`}>{label}</span>
        <i className={`${icon} text-sm ${featured ? "text-white/80" : "text-[#52754c]"}`} aria-hidden="true" />
      </span>
      <span className="mt-4 flex items-end justify-between gap-2">
        <span>
          <span className="block text-3xl font-semibold tracking-tight tabular-nums">{value}</span>
          <span className={`mt-1 block text-xs ${featured ? "text-white/85" : "text-slate-500"}`}>{caption}</span>
        </span>
        <i className={`fa-solid fa-arrow-right text-xs ${featured ? "text-white/80" : "text-[#52754c]"}`} aria-hidden="true" />
      </span>
    </button>
  );
}
export default StatCard;
