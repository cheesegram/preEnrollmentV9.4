function SelectField({ label, value, onChange, options = [], className = "" }) {
  return (
    <label className={`flex flex-col gap-2 text-sm font-semibold text-slate-700 ${className}`}>
      <span>{label}</span>
      <select
        value={value}
        onChange={onChange}
        className="h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-medium text-slate-800 outline-none transition focus:border-emerald-700 focus:ring-2 focus:ring-emerald-700/15"
      >
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </label>
  );
}

export default SelectField;