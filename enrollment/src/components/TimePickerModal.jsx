import { useEffect, useId, useMemo, useState } from "react";
import { createPortal } from "react-dom";

// Hour clock numbers 1 to 12
const CLOCK_HOURS = [12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];

// Minute clock markers in 5-minute increments
const CLOCK_MINUTES = [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55];

// Common quick minute presets including 60
const QUICK_MINUTES = ["00", "15", "30", "45", "60"];

const CLOCK_RADIUS = 86; // Radius in pixels from center (120, 120)
const CLOCK_CENTER = 120;

function getCoordinatesForAngle(degrees, radius = CLOCK_RADIUS) {
  const radians = (degrees * Math.PI) / 180;
  const x = CLOCK_CENTER + radius * Math.sin(radians);
  const y = CLOCK_CENTER - radius * Math.cos(radians);
  return { x, y };
}

function parseTimeComponents(timeStr) {
  if (!timeStr) return null;
  const match = String(timeStr).trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i);
  if (!match) return null;

  const rawHour = parseInt(match[1], 10);
  const rawMin = parseInt(match[2], 10);
  const rawAmpm = (match[3] || "AM").toUpperCase();

  const validHour = rawHour >= 1 && rawHour <= 12 ? rawHour : 12;
  const validMin = rawMin >= 0 && rawMin <= 60 ? String(rawMin).padStart(2, "0") : "00";
  const validAmpm = rawAmpm === "PM" ? "PM" : "AM";

  return {
    hour: validHour,
    minute: validMin,
    ampm: validAmpm,
    totalMinutes: ((validHour % 12) + (validAmpm === "PM" ? 12 : 0)) * 60 + parseInt(validMin, 10),
  };
}

function checkExactTimeMatch(timeStr1, timeStr2) {
  if (!timeStr1 || !timeStr2) return false;
  const t1 = String(timeStr1).trim();
  const t2 = String(timeStr2).trim();
  if (t1.toLowerCase() === t2.toLowerCase()) return true;

  const p1 = parseTimeComponents(t1);
  const p2 = parseTimeComponents(t2);
  if (!p1 || !p2) return false;

  // Exact match if parsed hours, minutes, and AM/PM are all equal
  if (p1.hour === p2.hour && p1.minute === p2.minute && p1.ampm === p2.ampm) {
    return true;
  }

  // Also match if total minutes are equivalent (e.g. 9:60 AM vs 10:00 AM)
  return p1.totalMinutes === p2.totalMinutes;
}

