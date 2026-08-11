import { CALIFORNIA_WDO_FILING_BUSINESS_DAYS } from "./config";

function parseCalendarDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year
    || date.getUTCMonth() + 1 !== month
    || date.getUTCDate() !== day
  ) return null;
  return date;
}

function formatCalendarDate(value: Date) {
  return value.toISOString().slice(0, 10);
}

function isBusinessDay(value: Date) {
  const day = value.getUTCDay();
  return day !== 0 && day !== 6;
}

export function addBusinessDays(dateValue: string, businessDays: number) {
  const date = parseCalendarDate(dateValue);
  if (!date || businessDays < 0) return null;
  let added = 0;
  while (added < businessDays) {
    date.setUTCDate(date.getUTCDate() + 1);
    if (isBusinessDay(date)) added += 1;
  }
  return formatCalendarDate(date);
}

export function businessDaysBetween(fromValue: string, toValue: string) {
  const from = parseCalendarDate(fromValue);
  const to = parseCalendarDate(toValue);
  if (!from || !to) return null;
  if (formatCalendarDate(from) === formatCalendarDate(to)) return 0;
  const direction = from < to ? 1 : -1;
  let count = 0;
  while (formatCalendarDate(from) !== formatCalendarDate(to)) {
    from.setUTCDate(from.getUTCDate() + direction);
    if (isBusinessDay(from)) count += direction;
  }
  return count;
}

export type WdoDeadline = {
  dueDate: string;
  businessDaysRemaining: number;
  tone: "normal" | "attention" | "urgent" | "overdue";
  label: string;
};

export function getCaliforniaWdoDeadline(
  activityDate: string | null,
  today: string,
): WdoDeadline | null {
  if (!activityDate) return null;
  const dueDate = addBusinessDays(activityDate, CALIFORNIA_WDO_FILING_BUSINESS_DAYS);
  if (!dueDate) return null;
  const remaining = businessDaysBetween(today, dueDate);
  if (remaining === null) return null;
  if (remaining < 0) {
    const overdue = Math.abs(remaining);
    return {
      dueDate,
      businessDaysRemaining: remaining,
      tone: "overdue",
      label: `Overdue by ${overdue} business day${overdue === 1 ? "" : "s"}`,
    };
  }
  if (remaining === 0) {
    return { dueDate, businessDaysRemaining: 0, tone: "urgent", label: "Due today" };
  }
  if (remaining === 1) {
    return { dueDate, businessDaysRemaining: 1, tone: "attention", label: "Due tomorrow" };
  }
  return {
    dueDate,
    businessDaysRemaining: remaining,
    tone: "normal",
    label: `Due in ${remaining} business days`,
  };
}

export function calendarDateInTimeZone(date: Date, timeZone: string) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}
