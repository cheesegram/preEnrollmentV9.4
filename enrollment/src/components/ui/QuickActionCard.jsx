function QuickActionCard({ icon, title, description, onClick, disabled = false }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled}
      className="group flex w-full items-center gap-4 rounded-xl border border-slate-200 bg-white p-5 text-left transition-colors hover:border-[#72916d] hover:bg-[#f8faf7] disabled:cursor-not-allowed disabled:opacity-60">
      <i className={`${icon} shrink-0 text-lg text-[#2E522A]`} aria-hidden="true" />
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold text-slate-900">{title}</span>
        <span className="mt-1 block text-sm leading-5 text-slate-500">{description}</span>
      </span>
      <i className="fa-solid fa-arrow-right shrink-0 text-xs text-[#52754c]" aria-hidden="true" />
    </button>
  );
}
export default QuickActionCard;
