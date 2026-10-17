import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import toast from "react-hot-toast";
import Pagination from "./ui/Pagination";
import StudentsTable from "./StudentsTable";
import api from "../lib/axios";
import { getCapacityStateStyle, getSectionStatus } from "../utils/sectionStatus";

function SectionTable({ sections, students, allSections = sections, onStudentsChanged, onSectionsChanged, className = "" }) {
  const [studentListSection, setStudentListSection] = useState(null);
  const [moveMode, setMoveMode] = useState(false);
  const [selectedStudentIds, setSelectedStudentIds] = useState([]);
  const [moveStep, setMoveStep] = useState("students");
  const [targetSection, setTargetSection] = useState(null);
  const [isMoving, setIsMoving] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const sectionList = useMemo(() => (Array.isArray(sections) ? sections : []), [sections]);
  const studentList = useMemo(() => (Array.isArray(students) ? students : []), [students]);

  const totalPages = Math.max(1, Math.ceil(sectionList.length / pageSize));
  const safePage = Math.min(currentPage, totalPages);

  const paginatedSections = useMemo(() => {
    const start = (safePage - 1) * pageSize;
    return sectionList.slice(start, start + pageSize);
  }, [sectionList, safePage, pageSize]);

  useEffect(() => {
    setCurrentPage(1);
  }, [sections]);

  const getStudentRowsForSection = (section) => {
    const year = String(section.year ?? "").trim();
    const sectionName = String(section.section ?? "").trim().toUpperCase();
    const semester = String(section.semester ?? "").trim() || "N/A";
    if (!year || !sectionName) return [];

    return studentList.filter((student) => {
      const sYear = String(student.year ?? "").trim();
      const sSection = String(student.section ?? "").trim().toUpperCase();
      const sSemester = String(student.semester ?? "").trim() || "N/A";

      // Students whose home section matches the section file.
      if (sYear === year && sSection === sectionName && sSemester === semester) return true;

      // Irregular students occupying this section through their
      // irregularSection / irregularYear array values.
      if (String(student.status ?? "").trim().toLowerCase() !== "irregular") return false;

      const irregularSections = (Array.isArray(student.irregularSection) ? student.irregularSection : []).map(
        (value) => String(value ?? "").trim().toUpperCase()
      );
      const irregularYears = Array.isArray(student.irregularYear) ? student.irregularYear : [];
      const index = irregularSections.indexOf(sectionName);
      if (index === -1) return false;

      const pairedYear = String(irregularYears[index] ?? irregularYears[0] ?? "").trim();
      return pairedYear === year && sSemester === semester;
    });
  };

  const handlePageSizeChange = (nextSize) => {
    setPageSize(nextSize);
    setCurrentPage(1);
  };

  const openStudentList = (section) => {
    setStudentListSection(section);
    setMoveMode(false);
    setSelectedStudentIds([]);
    setMoveStep("students");
    setTargetSection(null);
  };
  const closeStudentList = () => {
    setStudentListSection(null);
    setMoveMode(false);
    setSelectedStudentIds([]);
    setMoveStep("students");
    setTargetSection(null);
  };

  const targetSections = useMemo(() => {
    if (!studentListSection) return [];
    return (Array.isArray(allSections) ? allSections : []).filter((section) =>
      String(section.year ?? "").trim() === String(studentListSection.year ?? "").trim() &&
      String(section.semester ?? "").trim() === String(studentListSection.semester ?? "").trim() &&
      String(section.section ?? "").trim().toUpperCase() !== String(studentListSection.section ?? "").trim().toUpperCase()
    );
  }, [allSections, studentListSection]);

  const handleMoveStudents = async () => {
    if (!targetSection || selectedStudentIds.length === 0 || isMoving) return;
    try {
      setIsMoving(true);
      await api.post("/students/move-section", {
        studentIds: selectedStudentIds,
        targetSection: {
          year: targetSection.year,
          section: targetSection.section,
          semester: targetSection.semester,
        },
      });
      await onStudentsChanged?.();
      await onSectionsChanged?.();
      toast.success("Students moved successfully");
      closeStudentList();
    } catch (error) {
      console.error("Failed to move students", error);
      toast.error(error?.response?.data?.message || "Failed to move students");
    } finally {
      setIsMoving(false);
    }
  };

  const studentRowsForModal = useMemo(
    () => (studentListSection ? getStudentRowsForSection(studentListSection) : []),
    [studentListSection, studentList]
  );

  const selectedStudents = studentRowsForModal.filter((student) => selectedStudentIds.includes(String(student._id)));

  const columnCount = 9;

  return (
    <div className={`flex h-full min-h-[340px] flex-col overflow-hidden rounded-xl border border-gray-200 bg-white font-sans  ${className}`}>
      <div className="h-[420px] min-h-[420px] overflow-auto custom-scrollbar">
        <table className="min-w-full whitespace-nowrap border-collapse text-left text-sm md:text-base">
          <thead className="sticky top-0 z-10 border-b border-[#d3dfd1] bg-[#edf3ec] text-[#173F30]">
            <tr>
              <th className="px-5 py-4 text-xs font-semibold uppercase tracking-wider text-[#315B46]">Year</th>
              <th className="px-5 py-4 text-xs font-semibold uppercase tracking-wider text-[#315B46]">Section</th>
              <th className="px-5 py-4 text-xs font-semibold uppercase tracking-wider text-[#315B46]">Semester</th>
              <th className="px-5 py-4 text-center text-xs font-semibold uppercase tracking-wider text-[#315B46]">Block</th>
              <th className="px-5 py-4 text-center text-xs font-semibold uppercase tracking-wider text-[#315B46]">Irregular</th>
              <th className="px-5 py-4 text-center text-xs font-semibold uppercase tracking-wider text-[#315B46]">Total</th>
              <th className="px-5 py-4 text-center text-xs font-semibold uppercase tracking-wider text-[#315B46]">Total Capacity</th>
              <th className="px-5 py-4 text-center text-xs font-semibold uppercase tracking-wider text-[#315B46]">Status</th>
              <th className="px-5 py-4 text-center text-xs font-semibold uppercase tracking-wider text-[#315B46]">Students</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {paginatedSections.length > 0 ? (
              paginatedSections.map((sec) => {
                const blockCapacity = Number(sec.blockCapacity ?? sec.regularCapacity ?? 45);
                const irregularCapacity = Number(sec.irregularCapacity ?? 5);
                const blockCount = Number(sec.blockCount ?? sec.regular ?? 0);
                const irregularCount = Number(sec.irregularCount ?? sec.irregular ?? 0);
                const total = blockCount + irregularCount;
                const status = getSectionStatus(blockCount, blockCapacity, irregularCount, irregularCapacity);

                return (
                  <tr key={sec._id || `${sec.year}-${sec.section}-${sec.semester}`} className="hover:bg-emerald-50/60 transition-colors">
                    <td className="px-5 py-4 text-gray-800">{sec.year || "—"}</td>
                    <td className="px-5 py-4 font-medium text-gray-900">{sec.section || "—"}</td>
                    <td className="px-5 py-4 text-gray-600">{sec.semester || "—"}</td>
                    <td className="px-5 py-4 text-center">
                      <button
                        type="button"
                        onClick={() => openStudentList(sec)}
                        className={`${getCapacityStateStyle(blockCount, blockCapacity)} underline underline-offset-2 hover:opacity-80`}
                        aria-label={`View enrolled students for section ${sec.section}`}
                      >
                        {`${blockCount}/${blockCapacity}`}
                      </button>
                    </td>
                    <td className="px-5 py-4 text-center">
                      <button
                        type="button"
                        onClick={() => openStudentList(sec)}
                        className={`${getCapacityStateStyle(irregularCount, irregularCapacity)} underline underline-offset-2 hover:opacity-80`}
                        aria-label={`View irregular students for section ${sec.section}`}
                      >
                        {`${irregularCount}/${irregularCapacity}`}
                      </button>
                    </td>
                    <td className="px-5 py-4 text-gray-900 font-semibold text-center">{total}</td>
                    <td className="px-5 py-4 text-center">{sec.totalCapacity}</td>
                    <td className="px-5 py-4 text-center">
                      <span className="inline-flex items-center justify-center rounded-full px-4 py-1.5 text-xs tracking-wide bg-gray-100 text-gray-700 font-bold">
                        {status}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-center">
                      <button
                        type="button"
                        onClick={() => openStudentList(sec)}
                        className="rounded-full p-2 text-gray-400 transition-colors hover:bg-gray-100 hover:text-[#2E522A] focus:outline-none focus:ring-2 focus:ring-[#2E522A]/50"
                        aria-label={`View students for section ${sec.section}`}
                      >
                        <i className="fa-solid fa-magnifying-glass" />
                      </button>
                    </td>
                  </tr>
                );
              })
            ) : (
              <tr>
                <td colSpan={columnCount} className="px-6 py-12 text-center text-gray-500">
                  <div className="flex flex-col items-center justify-center gap-2">
                    <i className="fa-regular fa-folder-open text-3xl opacity-50" />
                    <p>No sections found.</p>
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <Pagination
        currentPage={safePage}
        totalItems={sectionList.length}
        pageSize={pageSize}
        onPageChange={setCurrentPage}
        onPageSizeChange={handlePageSizeChange}
        pageSizeOptions={[10, 20, 50]}
      />

      {studentListSection &&
        createPortal(
          <div className="fixed inset-0 z-[230] flex items-center justify-center overflow-y-auto p-3 sm:p-6">
            <button
              type="button"
              className="absolute inset-0 bg-slate-950/55"
              onClick={closeStudentList}
              aria-label="Close section student list"
            />
            <div
              role="dialog"
              aria-modal="true"
              aria-label="Section student list"
              className="animate-fade relative flex max-h-[92vh] w-full max-w-7xl flex-col overflow-hidden rounded-xl border border-white/30 bg-white shadow-2xl shadow-slate-950/25"
            >
              <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-5 py-4 sm:px-6">
                <div className="min-w-0">
                  <h3 className="mt-1 truncate text-xl font-semibold tracking-tight text-slate-900 sm:text-2xl">
                    Year {studentListSection.year} - Section {studentListSection.section}
                  </h3>
                  <p className="mt-1 text-sm text-slate-500">
                    {studentListSection.semester} Semester · {studentRowsForModal.length} student
                    {studentRowsForModal.length === 1 ? "" : "s"}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={closeStudentList}
                  className="grid h-10 w-10 shrink-0 place-items-center rounded-xl text-slate-400 transition hover:bg-slate-100 hover:text-slate-800"
                  aria-label="Close section student list"
                >
                  <i className="fa-solid fa-xmark" />
                </button>
              </div>

              {moveStep === "students" && (
                <div className="flex shrink-0 items-center justify-between border-b border-slate-200 bg-white px-4 py-3">
                  <button
                    type="button"
                    onClick={() => {
                      setMoveMode((active) => !active);
                      setSelectedStudentIds([]);
                    }}
                    className="rounded-lg bg-emerald-700 px-4 py-2 text-xs font-bold text-white transition hover:bg-emerald-800"
                  >
                    {moveMode ? "Cancel" : "Move Students"}
                  </button>
                  {moveMode && (
                    <button
                      type="button"
                      onClick={() => setMoveStep("targets")}
                      disabled={selectedStudentIds.length === 0}
                      className="rounded-lg bg-emerald-600 px-4 py-2 text-xs font-bold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Change Section
                    </button>
                  )}
                </div>
              )}

              {moveStep === "students" ? (
                <div className="min-h-0 flex-1 overflow-y-auto bg-slate-50/50 p-2 sm:p-4">
                  {moveMode ? (
                    <table className="min-w-full text-sm">
                      <thead className="sticky top-0 bg-gray-50 text-gray-600">
                        <tr>
                          <th className="px-4 py-3 text-center">Select</th>
                          <th className="px-4 py-3 text-left">Student Number</th>
                          <th className="px-4 py-3 text-left">Student Name</th>
                          <th className="px-4 py-3 text-left">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {studentRowsForModal.map((student) => {
                          const studentId = String(student._id);
                          const isIrregular = String(student.status ?? "").trim().toLowerCase() === "irregular";
                          return (
                            <tr key={studentId} className={isIrregular ? "bg-amber-50/50" : ""}>
                              <td className="px-4 py-3 text-center">
                                <input
                                  type="checkbox"
                                  checked={selectedStudentIds.includes(studentId)}
                                  disabled={isIrregular}
                                  onChange={() => setSelectedStudentIds((current) =>
                                    current.includes(studentId) ? current.filter((id) => id !== studentId) : [...current, studentId]
                                  )}
                                  className="h-4 w-4 rounded border-slate-300 text-emerald-700 focus:ring-emerald-600"
                                />
                              </td>
                              <td className="px-4 py-3 font-medium">{student.studentNumber || "-"}</td>
                              <td className="px-4 py-3">{`${student.firstName ?? ""} ${student.lastName ?? ""}`.trim() || "-"}</td>
                              <td className="px-4 py-3">
                                <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${
                                  isIrregular ? "bg-amber-100 text-amber-800" : "bg-blue-100 text-blue-800"
                                }`}>
                                  {isIrregular ? "Irregular (Original Section)" : "Block"}
                                </span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  ) : (
                    <StudentsTable students={studentRowsForModal} tableHeightClass="h-full min-h-[320px]" />
                  )}
                </div>
              ) : moveStep === "targets" ? (
                <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto bg-slate-50/50 p-4">
                  <button type="button" onClick={() => setMoveStep("students")} className="self-start text-sm font-semibold text-emerald-700">Back to students</button>
                  <h4 className="text-lg font-bold text-slate-900">Select Target Section</h4>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {targetSections.map((section) => (
                      <button
                        key={`${section.year}-${section.section}-${section.semester}`}
                        type="button"
                        onClick={() => { setTargetSection(section); setMoveStep("confirm"); }}
                        className="rounded-xl border border-slate-200 bg-white p-4 text-left transition hover:border-emerald-400 hover:bg-emerald-50"
                      >
                        <p className="font-bold text-slate-900">Year {section.year} - Section {section.section}</p>
                        <p className="mt-1 text-xs text-slate-500">{section.semester} Semester · {section.total ?? 0}/{section.totalCapacity ?? 0}</p>
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto bg-slate-50/50 p-5">
                  <button type="button" onClick={() => setMoveStep("targets")} className="self-start text-sm font-semibold text-emerald-700">Back to target sections</button>
                  <h4 className="text-lg font-bold text-slate-900">CONFIRM SECTION CHANGE</h4>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="rounded-xl border border-slate-200 bg-white p-4"><p className="text-xs font-bold uppercase text-slate-500">Previous Section</p><p className="mt-2 font-semibold">Year {studentListSection.year} - Section {studentListSection.section}</p></div>
                    <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4"><p className="text-xs font-bold uppercase text-emerald-700">New Section</p><p className="mt-2 font-semibold text-emerald-900">Year {targetSection?.year} - Section {targetSection?.section}</p></div>
                  </div>
                  <p className="text-sm text-slate-600">{selectedStudents.length} student(s) will be transferred.</p>
                  <button type="button" onClick={handleMoveStudents} disabled={isMoving} className="self-end rounded-lg bg-emerald-700 px-5 py-2.5 text-sm font-bold text-white disabled:opacity-50">{isMoving ? "Changing..." : "Confirm Changes"}</button>
                </div>
              )}
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}

export default SectionTable;