const YEAR_ALIASES = {
  1: "1",
  "1st": "1",
  first: "1",
  "first year": "1",
  "year 1": "1",
  2: "2",
  "2nd": "2",
  second: "2",
  "second year": "2",
  "year 2": "2",
  3: "3",
  "3rd": "3",
  third: "3",
  "third year": "3",
  "year 3": "3",
  4: "4",
  "4th": "4",
  fourth: "4",
  "fourth year": "4",
  "year 4": "4",
};

const SEMESTER_ALIASES = {
  1: "1st",
  "1st": "1st",
  first: "1st",
  "first semester": "1st",
  "1st sem": "1st",
  "1st semester": "1st",
  2: "2nd",
  "2nd": "2nd",
  second: "2nd",
  "second semester": "2nd",
  "2nd sem": "2nd",
  "2nd semester": "2nd",
};

function normalizeText(value) {
  return String(value ?? "").trim().toLowerCase();
}

export function normalizeYearValue(value) {
  const text = normalizeText(value);
  if (YEAR_ALIASES[text]) return YEAR_ALIASES[text];
  const match = text.match(/\b([1-4])\b/);
  return match ? match[1] : null;
}

export function normalizeSemesterValue(value) {
  const text = normalizeText(value);
  if (SEMESTER_ALIASES[text]) return SEMESTER_ALIASES[text];
  if (text.includes("2")) return "2nd";
  if (text.includes("1")) return "1st";
  return null;
}

export function normalizeSectionValue(value) {
  const normalized = String(value ?? "").trim().toUpperCase();
  return normalized || null;
}

export function parseSectionName(sectionName) {
  const normalized = normalizeSectionValue(sectionName);
  if (!normalized) {
    return { year: null, section: null };
  }

  // Matches patterns like "BSIT-2A", "BSIT 2A", "BSIT2A", "2A", "2-A", "SECTION 2A", "SEC-2A"
  const match = normalized.match(/^(?:[A-Z\s]+[-_/\s]*)?(\d+)\s*[-_/\s]?\s*([A-Z0-9]+)$/);
  if (match) {
    return {
      year: match[1],
      section: match[2],
    };
  }

  // Matches patterns like "SECTION A", "SEC A"
  const secMatch = normalized.match(/^(?:SECTION|SEC)?\s*([A-Z0-9]+)$/);
  if (secMatch) {
    return {
      year: null,
      section: secMatch[1],
    };
  }

  return {
    year: null,
    section: normalized,
  };
}

export function buildScheduleKey({ year, semester, section }) {
  const normalizedYear = normalizeYearValue(year);
  const normalizedSemester = normalizeSemesterValue(semester);
  const normalizedSection = normalizeSectionValue(section);

  if (normalizedYear && normalizedSemester && normalizedSection) {
    return `${normalizedYear}::${normalizedSemester}::${normalizedSection}`;
  }

  if (normalizedSection) {
    return `section::${normalizedSection}`;
  }

  return null;
}

export function buildStudentScheduleKeys(student) {
  const parsedSection = parseSectionName(student?.section);
  const normalizedYear = normalizeYearValue(student?.year ?? parsedSection.year);
  const normalizedSemester = normalizeSemesterValue(student?.semester) || "1st";
  const rawSection = normalizeSectionValue(student?.section);
  const cleanSection = parsedSection.section || rawSection;

  const keys = [];

  if (normalizedYear && normalizedSemester) {
    if (cleanSection) {
      keys.push(`${normalizedYear}::${normalizedSemester}::${cleanSection}`);
      if (!cleanSection.startsWith(normalizedYear)) {
        keys.push(`${normalizedYear}::${normalizedSemester}::${normalizedYear}${cleanSection}`);
      }
    }
    if (rawSection && rawSection !== cleanSection) {
      keys.push(`${normalizedYear}::${normalizedSemester}::${rawSection}`);
    }
  }

  if (cleanSection) {
    keys.push(`section::${cleanSection}`);
    if (normalizedYear && !cleanSection.startsWith(normalizedYear)) {
      keys.push(`section::${normalizedYear}${cleanSection}`);
    }
  }
  if (rawSection && rawSection !== cleanSection) {
    keys.push(`section::${rawSection}`);
  }

  if (Array.isArray(student?.irregularSection) || Array.isArray(student?.irregularYear)) {
    const irregYears = Array.isArray(student?.irregularYear) ? student.irregularYear : [];
    const irregSecs = Array.isArray(student?.irregularSection) ? student.irregularSection : [];
    const maxLen = Math.max(irregYears.length, irregSecs.length);
    for (let i = 0; i < maxLen; i += 1) {
      const pSec = parseSectionName(irregSecs[i]);
      const y = normalizeYearValue(irregYears[i] ?? pSec.year ?? normalizedYear);
      const s = pSec.section || normalizeSectionValue(irregSecs[i]);
      if (y && normalizedSemester && s) {
        keys.push(`${y}::${normalizedSemester}::${s}`);
        if (!s.startsWith(y)) {
          keys.push(`${y}::${normalizedSemester}::${y}${s}`);
        }
      }
    }
  }

  return [...new Set(keys.filter(Boolean))];
}

