/**
 * Date helpers shared by the Live Trips pages.
 *
 * Trip rows store dates as "YYYY-MM-DD" strings. All comparisons are
 * made at local-day granularity so a trip that starts today is ACTIVE,
 * a trip that has not started is UPCOMING, and a trip whose end date
 * has passed is COMPLETED.
 */

const MONTH_LABELS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

/** Local-time "YYYY-MM-DD" for a Date. */
export function toIsoDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/** Today's local "YYYY-MM-DD". */
export function todayIso(): string {
  return toIsoDate(new Date());
}

/** "2026-09-07" -> "7 Sep 2026" */
export function formatDateDisplay(iso: string | null | undefined): string {
  if (!iso) {
    return "TBA";
  }

  const parts = iso.split("-");

  if (parts.length !== 3) {
    return iso;
  }

  const year = parts[0];
  const month = Number(parts[1]);
  const day = Number(parts[2]);

  if (!Number.isFinite(month) || !Number.isFinite(day)) {
    return iso;
  }

  return `${day} ${MONTH_LABELS[month - 1] ?? ""} ${year}`.trim();
}

/** "2026-09-07" -> "7 Sep" */
export function formatShortDate(iso: string | null | undefined): string {
  if (!iso) {
    return "TBA";
  }

  const parts = iso.split("-");

  if (parts.length !== 3) {
    return iso;
  }

  const month = Number(parts[1]);
  const day = Number(parts[2]);

  if (!Number.isFinite(month) || !Number.isFinite(day)) {
    return iso;
  }

  return `${day} ${MONTH_LABELS[month - 1] ?? ""}`.trim();
}

/** "7 Sep 2026 - 12 Sep 2026" (collapses equal dates). */
export function formatDateRange(
  start: string | null | undefined,
  end: string | null | undefined
): string {
  if (!start && !end) {
    return "Dates not set";
  }

  if (start === end) {
    return formatDateDisplay(start);
  }

  const startText = formatShortDate(start);
  const endText = formatDateDisplay(end);

  if (!start) {
    return `Until ${endText}`;
  }

  if (!end) {
    return `From ${startText}`;
  }

  return `${startText} - ${endText}`;
}

/** Whole days from `startIso` to `endIso` (endIso - startIso). */
export function dayDifference(
  startIso: string,
  endIso: string
): number {
  const start = new Date(`${startIso}T00:00:00`);
  const end = new Date(`${endIso}T00:00:00`);
  return Math.round((end.getTime() - start.getTime()) / 86400000);
}

/** Whole days from today until `iso` (>0 future, <0 past, 0 today). */
export function daysUntil(iso: string | null | undefined): number | null {
  if (!iso) {
    return null;
  }

  return dayDifference(todayIso(), iso);
}

/** Trip length in days (inclusive), or null when dates are missing. */
export function tripDurationDays(
  start: string | null | undefined,
  end: string | null | undefined
): number | null {
  if (!start || !end) {
    return null;
  }

  return dayDifference(start, end) + 1;
}

/** 1-based day-of-trip index, or null when the trip is not ongoing. */
export function activeDayIndex(
  start: string | null | undefined,
  end: string | null | undefined
): number | null {
  if (!start || !end) {
    return null;
  }

  const today = todayIso();

  if (today < start || today > end) {
    return null;
  }

  return dayDifference(start, today) + 1;
}