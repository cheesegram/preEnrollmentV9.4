function Panel({ children, className = "" }) {
  return (
    <div className={`rounded-xl border border-slate-200 bg-white  ${className}`}>
      {children}
    </div>
  );
}

export default Panel;
