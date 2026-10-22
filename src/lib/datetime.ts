/**
 * Business-calendar helpers.
 *
 * All reporting periods in Kapy Pharma are Egypt local time (Africa/Cairo).
 * The server/database store UTC timestamps, so "today" and "this month" must be
 * converted to explicit UTC start/end instants before querying. Using
 * `new Date(year, month, 1)` or SQL `DATE(createdAt)` relies on the server's
 * timezone (usually UTC) and puts invoices created between 00:00 and 02:00 (or
 * 03:00 during DST) into the previous day.
 */
export const BUSINESS_TIME_ZONE = "Africa/Cairo";

interface ZonedParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  millisecond: number;
}

const formatters = new Map<string, Intl.DateTimeFormat>();

function getFormatter(timeZone: string): Intl.DateTimeFormat {
  let formatter = formatters.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-US", {
      timeZone,
      calendar: "gregory",
      numberingSystem: "latn",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    });
    formatters.set(timeZone, formatter);
  }
  return formatter;
}

/** Calendar fields as they appear on a clock in `timeZone`. */
export function getZonedParts(
  date: Date,
  timeZone = BUSINESS_TIME_ZONE
): ZonedParts {
  const parts = getFormatter(timeZone).formatToParts(date);
  const values: Record<string, string> = {};
  for (const part of parts) {
    if (part.type !== "literal") values[part.type] = part.value;
  }

  const hour = Number(values.hour);
  return {
    year: Number(values.year),
    month: Number(values.month),
    day: Number(values.day),
    hour: hour === 24 ? 0 : hour,
    minute: Number(values.minute),
    second: Number(values.second),
    millisecond: date.getUTCMilliseconds(),
  };
}

/** Offset of `timeZone` from UTC at a given instant, in milliseconds. */
function getTimeZoneOffsetMs(date: Date, timeZone: string): number {
  const parts = getZonedParts(date, timeZone);
  const asUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
    parts.millisecond
  );
  return asUtc - date.getTime();
}

/**
 * Convert wall-clock fields in `timeZone` to a UTC instant.
 * Two passes handle DST offset changes around the requested wall time.
 */
export function zonedDateTimeToUtc(
  parts: Omit<ZonedParts, "millisecond"> & { millisecond?: number },
  timeZone = BUSINESS_TIME_ZONE
): Date {
  const wallClockMs = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
    parts.millisecond ?? 0
  );

  let utcMs = wallClockMs;
  for (let i = 0; i < 2; i++) {
    utcMs = wallClockMs - getTimeZoneOffsetMs(new Date(utcMs), timeZone);
  }
  return new Date(utcMs);
}

function addCalendarDays(parts: ZonedParts, days: number): ZonedParts {
  const date = new Date(
    Date.UTC(parts.year, parts.month - 1, parts.day + days, 0, 0, 0, 0)
  );
  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
    hour: 0,
    minute: 0,
    second: 0,
    millisecond: 0,
  };
}

/** Local-day boundaries as UTC instants. `endExclusive` is next midnight. */
export function getZonedDayRange(
  date: Date,
  timeZone = BUSINESS_TIME_ZONE
): { start: Date; endExclusive: Date } {
  const parts = getZonedParts(date, timeZone);
  const start = zonedDateTimeToUtc(
    { ...parts, hour: 0, minute: 0, second: 0, millisecond: 0 },
    timeZone
  );
  const next = addCalendarDays(parts, 1);
  const endExclusive = zonedDateTimeToUtc(
    { ...next, hour: 0, minute: 0, second: 0, millisecond: 0 },
    timeZone
  );
  return { start, endExclusive };
}

/** Local-month boundaries as UTC instants. `endExclusive` is next month start. */
export function getZonedMonthRange(
  year: number,
  month: number,
  timeZone = BUSINESS_TIME_ZONE
): { start: Date; endExclusive: Date } {
  const start = zonedDateTimeToUtc(
    {
      year,
      month,
      day: 1,
      hour: 0,
      minute: 0,
      second: 0,
      millisecond: 0,
    },
    timeZone
  );

  const nextMonthUtc = new Date(Date.UTC(year, month, 1, 0, 0, 0, 0));
  const endExclusive = zonedDateTimeToUtc(
    {
      year: nextMonthUtc.getUTCFullYear(),
      month: nextMonthUtc.getUTCMonth() + 1,
      day: 1,
      hour: 0,
      minute: 0,
      second: 0,
      millisecond: 0,
    },
    timeZone
  );

  return { start, endExclusive };
}

/** `YYYY-MM-DD` for the local calendar date of an instant. */
export function getZonedDateKey(
  date: Date,
  timeZone = BUSINESS_TIME_ZONE
): string {
  const parts = getZonedParts(date, timeZone);
  return `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(
    parts.day
  ).padStart(2, "0")}`;
}

/** Local year/month of an instant. */
export function getZonedYearMonth(
  date: Date,
  timeZone = BUSINESS_TIME_ZONE
): { year: number; month: number } {
  const parts = getZonedParts(date, timeZone);
  return { year: parts.year, month: parts.month };
}

/**
 * Parse an `<input type="date">` value (`YYYY-MM-DD`) as local midnight.
 * Returns null for malformed/rolled-over dates.
 */
export function parseDateInputToZonedStart(
  value: string,
  timeZone = BUSINESS_TIME_ZONE
): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;

  const probe = new Date(Date.UTC(year, month - 1, day));
  if (
    probe.getUTCFullYear() !== year ||
    probe.getUTCMonth() !== month - 1 ||
    probe.getUTCDate() !== day
  ) {
    return null;
  }

  return zonedDateTimeToUtc(
    { year, month, day, hour: 0, minute: 0, second: 0, millisecond: 0 },
    timeZone
  );
}

/**
 * Generate local date keys for the last `days` calendar days (oldest first),
 * ending with the local date of `now`. Safe across DST transitions.
 */
export function getZonedDateKeysForLastDays(
  days: number,
  now = new Date(),
  timeZone = BUSINESS_TIME_ZONE
): string[] {
  const parts = getZonedParts(now, timeZone);
  const keys: string[] = [];

  for (let offset = days - 1; offset >= 0; offset--) {
    const date = new Date(
      Date.UTC(parts.year, parts.month - 1, parts.day - offset)
    );
    keys.push(
      `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(
        2,
        "0"
      )}-${String(date.getUTCDate()).padStart(2, "0")}`
    );
  }

  return keys;
}
