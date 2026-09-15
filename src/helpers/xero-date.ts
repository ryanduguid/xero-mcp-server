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
 * Render a validated date as the DateTime literal Xero where clauses expect.
 */
export function toXeroDateFilter(field: string, value: string): string {
  const { year, month, day } = assertIsoDate(field, value);

  return `DateTime(${year},${month},${day})`;
}
