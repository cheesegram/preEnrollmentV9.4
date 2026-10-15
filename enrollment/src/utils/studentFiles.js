import api from "../lib/axios";

export const sanitizeFileName = (value) =>
  String(value ?? "")
    .trim()
    .replace(/[\\/:*?"<>|]/g, "")
    .replace(/\s+/g, " ");

function downloadBlob(blob, filename) {
  const url = window.URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  window.URL.revokeObjectURL(url);
  document.body.removeChild(anchor);
}

/**
 * Export a single student's official Certificate of Registration (COR) as PDF.
 */
export async function exportStudentAsPdf(student, filenameBase) {
  const identifier = student?._id || student?.studentNumber;
  if (!identifier) throw new Error("Student ID is missing");

  const response = await api.get(`/students/${identifier}/export-pdf`, {
    responseType: "blob",
  });

  const studentName = `${String(student.lastName ?? "").trim()}_${String(student.firstName ?? "").trim()}`.trim();
  const base = filenameBase || sanitizeFileName(`COR_${student.studentNumber}_${studentName}`) || "COR_Student";
  downloadBlob(new Blob([response.data], { type: "application/pdf" }), `${base}.pdf`);
}

/**
 * Export a section's batch Certificate of Registration (COR) multi-page PDF.
 */
export async function exportSectionAsPdf({ year, section, semester }, filenameBase) {
  if (!year || !section) throw new Error("Year and section are required");

  const response = await api.get("/students/export-section-pdf", {
    params: { year, section, semester },
    responseType: "blob",
  });

  const semesterSuffix = semester && semester !== "N/A" ? `-${semester}` : "";
  const base = filenameBase || sanitizeFileName(`COR_Section_${year}-${section}${semesterSuffix}`) || "COR_Section";
  downloadBlob(new Blob([response.data], { type: "application/pdf" }), `${base}.pdf`);
}

