import { afterEach, expect, test } from "vitest";

import { addDaysIsoDate, todayIsoDate } from "../xero-date.js";

const originalTz = process.env.TZ;

afterEach(() => {
  process.env.TZ = originalTz;
});

test("today is the local date, not the UTC date", () => {
  process.env.TZ = "Australia/Sydney";

  // 08:30 AEST on 1 July is still 30 June in UTC.
  expect(todayIsoDate(new Date("2026-06-30T22:30:00Z"))).toBe("2026-07-01");
});

test("today pads single-digit months and days", () => {
  process.env.TZ = "UTC";

  expect(todayIsoDate(new Date("2026-03-05T12:00:00Z"))).toBe("2026-03-05");
});

test("adding days crosses month and year ends on the calendar", () => {
  expect(addDaysIsoDate("2026-06-30", 1)).toBe("2026-07-01");
  expect(addDaysIsoDate("2026-12-25", 7)).toBe("2027-01-01");
  expect(addDaysIsoDate("2028-02-01", 30)).toBe("2028-03-02");
  expect(addDaysIsoDate("0050-12-31", 1)).toBe("0051-01-01");
});

test("adding days refuses a date that is not on the calendar", () => {
  expect(() => addDaysIsoDate("2026-02-31", 1)).toThrow("not a date on the calendar");
});
