import { useEffect, useId, useRef } from "react";
import { createPortal } from "react-dom";

const SIZE_CLASSES = {
  sm: "max-w-md",
  md: "max-w-2xl",
  lg: "max-w-4xl",
  xl: "max-w-6xl",
  full: "max-w-[96rem]",
};

const modalStack = [];
let previousBodyOverflow = "";

function Modal({ open, onClose, title, children, size = "xl" }) {
  const titleId = useId();
  const dialogRef = useRef(null);
  const closeRef = useRef(onClose);
  useEffect(() => { closeRef.current = onClose; }, [onClose]);

  useEffect(() => {
    if (!open) return undefined;

    const dialog = dialogRef.current;
    const previousFocus = document.activeElement;
    if (!modalStack.length) previousBodyOverflow = document.body.style.overflow;
    modalStack.push(dialog);
    document.body.style.overflow = "hidden";
    const focusable = () => [...dialog.querySelectorAll(
      'button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex="0"]'
    )].filter((element) => element.getClientRects().length);
    (focusable()[0] || dialog).focus();

    const handleKeyDown = (event) => {
      if (modalStack.at(-1) !== dialog) return;
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopImmediatePropagation();
        closeRef.current();
      }
      if (event.key === "Tab") {
        const elements = focusable();
        const first = elements[0];
        const last = elements.at(-1);
        if (!first) { event.preventDefault(); dialog.focus(); return; }
        if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog)) {
          event.preventDefault(); last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault(); first.focus();
        }
      }
    };
    const containFocus = (event) => {
      if (modalStack.at(-1) === dialog && !dialog.contains(event.target)) {
        (focusable()[0] || dialog).focus();
      }
    };
    document.addEventListener("keydown", handleKeyDown, true);
    document.addEventListener("focusin", containFocus);
    return () => {
      modalStack.splice(modalStack.indexOf(dialog), 1);
      if (!modalStack.length) document.body.style.overflow = previousBodyOverflow;
      document.removeEventListener("keydown", handleKeyDown, true);
      document.removeEventListener("focusin", containFocus);
      if (previousFocus?.isConnected) previousFocus.focus();
    };
  }, [open]);

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-[300] flex items-center justify-center p-3 sm:p-6">
      <button
        type="button"
        className="absolute inset-0 bg-slate-950/55"
        onClick={onClose}
        aria-label="Close dialog"
      />

      <div
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={`animate-fade relative flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-xl bg-white shadow-2xl shadow-slate-950/25 ${SIZE_CLASSES[size] ?? SIZE_CLASSES.xl
          }`}
      >
        <div className="flex shrink-0 items-center justify-between gap-4 border-b border-slate-100 bg-white px-5 py-4 sm:px-6">
          <div className="min-w-0">
            <h2 id={titleId} className="text-xl font-semibold tracking-tight text-slate-900 sm:text-xl">
              {title}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="grid h-10 w-10 shrink-0 place-items-center rounded-xl text-slate-400 transition hover:bg-slate-100 hover:text-slate-800"
            aria-label="Close dialog"
          >
            <i className="fa-solid fa-xmark" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto bg-slate-50/50 p-4 sm:p-6">{children}</div>
      </div>
    </div>,
    document.body
  );
}

export default Modal;
