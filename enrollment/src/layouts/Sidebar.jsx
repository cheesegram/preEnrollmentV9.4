import { useEffect, useRef, useState } from "react";
import { useNavigate, NavLink } from "react-router-dom";
import logo from "../assets/iitilogo.png";
import { navigationItems } from "../config/navigation";

function Sidebar({ open, onClose }) {
  const asideRef = useRef(null);
  const closeRef = useRef(onClose);
  const [desktop, setDesktop] = useState(() => window.matchMedia("(min-width: 1024px)").matches);
  useEffect(() => { closeRef.current = onClose; }, [onClose]);
  useEffect(() => {
    const media = window.matchMedia("(min-width: 1024px)");
    const update = () => setDesktop(media.matches);
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  useEffect(() => {
    if (!open || desktop) return undefined;
    const aside = asideRef.current;
    const previousFocus = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const controls = () => [...aside.querySelectorAll('a[href], button')].filter((element) => element.getClientRects().length);
    controls()[0]?.focus();
    const handleKeyDown = (event) => {
      if (event.key === "Escape") closeRef.current();
      if (event.key !== "Tab") return;
      const elements = controls();
      if (event.shiftKey && document.activeElement === elements[0]) {
        event.preventDefault(); elements.at(-1)?.focus();
      } else if (!event.shiftKey && document.activeElement === elements.at(-1)) {
        event.preventDefault(); elements[0]?.focus();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
      previousFocus?.focus();
    };
  }, [open, desktop]);

  const navigate = useNavigate();

  const handleLogout = () => {
    window.localStorage.removeItem("token");
    window.localStorage.removeItem("adminUser");
    navigate("/login", { replace: true });
  };

  const handleClose = (event) => {
    event?.preventDefault();
    event?.stopPropagation();
    onClose();
  };

  return (
    <>
      <button
        type="button"
        aria-label="Close navigation overlay"
        tabIndex={-1}
        aria-hidden="true"
        onClick={handleClose}
        className={`fixed inset-0 z-40 bg-slate-950/50  transition-opacity duration-200 lg:hidden ${open ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0"
          }`}
      />

      <aside
        ref={asideRef}
        inert={!desktop && !open}
        id="primary-navigation"
        aria-label="Enrollment navigation"
        className={`fixed inset-y-0 left-0 z-50 flex w-[16rem] max-w-[86vw] flex-col overflow-hidden border-r border-emerald-950/20 bg-[#173c2c] text-white shadow-2xl transition-transform duration-200 lg:max-w-none lg:translate-x-0 lg:shadow-none ${open ? "translate-x-0" : "-translate-x-full"
          }`}
      >
        <div className="relative overflow-hidden border-b border-white/10 px-5 py-6">
          <button
            type="button"
            onClick={handleClose}
            className="absolute right-4 top-4 z-30 grid h-10 w-10 touch-manipulation place-items-center rounded-xl text-white/80 transition hover:bg-white/10 hover:text-white active:scale-95 lg:hidden"
            aria-label="Close navigation"
          >
            <i className="fa-solid fa-xmark pointer-events-none" aria-hidden="true" />
          </button>

          <div className="relative z-10 flex items-center gap-3.5 pr-6">
            <div className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-white p-1">
              <img src={logo} alt="IITI logo" className="h-full w-full object-contain rounded-full" />
            </div>
            <div className="min-w-0">
              <p className="text-xl font-semibold tracking-tight text-white leading-none">IITI</p>
              <p className="mt-1 whitespace-nowrap text-xs font-medium tracking-wide text-emerald-100/80">
                Enrollment System
              </p>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-3 py-5">
          <p className="px-3 text-[0.68rem] font-medium tracking-wide text-emerald-100/80">
            Main menu
          </p>
          <nav className="mt-3" aria-label="Main navigation">
            <ul className="space-y-1">
              {navigationItems.map((item) => (
                <li key={item.path}>
                  <NavLink
                    to={item.path}
                    end={item.path === "/"}
                    onClick={onClose}
                    className={({ isActive }) =>
                      `group flex items-center gap-3 rounded-xl px-3 py-2.5 font-medium transition-all ${isActive
                        ? "bg-white/12 text-white font-semibold"
                        : "text-emerald-50/80 hover:bg-white/10 hover:text-white"
                      }`
                    }
                  >
                    {({ isActive }) => (
                      <>
                        <span
                          className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg transition-colors ${isActive ? "text-white" : "text-emerald-100"
                            }`}
                        >
                          <i className={`${item.icon} text-sm`} />
                        </span>
                        <span className="truncate text-sm font-semibold">{item.shortLabel}</span>
                      </>
                    )}
                  </NavLink>
                </li>
              ))}
            </ul>
          </nav>
        </div>

        <div className="border-t border-white/10 p-4">
          <div className="p-1.5">
            <div className="flex items-center gap-3">
              <div className="grid h-10 w-10 place-items-center rounded-full bg-emerald-100 text-sm font-bold text-[#173c2c]">
                AD
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">Administrator</p>
                <p className="truncate text-xs text-emerald-100/80">Enrollment Office</p>
              </div>
              <button
                type="button"
                onClick={handleLogout}
                className="grid h-10 w-10 place-items-center rounded-xl text-emerald-100 transition hover:bg-white/10 hover:text-white"
                aria-label="Log out"
                title="Log out"
              >
                <i className="fa-solid fa-arrow-right-from-bracket" />
              </button>
            </div>
          </div>
        </div>
      </aside>
    </>
  );
}

export default Sidebar;
