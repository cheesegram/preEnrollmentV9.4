import { useMemo, useState } from "react";
import TimePickerModal from "./TimePickerModal";

const DAYS_OF_WEEK = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
];

function ScheduleTable({
  rows = [],
  onRowChange,
  isEditingEnabled,
  isRowDirty,
}) {
  const [activeCell, setActiveCell] = useState(null);
  const [timePickerTarget, setTimePickerTarget] = useState(null);

  const scheduleRows = useMemo(() => (Array.isArray(rows) ? rows : []), [rows]);

  const activeTimeRow = useMemo(
    () => scheduleRows.find((entry) => entry.id === timePickerTarget?.rowId),
    [scheduleRows, timePickerTarget]
  );

  const handleChange = (rowId, field, value) => {
    onRowChange?.(rowId, field, value);
  };

  const handleDayRadioChange = (rowId, day) => {
    handleChange(rowId, "days", [day]);
  };

  return (
    <div className="overflow-hidden bg-white">
      <div className="overflow-x-auto">
        <table className="min-w-full border-collapse text-left text-sm">
          <thead className="sticky top-0 z-10 bg-[#edf3ec] text-[#2f5b42]">
            <tr>
              <th className="px-4 py-4 text-xs font-bold uppercase tracking-wide">Subject Code</th>
              <th className="px-4 py-4 text-xs font-bold uppercase tracking-wide">Subject Title</th>
              <th className="px-4 py-4 text-xs font-bold uppercase tracking-wide">Units</th>
              <th className="px-4 py-4 text-xs font-bold uppercase tracking-wide">Days</th>
              <th className="px-4 py-4 text-xs font-bold uppercase tracking-wide min-w-[240px]">Time</th>
              <th className="px-4 py-4 text-xs font-bold uppercase tracking-wide">Room</th>
              <th className="px-4 py-4 text-xs font-bold uppercase tracking-wide">Instructor</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {scheduleRows.length > 0 ? (
              scheduleRows.map((row) => {
                const rowDays = Array.isArray(row.days) ? row.days : row.days ? [row.days] : [];
                const selectedDay = rowDays[0] ?? "";
                const timeValue = `${row.timeStart ?? ""} - ${row.timeEnd ?? ""}`.trim();
                const hasChanges = Boolean(isRowDirty?.(row.id));

                return (
                  <tr
                    key={row.id}
                    className={`align-top transition hover:bg-emerald-50/50 ${hasChanges ? "bg-emerald-50/70" : ""}`}
                  >
                    <td className="px-4 py-4 font-semibold text-slate-900">
                      <div className="min-h-11 rounded-lg bg-slate-50 px-3 py-3 text-sm font-semibold text-slate-900">
                        {row.subjectCode ?? ""}
                      </div>
                    </td>
                    <td className="px-4 py-4 text-slate-700">
                      <div className="min-h-11 rounded-lg bg-slate-50 px-3 py-3 text-sm text-slate-700">
                        {row.subjectTitle ?? ""}
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      <div className="inline-flex min-h-11 w-20 items-center justify-start rounded-lg bg-slate-50 px-3 py-3 text-sm font-semibold text-slate-900">
                        {row.units ?? 0}
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      {isEditingEnabled ? (
                        <div className="flex flex-wrap gap-2">
                          {DAYS_OF_WEEK.map((day) => {
                            const isSelected = selectedDay === day;
                            return (
                              <label
                                key={day}
                                className={`inline-flex cursor-pointer select-none items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold  transition ${
                                  isSelected
                                    ? "border-emerald-600 bg-emerald-50 text-emerald-900 ring-1 ring-emerald-500/20"
                                    : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50"
                                }`}
                              >
                                <input
                                  type="radio"
                                  name={`day-radio-${row.id}`}
                                  value={day}
                                  checked={isSelected}
                                  onChange={() => handleDayRadioChange(row.id, day)}
                                  className="h-3.5 w-3.5 border-slate-300 text-emerald-800 accent-emerald-800 focus:ring-emerald-500/20 cursor-pointer"
                                />
                                {day.slice(0, 3)}
                              </label>
                            );
                          })}
                        </div>
                      ) : (
                        <div className="flex min-h-11 flex-wrap gap-2">
                          {rowDays.length > 0 ? (
                            rowDays.map((day) => (
                              <span
                                key={day}
                                className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-700"
                              >
                                {day.slice(0, 3)}
                              </span>
                            ))
                          ) : (
                            <span className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-500">
                              None
                            </span>
                          )}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-4 text-slate-700 min-w-[240px]">
                      {isEditingEnabled ? (
                        <div className="flex items-center gap-2">
                          {/* Start Box */}
                          <button
                            type="button"
                            onClick={() =>
                              setTimePickerTarget({
                                rowId: row.id,
                                field: "timeStart",
                              })
                            }
                            className="group flex flex-1 items-center justify-between gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-left transition hover:border-emerald-500 hover:bg-emerald-50/40 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                            title="Click to set Start Time"
                          >
                            <div className="min-w-0">
                              <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 group-hover:text-emerald-700">
                                Start
                              </span>
                              <span className="block truncate text-xs font-semibold text-slate-800">
                                {row.timeStart || "Set Time"}
                              </span>
                            </div>
                            <i className="fa-regular fa-clock text-xs text-slate-400 group-hover:text-emerald-600 shrink-0" />
                          </button>

                          <span className="text-xs font-bold text-slate-300">-</span>

                          {/* End Box */}
                          <button
                            type="button"
                            onClick={() =>
                              setTimePickerTarget({
                                rowId: row.id,
                                field: "timeEnd",
                              })
                            }
                            className="group flex flex-1 items-center justify-between gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-left transition hover:border-emerald-500 hover:bg-emerald-50/40 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                            title="Click to set End Time"
                          >
                            <div className="min-w-0">
                              <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 group-hover:text-emerald-700">
                                End
                              </span>
                              <span className="block truncate text-xs font-semibold text-slate-800">
                                {row.timeEnd || "Set Time"}
                              </span>
                            </div>
                            <i className="fa-regular fa-clock text-xs text-slate-400 group-hover:text-emerald-600 shrink-0" />
                          </button>
                        </div>
                      ) : (
                        <div className="min-h-11 rounded-lg bg-slate-50 px-3 py-3 text-sm text-slate-700">
                          {timeValue || "—"}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-4 text-slate-700">
                      {isEditingEnabled ? (
                        <input
                          value={row.room ?? ""}
                          onChange={(event) => handleChange(row.id, "room", event.target.value)}
                          onFocus={() => setActiveCell(`${row.id}-room`)}
                          className={`w-full rounded-lg border px-3 py-2 text-sm outline-none transition ${activeCell === `${row.id}-room` ? "border-emerald-500 ring-4 ring-emerald-500/10" : "border-transparent bg-slate-50 hover:border-slate-200"}`}
                        />
                      ) : (
                        <div className="min-h-11 rounded-lg bg-slate-50 px-3 py-3 text-sm text-slate-700">
                          {row.room ?? ""}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-4 text-slate-700">
                      {isEditingEnabled ? (
                        <>
                          <input
                            value={row.instructor ?? ""}
                            onChange={(event) => handleChange(row.id, "instructor", event.target.value)}
                            onFocus={() => setActiveCell(`${row.id}-instructor`)}
                            className={`w-full rounded-lg border px-3 py-2 text-sm outline-none transition ${activeCell === `${row.id}-instructor` ? "border-emerald-500 ring-4 ring-emerald-500/10" : "border-transparent bg-slate-50 hover:border-slate-200"}`}
                          />
                          <p className="mt-1 text-xs text-slate-500">{row.instructorRole ?? "Instructor"}</p>
                        </>
                      ) : (
                        <div className="rounded-lg bg-slate-50 px-3 py-3">
                          <p className="text-sm text-slate-700">{row.instructor ?? ""}</p>
                          <p className="mt-1 text-xs text-slate-500">{row.instructorRole ?? "Instructor"}</p>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })
            ) : (
              <tr>
                <td colSpan={7} className="px-6 py-16 text-center text-slate-500">
                  <div className="flex flex-col items-center gap-2">
                    <i className="fa-regular fa-calendar-days text-3xl opacity-50" />
                    <p>No schedule rows found.</p>
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {timePickerTarget ? (
        <TimePickerModal
          isOpen={Boolean(timePickerTarget)}
          onClose={() => setTimePickerTarget(null)}
          onConfirm={(formattedTime) => {
            handleChange(timePickerTarget.rowId, timePickerTarget.field, formattedTime);
            setTimePickerTarget(null);
          }}
          initialTime={
            timePickerTarget.field === "timeStart"
              ? activeTimeRow?.timeStart
              : activeTimeRow?.timeEnd
          }
          otherTime={
            timePickerTarget.field === "timeStart"
              ? activeTimeRow?.timeEnd
              : activeTimeRow?.timeStart
          }
          fieldLabel={timePickerTarget.field === "timeStart" ? "Start" : "End"}
          subjectCode={activeTimeRow?.subjectCode}
          subjectTitle={activeTimeRow?.subjectTitle}
        />
      ) : null}
    </div>
  );
}

export default ScheduleTable;