const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

interface CalendarDate {
  year: number;
  month: number;
  day: number;
}

/**
 * Check that a caller supplied date is a date on the calendar.
 *
 * Xero takes dates as strings inside where clauses, so an unchecked value
 * either injects filter syntax of its own or quietly changes which records
 * come back. "2026-02-31" is rejected here rather than rolling into March.
 */
export function assertIsoDate(field: string, value: string): CalendarDate {
  const match = ISO_DATE.exec(value);

  if (!match) {
    throw new Error(
      `${field} must be a date in YYYY-MM-DD format, received "${value}"`,
    );
  }

  const [year, month, day] = match.slice(1).map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));

  if (parsed.getUTCMonth() !== month - 1 || parsed.getUTCDate() !== day) {
    throw new Error(`${field} is not a date on the calendar: "${value}"`);
  }

  return { year, month, day };
}

/**
 * Reject a range whose start falls after its end.
 *
 * Xero joins the two comparisons with AND, so a reversed range comes back as
 * an empty result that reads like the contact having no activity.
 */
export function assertDateRange(fromDate: string, toDate: string): void {
  assertIsoDate("fromDate", fromDate);
  assertIsoDate("toDate", toDate);

  if (fromDate > toDate) {
    throw new Error(
      `fromDate "${fromDate}" is after toDate "${toDate}", so the range holds no dates`,
    );
  }
}

/**
 * Render a validated date as the DateTime literal Xero where clauses expect.
 */
export function toXeroDateFilter(field: string, value: string): string {
  const { year, month, day } = assertIsoDate(field, value);

  return `DateTime(${year},${month},${day})`;
}

/**
 * Today's date where this server runs, as YYYY-MM-DD.
 *
 * toISOString() gives the UTC date. In Australia that is still yesterday
 * until 10:00 AEST (11:00 AEDT), so a morning entry on 1 July landed in the
 * previous financial year. Set TZ to the organisation's time zone when the
 * server runs somewhere else.
 */
export function todayIsoDate(now: Date = new Date()): string {
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

/**
 * Move a YYYY-MM-DD date by whole calendar days.
 */
export function addDaysIsoDate(value: string, days: number): string {
  const { year, month, day } = assertIsoDate("date", value);
  return new Date(Date.UTC(year, month - 1, day + days))
    .toISOString()
    .split("T")[0];
}