export function resolveScheduleRowKeys(schedule, row) {
  const parsedRow = parseSectionName(row?.sectionName ?? row?.section);
  const parsedSched = parseSectionName(schedule?.sectionName ?? schedule?.section);

  const resolvedYear = normalizeYearValue(
    row?.year ?? schedule?.year ?? parsedRow.year ?? parsedSched.year
  );
  const resolvedSemester = normalizeSemesterValue(
    row?.semester ?? row?.sem ?? schedule?.semester
  );

  const rawRowSection = normalizeSectionValue(row?.sectionName ?? row?.section);
  const rawSchedSection = normalizeSectionValue(schedule?.sectionName ?? schedule?.section);

  const sectionCandidates = [
    parsedRow.section,
    parsedSched.section,
    rawSchedSection,
    rawRowSection,
  ].filter(Boolean);

  const keys = [];
  for (const sec of sectionCandidates) {
    const key = buildScheduleKey({
      year: resolvedYear,
      semester: resolvedSemester,
      section: sec,
    });
    if (key) keys.push(key);

    if (resolvedYear && resolvedSemester && sec && !sec.startsWith(resolvedYear)) {
      keys.push(`${resolvedYear}::${resolvedSemester}::${resolvedYear}${sec}`);
    }
  }

  return [...new Set(keys.filter(Boolean))];
}

export function resolveScheduleRowKey(schedule, row) {
  const keys = resolveScheduleRowKeys(schedule, row);
  return keys[0] || null;
}

export function buildScheduleMap(scheduleDocuments) {
  const scheduleMap = new Map();
  const sortedSchedules = [...(Array.isArray(scheduleDocuments) ? scheduleDocuments : [])].sort((left, right) => {
    const leftTime = new Date(left?.generated_at ?? left?.createdAt ?? 0).getTime();
    const rightTime = new Date(right?.generated_at ?? right?.createdAt ?? 0).getTime();
    return rightTime - leftTime;
  });

  for (const schedule of sortedSchedules) {
    const classes = Array.isArray(schedule?.classes) ? schedule.classes : [];
    const groupedRows = new Map();

    for (const row of classes) {
      const keys = resolveScheduleRowKeys(schedule, row);
      for (const key of keys) {
        if (!groupedRows.has(key)) {
          groupedRows.set(key, []);
        }
        groupedRows.get(key).push(row);
      }
    }

    // Top-level document key fallback in case rows didn't cover top-level metadata
    const topParsed = parseSectionName(schedule?.sectionName ?? schedule?.section);
    const topYear = normalizeYearValue(schedule?.year ?? topParsed.year);
    const topSemester = normalizeSemesterValue(schedule?.semester);
    const topSections = [topParsed.section, normalizeSectionValue(schedule?.section)].filter(Boolean);
    for (const sec of topSections) {
      const topKey = buildScheduleKey({ year: topYear, semester: topSemester, section: sec });
      if (topKey && !groupedRows.has(topKey) && classes.length > 0) {
        groupedRows.set(topKey, classes);
      }
      if (topYear && topSemester && sec && !sec.startsWith(topYear)) {
        const topYearKey = `${topYear}::${topSemester}::${topYear}${sec}`;
        if (!groupedRows.has(topYearKey) && classes.length > 0) {
          groupedRows.set(topYearKey, classes);
        }
      }
    }

    groupedRows.forEach((rows, key) => {
      if (!scheduleMap.has(key)) {
        scheduleMap.set(key, rows);
      }
    });
  }

  return scheduleMap;
}

export function formatScheduleTimeValue(value) {
  if (value === null || value === undefined || value === "") return "—";

  if (typeof value === "number" && Number.isFinite(value)) {
    const hours = Math.floor(value / 60);
    const minutes = value % 60;
    const period = hours >= 12 ? "PM" : "AM";
    const normalizedHours = hours % 12 === 0 ? 12 : hours % 12;
    return `${String(normalizedHours).padStart(2, "0")}:${String(minutes).padStart(2, "0")} ${period}`;
  }

  return String(value);
}

export function formatScheduleTimeRange(startTime, endTime) {
  return `${formatScheduleTimeValue(startTime)} - ${formatScheduleTimeValue(endTime)}`;
}