function TimePickerModal({
  isOpen,
  onClose,
  onConfirm,
  initialTime = "",
  otherTime = "",
  fieldLabel = "Start",
  subjectCode = "",
  subjectTitle = "",
}) {
  const titleId = useId();
  const otherFieldLabel = fieldLabel === "Start" ? "End" : "Start";

  const [activeView, setActiveView] = useState("hour"); // "hour" | "minute"
  const [selectedHour, setSelectedHour] = useState(8);
  const [selectedMinute, setSelectedMinute] = useState("00");
  const [selectedAmpm, setSelectedAmpm] = useState("AM");

  // Synchronize state when modal opens or initial values change
  useEffect(() => {
    if (!isOpen) return;

    setActiveView("hour");
    const parsed = parseTimeComponents(initialTime);
    if (parsed) {
      setSelectedHour(parsed.hour);
      setSelectedMinute(parsed.minute);
      setSelectedAmpm(parsed.ampm);
    } else {
      if (fieldLabel === "Start") {
        setSelectedHour(8);
        setSelectedMinute("00");
        setSelectedAmpm("AM");
      } else {
        setSelectedHour(5);
        setSelectedMinute("00");
        setSelectedAmpm("PM");
      }
    }
  }, [isOpen, initialTime, fieldLabel]);

  // Lock body scroll and listen for Escape key
  useEffect(() => {
    if (!isOpen) return undefined;

    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        onClose?.();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = originalOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, onClose]);

  const currentFormattedTime = useMemo(
    () => `${selectedHour}:${selectedMinute} ${selectedAmpm}`,
    [selectedHour, selectedMinute, selectedAmpm]
  );

  const isExactMatch = useMemo(() => {
    if (!otherTime || !String(otherTime).trim()) return false;
    return checkExactTimeMatch(currentFormattedTime, otherTime);
  }, [currentFormattedTime, otherTime]);

  // Hand position calculations
  const handTarget = useMemo(() => {
    if (activeView === "hour") {
      const angle = (selectedHour % 12) * 30;
      return getCoordinatesForAngle(angle, CLOCK_RADIUS);
    } else {
      const minNum = parseInt(selectedMinute, 10) || 0;
      const angle = (minNum % 60) * 6;
      return getCoordinatesForAngle(angle, CLOCK_RADIUS);
    }
  }, [activeView, selectedHour, selectedMinute]);

  if (!isOpen) return null;

  const handleConfirm = () => {
    if (isExactMatch) return;
    onConfirm?.(currentFormattedTime);
  };

  const handleClockFaceClick = (event) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const clickX = event.clientX - rect.left - CLOCK_CENTER;
    const clickY = event.clientY - rect.top - CLOCK_CENTER;

    // Angle in degrees from 12 o'clock clockwise
    let degrees = Math.atan2(clickX, -clickY) * (180 / Math.PI);
    if (degrees < 0) degrees += 360;

    if (activeView === "hour") {
      let hour = Math.round(degrees / 30);
      if (hour === 0) hour = 12;
      setSelectedHour(hour);
      // Automatically advance to minute view
      setActiveView("minute");
    } else {
      let min = Math.round(degrees / 6);
      if (min === 60) min = 0;
      setSelectedMinute(String(min).padStart(2, "0"));
    }
  };

  const adjustMinute = (delta) => {
    let current = parseInt(selectedMinute, 10);
    if (Number.isNaN(current)) current = 0;
    let next = current + delta;
    if (next < 0) next = 60;
    if (next > 60) next = 0;
    setSelectedMinute(String(next).padStart(2, "0"));
  };

  return createPortal(
    <div className="fixed inset-0 z-[400] flex items-center justify-center p-3 sm:p-4">
      {/* Backdrop */}
      <button
        type="button"
        className="absolute inset-0 bg-slate-950/50"
        onClick={onClose}
        aria-label="Close time selector"
      />

      {/* Modal Dialog */}
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative flex w-full max-w-sm flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl transition"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 bg-white px-5 py-3.5">
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-emerald-100 text-emerald-800">
              <i className="fa-regular fa-clock text-base" />
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-700">
                Clock Time Picker
              </p>
              <h2
                id={titleId}
                className="text-base font-semibold tracking-tight text-slate-900"
              >
                Select {fieldLabel} Time
              </h2>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="grid h-8 w-8 shrink-0 place-items-center rounded-xl text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
            aria-label="Close"
          >
            <i className="fa-solid fa-xmark text-sm" />
          </button>
        </div>

        {/* Content */}
        <div className="flex flex-col gap-4 p-4 sm:p-5">
          {subjectCode ? (
            <div className="flex items-center gap-2 rounded-xl bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-600">
              <span className="font-bold text-slate-800">{subjectCode}</span>
              {subjectTitle ? <span className="truncate text-slate-400">• {subjectTitle}</span> : null}
            </div>
          ) : null}

          {/* Digital Time & Mode Switcher */}
          <div className="flex flex-col items-center justify-center rounded-xl border border-emerald-100 bg-[#f4fbf3] p-3 shadow-inner">
            <div className="flex items-center gap-2">
              {/* Hour Digits Button */}
              <button
                type="button"
                onClick={() => setActiveView("hour")}
                className={`rounded-xl px-3.5 py-1.5 font-mono text-2xl sm:text-3xl font-semibold tracking-tight transition ${
                  activeView === "hour"
                    ? "bg-emerald-800 text-white shadow-md ring-2 ring-emerald-600/30"
                    : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                }`}
                title="Click to select Hour"
              >
                {String(selectedHour).padStart(2, "0")}
              </button>

              <span className="font-mono text-2xl font-bold text-slate-400">:</span>

              {/* Minute Digits Button */}
              <button
                type="button"
                onClick={() => setActiveView("minute")}
                className={`rounded-xl px-3.5 py-1.5 font-mono text-2xl sm:text-3xl font-semibold tracking-tight transition ${
                  activeView === "minute"
                    ? "bg-emerald-800 text-white shadow-md ring-2 ring-emerald-600/30"
                    : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                }`}
                title="Click to select Minute"
              >
                {selectedMinute}
              </button>

              {/* AM / PM Toggle */}
              <div className="ml-1.5 flex flex-col rounded-xl border border-slate-200 bg-white p-0.5">
                <button
                  type="button"
                  onClick={() => setSelectedAmpm("AM")}
                  className={`rounded-lg px-2.5 py-1 text-xs font-bold transition ${
                    selectedAmpm === "AM"
                      ? "bg-emerald-800 text-white "
                      : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  AM
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedAmpm("PM")}
                  className={`rounded-lg px-2.5 py-1 text-xs font-bold transition ${
                    selectedAmpm === "PM"
                      ? "bg-emerald-800 text-white "
                      : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  PM
                </button>
              </div>
            </div>

            {/* Other box reference */}
            {otherTime ? (
              <div className="mt-2 flex items-center gap-1.5 text-xs text-slate-500">
                <span>{otherFieldLabel} Time:</span>
                <span className="font-bold text-slate-700">{otherTime}</span>
              </div>
            ) : null}
          </div>

          {/* Mode Tabs */}
          <div className="flex rounded-xl bg-slate-100 p-1">
            <button
              type="button"
              onClick={() => setActiveView("hour")}
              className={`flex-1 rounded-lg py-1.5 text-xs font-bold transition ${
                activeView === "hour"
                  ? "bg-white text-emerald-900 "
                  : "text-slate-500 hover:text-slate-800"
              }`}
            >
              Hour (1 - 12)
            </button>
            <button
              type="button"
              onClick={() => setActiveView("minute")}
              className={`flex-1 rounded-lg py-1.5 text-xs font-bold transition ${
                activeView === "minute"
                  ? "bg-white text-emerald-900 "
                  : "text-slate-500 hover:text-slate-800"
              }`}
            >
              Minute (00 - 60)
            </button>
          </div>

          {/* Circular Clock Face */}
          <div className="flex flex-col items-center justify-center">
            <div
              onClick={handleClockFaceClick}
              className="relative h-60 w-60 cursor-pointer select-none rounded-full border-2 border-slate-200/90 bg-slate-50/90 shadow-inner transition hover:border-emerald-300"
              title={activeView === "hour" ? "Click to set Hour" : "Click to set Minute"}
            >
              {/* SVG Clock Hand & Pivot */}
              <svg className="pointer-events-none absolute inset-0 h-full w-full">
                {/* Center Pivot */}
                <circle cx={CLOCK_CENTER} cy={CLOCK_CENTER} r="4" fill="#065f46" />
                {/* Clock Hand */}
                <line
                  x1={CLOCK_CENTER}
                  y1={CLOCK_CENTER}
                  x2={handTarget.x}
                  y2={handTarget.y}
                  stroke="#065f46"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                />
                {/* Hand Tip indicator */}
                <circle cx={handTarget.x} cy={handTarget.y} r="18" fill="#065f46" opacity="0.15" />
              </svg>

              {/* Clock Numbers */}
              {activeView === "hour"
                ? CLOCK_HOURS.map((hour) => {
                    const angle = (hour % 12) * 30;
                    const { x, y } = getCoordinatesForAngle(angle);
                    const isSelected = selectedHour === hour;

                    return (
                      <button
                        key={hour}
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedHour(hour);
                          setActiveView("minute");
                        }}
                        style={{ left: `${x}px`, top: `${y}px` }}
                        className={`absolute -translate-x-1/2 -translate-y-1/2 flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold transition ${
                          isSelected
                            ? "bg-emerald-800 text-white shadow-md scale-110"
                            : "text-slate-700 hover:bg-emerald-100 hover:text-emerald-900"
                        }`}
                      >
                        {hour}
                      </button>
                    );
                  })
                : CLOCK_MINUTES.map((min) => {
                    const angle = (min % 60) * 6;
                    const { x, y } = getCoordinatesForAngle(angle);
                    const isSelected = parseInt(selectedMinute, 10) === min;

                    return (
                      <button
                        key={min}
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedMinute(String(min).padStart(2, "0"));
                        }}
                        style={{ left: `${x}px`, top: `${y}px` }}
                        className={`absolute -translate-x-1/2 -translate-y-1/2 flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold transition ${
                          isSelected
                            ? "bg-emerald-800 text-white shadow-md scale-110"
                            : "text-slate-700 hover:bg-emerald-100 hover:text-emerald-900"
                        }`}
                      >
                        {String(min).padStart(2, "0")}
                      </button>
                    );
                  })}
            </div>

            {/* Minute Controls (Presets & Stepper) */}
            {activeView === "minute" ? (
              <div className="mt-3 flex w-full flex-col gap-2">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-semibold text-slate-400">Quick Minutes:</span>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => adjustMinute(-1)}
                      className="rounded-lg border border-slate-200 bg-white px-2 py-0.5 text-xs font-bold text-slate-600 hover:bg-slate-50"
                      title="Decrease by 1 minute"
                    >
                      -1m
                    </button>
                    <button
                      type="button"
                      onClick={() => adjustMinute(1)}
                      className="rounded-lg border border-slate-200 bg-white px-2 py-0.5 text-xs font-bold text-slate-600 hover:bg-slate-50"
                      title="Increase by 1 minute"
                    >
                      +1m
                    </button>
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-center gap-1.5">
                  {QUICK_MINUTES.map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setSelectedMinute(m)}
                      className={`rounded-lg border px-2.5 py-1 text-xs font-bold transition ${
                        selectedMinute === m
                          ? "border-emerald-600 bg-emerald-50 text-emerald-900 ring-1 ring-emerald-500/20"
                          : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50"
                      }`}
                    >
                      :{m}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
          </div>

          {/* Exact Match Warning */}
          {isExactMatch ? (
            <div
              role="alert"
              className="flex items-start gap-2.5 rounded-xl border border-rose-200 bg-rose-50 p-2.5 text-xs text-rose-800 animate-in fade-in"
            >
              <i className="fa-solid fa-triangle-exclamation mt-0.5 shrink-0 text-sm text-rose-500" />
              <div>
                <p className="font-bold">Exact Time Conflict</p>
                <p className="mt-0.5 text-rose-700">
                  {fieldLabel} time cannot be the exact same value as {otherFieldLabel} time ({otherTime}).
                  The OK button is disabled until a different time is selected.
                </p>
              </div>
            </div>
          ) : null}
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-end gap-2.5 border-t border-slate-100 bg-slate-50 px-5 py-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 active:scale-95"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={isExactMatch}
            onClick={handleConfirm}
            className={`rounded-xl px-5 py-2 text-sm font-bold transition ${
              isExactMatch
                ? "cursor-not-allowed border border-slate-200 bg-slate-200 text-slate-400 opacity-60 shadow-none pointer-events-none"
                : "cursor-pointer bg-emerald-800 text-white  hover:bg-emerald-700 active:scale-95"
            }`}
            title={isExactMatch ? "Cannot select exact same time as other box" : "Confirm time selection"}
          >
            OK
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

export default TimePickerModal;
