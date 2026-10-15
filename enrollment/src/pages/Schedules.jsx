import { useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";

import PageHeader from "../components/ui/PageHeader";
import Panel from "../components/ui/Panel";
import SelectField from "../components/ui/SelectField";
import ActionButton from "../components/ui/ActionButton";
import ScheduleSummaryCard from "../components/ui/ScheduleSummaryCard";
import ScheduleTable from "../components/ScheduleTable";
import { fetchSchedulePageData, fetchScheduleConflicts, fetchScheduleRequests, findPendingRequestForSection, createScheduleRequest } from "../lib/scheduleRepository";

const EDITABLE_ROW_FIELDS = [
  "days",
  "timeStart",
  "timeEnd",
  "room",
  "instructor",
];

function pickEditableRowFields(row) {
  return EDITABLE_ROW_FIELDS.reduce((accumulator, field) => {
    accumulator[field] = row?.[field];
    return accumulator;
  }, {});
}

function areFieldValuesEqual(left, right) {
  if (Array.isArray(left) || Array.isArray(right)) {
    return JSON.stringify(Array.isArray(left) ? left : []) === JSON.stringify(Array.isArray(right) ? right : []);
  }
  return left === right;
}

function getRowChanges(original, current) {
  if (!original || !current) return {};

  return EDITABLE_ROW_FIELDS.reduce((changes, field) => {
    const previousValue = original[field];
    const currentValue = current[field];
    if (!areFieldValuesEqual(previousValue, currentValue)) {
      changes[field] = currentValue;
    }
    return changes;
  }, {});
}

function buildBaselineFromRows(rows) {
  return (Array.isArray(rows) ? rows : []).reduce((accumulator, row) => {
    accumulator[row.id] = pickEditableRowFields(row);
    return accumulator;
  }, {});
}

function ScheduleStatusBar({ hasConflicts, message, description }) {
  return (
    <div className={`rounded-xl border px-4 py-4  ${hasConflicts ? "border-rose-200 bg-rose-50" : "border-emerald-200 bg-emerald-50"}`}>
      <div className="flex items-start gap-3">
        <div className={`grid h-11 w-11 shrink-0 place-items-center rounded-full ${hasConflicts ? "bg-rose-100 text-rose-700" : "bg-emerald-100 text-emerald-800"}`}>
          <i className={`fa-solid ${hasConflicts ? "fa-triangle-exclamation" : "fa-circle-check"}`} />
        </div>
        <div>
          <h3 className={`text-base font-semibold ${hasConflicts ? "text-rose-800" : "text-emerald-900"}`}>{message}</h3>
          <p className={`mt-1 text-sm ${hasConflicts ? "text-rose-700/80" : "text-emerald-800/80"}`}>{description}</p>
        </div>
      </div>
    </div>
  );
}

function Schedules() {
  const [rows, setRows] = useState([]);
  const [filters, setFilters] = useState({ sections: [], semesters: [], schoolYears: [] });
  const [status, setStatus] = useState({ hasConflicts: false, message: "Loading schedules...", description: "Please wait while the schedule data is prepared." });
  const [conflicts, setConflicts] = useState([]);
  const [preview, setPreview] = useState({ section: "", semester: "", schoolYear: "" });
  const [selectedSection, setSelectedSection] = useState("");
  const [selectedSemester, setSelectedSemester] = useState("");
  const [selectedSchoolYear, setSelectedSchoolYear] = useState("");
    const [editingEnabled, setEditingEnabled] = useState(false);
  const [tableOriginals, setTableOriginals] = useState({});
  const [rowDraftChanges, setRowDraftChanges] = useState({});
    const [editingRows, setEditingRows] = useState(null);
  const [pendingRequestSchedule, setPendingRequestSchedule] = useState(null);
  const [savingChanges, setSavingChanges] = useState(false);
  const [scheduleRequests, setScheduleRequests] = useState([]);

  useEffect(() => {
    let isMounted = true;

    const loadData = async () => {
      const [data, requestsData] = await Promise.all([
        fetchSchedulePageData(),
        fetchScheduleRequests(),
      ]);
      if (!isMounted) return;

      setRows(Array.isArray(data.rows) ? data.rows : []);
      setFilters(data.filters ?? { sections: [], semesters: [], schoolYears: [] });
      setStatus(data.status ?? { hasConflicts: false, message: "No Schedule Conflicts Detected", description: "All assigned schedules passed validation." });
      setConflicts(data.conflicts ?? []);
      setPreview(data.preview ?? { section: "", semester: "", schoolYear: "" });
      setScheduleRequests(Array.isArray(requestsData) ? requestsData : []);

      const firstRow = data.rows?.[0];
      const sectionOptions = Array.isArray(data.filters?.sections) ? data.filters.sections : [];
      const firstRowSection = String(firstRow?.section ?? "");

      // Default to the first dropdown option unless the first schedule row's
      // section actually exists in the Section dropdown, so the section shown
      // as selected always matches the schedule being displayed.
      const initialSection = sectionOptions.includes(firstRowSection)
        ? firstRowSection
        : sectionOptions[0] ?? firstRowSection;
      const initialSemester = firstRow?.semester ?? data.filters?.semesters?.[0] ?? "";
      const initialSchoolYear = firstRow?.schoolYear ?? data.filters?.schoolYears?.[0] ?? "";

      setSelectedSection(initialSection);
      setSelectedSemester(initialSemester);
      setSelectedSchoolYear(initialSchoolYear);
    };

    loadData().catch((error) => {
      console.error("Failed to load schedule page data", error);
      toast.error("Failed to load schedules");
    });

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    document.title = "Schedules - IITI Enrollment System";
  }, []);

    const visibleRows = useMemo(() => {
    const sourceRows = editingEnabled && editingRows ? editingRows : rows;
    return sourceRows.filter((row) => {
      const sectionMatches = !selectedSection || String(row.section ?? "").trim() === selectedSection;
      const semesterMatches = !selectedSemester || String(row.semester ?? "").trim() === selectedSemester;
      const schoolYearMatches = !selectedSchoolYear || String(row.schoolYear ?? "").trim() === selectedSchoolYear;
      return sectionMatches && semesterMatches && schoolYearMatches;
    });
  }, [rows, editingRows, editingEnabled, selectedSection, selectedSemester, selectedSchoolYear]);

  const filteredRowCount = visibleRows.length;
  const totalUnits = visibleRows.reduce((sum, row) => sum + Number(row.units ?? 0), 0);
  const totalWeeklyHours = visibleRows.reduce((sum, row) => sum + Math.max(1, Number(row.units ?? 0)) * (Array.isArray(row.days) ? row.days.length || 1 : 1), 0);

    const lastUpdatedLabel = useMemo(() => {
    // Show the last schedule request date for the selected section
    const matchingRequests = scheduleRequests.filter((req) => {
      const reqSection = `${String(req?.year ?? "").trim()}${String(req?.section ?? "").trim()}`;
      return reqSection === selectedSection && req?.created_at;
    });

    if (matchingRequests.length === 0) {
      // Fall back to schedule's updated_at/generated_at
      const timestamps = visibleRows
        .map((row) => new Date(row.updatedAt ?? row.generatedAt ?? 0).getTime())
        .filter((time) => Number.isFinite(time) && time > 0);
      if (timestamps.length === 0) return "";
      return new Date(Math.max(...timestamps)).toLocaleString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
      });
    }

    // Sort by created_at descending and take the most recent
    matchingRequests.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    const latest = matchingRequests[0];
    return new Date(latest.created_at).toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  }, [visibleRows, scheduleRequests, selectedSection]);
  const hasPendingChanges = Object.keys(rowDraftChanges).length > 0;

  const activeStatus = useMemo(() => {
    if (!Array.isArray(conflicts) || conflicts.length === 0) {
      return status;
    }

    const filteredConflicts = conflicts.filter((c) => {
      const sectionMatches = !selectedSection || String(c.section ?? "").toLowerCase() === selectedSection.toLowerCase();
      const semesterMatches = !selectedSemester || String(c.semester ?? "").toLowerCase() === selectedSemester.toLowerCase();
      const schoolYearMatches = !selectedSchoolYear || String(c.schoolYear ?? "").toLowerCase() === selectedSchoolYear.toLowerCase();
      return sectionMatches && semesterMatches && schoolYearMatches;
    });

    if (filteredConflicts.length > 0) {
      const sectionLabel = selectedSection ? ` in Section ${selectedSection}` : "";
      return {
        hasConflicts: true,
        message: `${filteredConflicts.length} Schedule Conflict${filteredConflicts.length > 1 ? "s" : ""} Detected${sectionLabel}`,
        description: filteredConflicts.map((c) => c.message).join(" "),
      };
    }

    if (selectedSection) {
      return {
        hasConflicts: false,
        message: `No Schedule Conflicts Detected in Section ${selectedSection}`,
        description: `All assigned schedules for Section ${selectedSection} passed validation.`,
      };
    }

    return status;
  }, [conflicts, selectedSection, selectedSemester, selectedSchoolYear, status]);

    const pendingRowPayload = useMemo(
    () =>
      Object.entries(rowDraftChanges)
        .map(([rowId, changes]) => {
          const row = (editingRows ?? rows).find((entry) => entry.id === rowId);
          if (!row) return null;

          return {
            scheduleId: row.scheduleId,
            classIndex: row.classIndex,
            changes,
          };
        })
        .filter(Boolean),
    [rowDraftChanges, rows, editingRows]
  );

      const clearEditingSession = () => {
    setEditingEnabled(false);
    setTableOriginals({});
    setRowDraftChanges({});
    setEditingRows(null);
    setPendingRequestSchedule(null);
  };

    const updateRow = (rowId, field, value) => {
    if (!editingEnabled) return;

    // Determine which row source to use for updating
    if (editingRows) {
      setEditingRows((currentRows) => {
        const targetRow = currentRows.find((row) => row.id === rowId);
        const nextRow = targetRow ? { ...targetRow, [field]: value } : null;

        if (nextRow) {
          setRowDraftChanges((currentDrafts) => {
            const original = tableOriginals[rowId] ?? pickEditableRowFields(targetRow);
            const nextChanges = getRowChanges(original, nextRow);
            if (Object.keys(nextChanges).length === 0) {
              const { [rowId]: _ignored, ...rest } = currentDrafts;
              return rest;
            }
            return { ...currentDrafts, [rowId]: nextChanges };
          });
        }

        return currentRows.map((row) => {
          if (row.id !== rowId) return row;
          return { ...row, [field]: value };
        });
      });
    } else {
      setRows((currentRows) => {
        const targetRow = currentRows.find((row) => row.id === rowId);
        const nextRow = targetRow ? { ...targetRow, [field]: value } : null;

        if (nextRow) {
          setRowDraftChanges((currentDrafts) => {
            const original = tableOriginals[rowId] ?? pickEditableRowFields(targetRow);
            const nextChanges = getRowChanges(original, nextRow);
            if (Object.keys(nextChanges).length === 0) {
              const { [rowId]: _ignored, ...rest } = currentDrafts;
              return rest;
            }
            return { ...currentDrafts, [rowId]: nextChanges };
          });
        }

        return currentRows.map((row) => {
          if (row.id !== rowId) return row;
          return { ...row, [field]: value };
        });
      });
    }
  };

  const isRowDirty = (rowId) => Object.keys(rowDraftChanges[rowId] ?? {}).length > 0;

      const handleStartEdit = () => {
    // Check if there's a pending request for the selected section
    const pendingResult = findPendingRequestForSection(scheduleRequests, selectedSection);
    if (pendingResult) {
      // Use the pending request's schedule data as the editing baseline
      const pendingRows = pendingResult.rows;
      setEditingRows(pendingRows);
      setTableOriginals(buildBaselineFromRows(pendingRows));
      setPendingRequestSchedule(pendingResult.request.schedule ?? null);
    } else {
      setEditingRows(null);
      setTableOriginals(buildBaselineFromRows(visibleRows));
      setPendingRequestSchedule(null);
    }
    setRowDraftChanges({});
    setEditingEnabled(true);
    toast("Table editing enabled");
  };

  const handleSaveChanges = async () => {
    if (pendingRowPayload.length === 0) {
      return;
    }

    const uniqueScheduleIds = [...new Set(pendingRowPayload.map((entry) => entry.scheduleId).filter(Boolean))];
    if (uniqueScheduleIds.length !== 1) {
      toast.error("Changes span multiple schedules. Narrow your filters and save one schedule at a time.");
      return;
    }

        try {
      setSavingChanges(true);
            await createScheduleRequest({
        scheduleId: uniqueScheduleIds[0],
        rowChanges: pendingRowPayload,
        baseSchedule: pendingRequestSchedule,
      });

      // Reflect the fresh "updated_at" stamp from the backend on the local
      // rows right away so the "Last Updated" display updates instantly.
      const savedAt = new Date().toISOString();
      setRows((currentRows) =>
        currentRows.map((row) =>
          uniqueScheduleIds.includes(row.scheduleId) ? { ...row, updatedAt: savedAt } : row
        )
      );

      const updatedReport = await fetchScheduleConflicts().catch(() => null);
      if (updatedReport) {
        setConflicts(updatedReport.conflicts ?? []);
        if (updatedReport.status) {
          setStatus(updatedReport.status);
        }
      }

                  clearEditingSession();
      toast.success("Schedule request sent successfully");

      // Refresh schedule page data so the table reverts to the default
      // (master) schedule values for the selected section.
      try {
        const refreshedData = await fetchSchedulePageData();
        setRows(Array.isArray(refreshedData.rows) ? refreshedData.rows : []);
        setFilters(refreshedData.filters ?? { sections: [], semesters: [], schoolYears: [] });
      } catch (refreshError) {
        console.warn("Failed to refresh schedule page data:", refreshError);
      }

      // Refresh schedule requests to update the "Last Request" display
      try {
        const refreshedRequests = await fetchScheduleRequests();
        setScheduleRequests(Array.isArray(refreshedRequests) ? refreshedRequests : []);
      } catch (refreshError) {
        console.warn("Failed to refresh schedule requests:", refreshError);
      }
    } catch (error) {
      console.error("Failed to save schedule changes", error);
      toast.error("Failed to send schedule request");
    } finally {
      setSavingChanges(false);
    }
  };

    const handleCancelEdit = () => {
    if (editingRows) {
      // Restore editing rows to their original baseline
      const restoredRows = editingRows.map((row) => {
        const original = tableOriginals[row.id];
        return original ? { ...row, ...pickEditableRowFields(row), ...original } : row;
      });
      setEditingRows(restoredRows);
    } else {
      setRows((currentRows) =>
        currentRows.map((row) => {
          const original = tableOriginals[row.id];
          return original ? { ...row, ...original } : row;
        })
      );
    }
    clearEditingSession();
    toast("Edit cancelled");
  };

  const handleEditAction = () => {
    if (!editingEnabled) {
      handleStartEdit();
      return;
    }

    if (!hasPendingChanges) {
      toast("Make changes in the table first.");
      return;
    }

    handleSaveChanges();
  };

  return (
    <section className="mx-auto flex w-full max-w-[1440px] flex-col gap-6 p-4 sm:p-6 lg:p-8">
      <PageHeader
        title="Schedules"
        description="Review and edit section schedules for each semester and school year."
      />

      <Panel className="overflow-hidden">
        <div className="grid gap-4 border-b border-slate-100 bg-white p-5 lg:grid-cols-3">
          <SelectField
            label="Section"
            value={selectedSection}
            onChange={(event) => setSelectedSection(event.target.value)}
            options={filters.sections}
          />
          <SelectField
            label="Semester"
            value={selectedSemester}
            onChange={(event) => setSelectedSemester(event.target.value)}
            options={filters.semesters.length ? filters.semesters : ["1st Semester"]}
          />
          <SelectField
            label="School Year"
            value={selectedSchoolYear}
            onChange={(event) => setSelectedSchoolYear(event.target.value)}
            options={filters.schoolYears.length ? filters.schoolYears : ["2024 - 2025"]}
          />
        </div>
      </Panel>

      <Panel className="overflow-hidden">
        <div className="border-b border-slate-100 px-5 py-5 sm:px-6">
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-start">
            <div>
              <h2 className="text-2xl font-semibold tracking-tight text-slate-900">Section {selectedSection || preview.section || "1A"}</h2>
              <p className="mt-1 text-sm text-slate-500">
                {selectedSemester || preview.semester || "First Semester"} • {selectedSchoolYear || preview.schoolYear || "AY 2024 - 2025"}
              </p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm sm:min-w-[16rem]">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Last Request</p>
              <p className="mt-1 font-semibold text-slate-800">{lastUpdatedLabel || "—"}</p>
            </div>
          </div>
        </div>

        <div className="px-5 py-5 sm:px-6">
          <ScheduleTable
            rows={visibleRows}
            onRowChange={updateRow}
            isEditingEnabled={editingEnabled}
            isRowDirty={isRowDirty}
          />
        </div>

        <div className="grid gap-3 border-t border-slate-100 bg-[#f4fbf3] px-5 py-4 sm:grid-cols-3 sm:px-6">
          <div className="flex items-center gap-3 px-4 py-3">
            <i className="fa-solid fa-book-open text-emerald-800" />
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Total Subjects</p>
              <p className="text-xl font-semibold text-slate-900">{filteredRowCount}</p>
            </div>
          </div>
          <div className="flex items-center gap-3 px-4 py-3">
            <i className="fa-solid fa-layer-group text-emerald-800" />
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Total Units</p>
              <p className="text-xl font-semibold text-slate-900">{totalUnits}</p>
            </div>
          </div>
          <div className="flex items-center gap-3 px-4 py-3">
            <i className="fa-regular fa-clock text-emerald-800" />
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Total Weekly Hours</p>
              <p className="text-xl font-semibold text-slate-900">{totalWeeklyHours}</p>
            </div>
          </div>
        </div>
      </Panel>

      <ScheduleStatusBar hasConflicts={activeStatus.hasConflicts} message={activeStatus.message} description={activeStatus.description} />

      <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
        <ActionButton tone="outline" onClick={handleEditAction} disabled={savingChanges}>
          <i className="fa-regular fa-pen-to-square" />
          {editingEnabled ? "Send Request" : "Make Schedule Request"}
        </ActionButton>
        {editingEnabled ? (
          <ActionButton tone="outline" onClick={handleCancelEdit} disabled={savingChanges}>
            <i className="fa-solid fa-xmark" />
            Cancel Edit
          </ActionButton>
        ) : null}
      </div>
    </section>
  );
}

export default Schedules;