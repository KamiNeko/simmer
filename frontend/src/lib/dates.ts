/** Calendar days as local "YYYY-MM-DD" strings, so a plan never shifts with the time zone. */

const pad = (n: number) => String(n).padStart(2, "0");

export const isoDay = (date: Date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

export function parseDay(day: string): Date {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(day: string, n: number): string {
  const date = parseDay(day);
  date.setDate(date.getDate() + n);
  return isoDay(date);
}

export const today = () => isoDay(new Date());

/** The Monday of the week that contains the day. */
export function weekStart(day: string): string {
  const offset = (parseDay(day).getDay() + 6) % 7;
  return addDays(day, -offset);
}

export const weekDays = (start: string) => Array.from({ length: 7 }, (_, i) => addDays(start, i));

const MONTH = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short" });
const WEEKDAY = new Intl.DateTimeFormat("en-GB", { weekday: "long" });
const SHORT = new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short" });

/** "20 Oct" */
export const dayMonth = (day: string) => MONTH.format(parseDay(day));
/** "Monday" */
export const weekday = (day: string) => WEEKDAY.format(parseDay(day));
/** "Mon 20 Oct" */
export const shortDay = (day: string) => SHORT.format(parseDay(day)).replace(",", "");

/** "19 – 25 Oct" or "27 Oct – 2 Nov" */
export function weekLabel(start: string): string {
  const end = addDays(start, 6);
  const [a, b] = [parseDay(start), parseDay(end)];
  return a.getMonth() === b.getMonth() ? `${a.getDate()} – ${dayMonth(end)}` : `${dayMonth(start)} – ${dayMonth(end)}`;
}

/** "Today", "Tomorrow", or "Mon 20 Oct". */
export function relativeDay(day: string, now = today()): string {
  if (day === now) return "Today";
  if (day === addDays(now, 1)) return "Tomorrow";
  return shortDay(day);
}
