// Calendar dates are plain "YYYY-MM-DD" strings in IST; instants are UTC ISO strings
// rendered in IST, 24-hour (ADR-011, NFR-04).

const IST_OFFSET_MS = (5 * 60 + 30) * 60 * 1000;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAY_MS = 24 * 60 * 60 * 1000;

/** Today's calendar date in IST. */
export function todayIST(now = new Date()) {
  return new Date(now.getTime() + IST_OFFSET_MS).toISOString().slice(0, 10);
}

/** True for a real calendar date in "YYYY-MM-DD" form. */
export function isValidDateString(value) {
  if (typeof value !== 'string' || !DATE_PATTERN.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

/** True when the date is after today in IST (FR-EXP-04). */
export function isFutureDate(value, now = new Date()) {
  return value > todayIST(now);
}

function toUtcDate(value) {
  return new Date(`${value}T00:00:00Z`);
}

function toDateString(date) {
  return date.toISOString().slice(0, 10);
}

/** Monday–Sunday week containing the date (FR-RPT-02). */
export function weekRange(value) {
  const date = toUtcDate(value);
  const daysSinceMonday = (date.getUTCDay() + 6) % 7;
  const monday = new Date(date.getTime() - daysSinceMonday * DAY_MS);
  const sunday = new Date(monday.getTime() + 6 * DAY_MS);
  return { from: toDateString(monday), to: toDateString(sunday) };
}

/** Calendar month containing the date. */
export function monthRange(value) {
  const date = toUtcDate(value);
  const first = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
  const last = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0));
  return { from: toDateString(first), to: toDateString(last) };
}

/** "2026-09-30" → "30 Sep 2026" */
export function formatDate(value) {
  const [year, month, day] = value.split('-').map(Number);
  return `${day} ${MONTHS[month - 1]} ${year}`;
}

/** UTC ISO instant → "30 Sep 2026, 21:45" in IST. */
export function formatDateTime(isoInstant) {
  const ist = new Date(new Date(isoInstant).getTime() + IST_OFFSET_MS);
  const hours = String(ist.getUTCHours()).padStart(2, '0');
  const minutes = String(ist.getUTCMinutes()).padStart(2, '0');
  return `${formatDate(ist.toISOString().slice(0, 10))}, ${hours}:${minutes}`;
}
