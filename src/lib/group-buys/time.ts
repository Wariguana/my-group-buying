const TAIPEI_OFFSET_MS = 8 * 60 * 60 * 1000;
const DATETIME_LOCAL_PATTERN = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;

export function parseTaipeiDateTimeLocal(value: string): Date | null {
  const match = DATETIME_LOCAL_PATTERN.exec(value);
  if (!match) return null;

  const [, yearText, monthText, dayText, hourText, minuteText] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const hour = Number(hourText);
  const minute = Number(minuteText);
  if (month < 1 || month > 12 || day < 1 || day > 31 || hour > 23 || minute > 59) return null;

  const localAsUtc = new Date(0);
  localAsUtc.setUTCFullYear(year, month - 1, day);
  localAsUtc.setUTCHours(hour, minute, 0, 0);
  if (
    localAsUtc.getUTCFullYear() !== year
    || localAsUtc.getUTCMonth() !== month - 1
    || localAsUtc.getUTCDate() !== day
    || localAsUtc.getUTCHours() !== hour
    || localAsUtc.getUTCMinutes() !== minute
  ) return null;

  return new Date(localAsUtc.getTime() - TAIPEI_OFFSET_MS);
}

export function formatTaipeiDateTimeLocal(value: Date): string {
  const local = new Date(value.getTime() + TAIPEI_OFFSET_MS);
  const year = String(local.getUTCFullYear()).padStart(4, "0");
  const month = String(local.getUTCMonth() + 1).padStart(2, "0");
  const day = String(local.getUTCDate()).padStart(2, "0");
  const hour = String(local.getUTCHours()).padStart(2, "0");
  const minute = String(local.getUTCMinutes()).padStart(2, "0");
  return `${year}-${month}-${day}T${hour}:${minute}`;
}

export const taipeiDisplayFormatter = new Intl.DateTimeFormat("zh-TW", {
  timeZone: "Asia/Taipei",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});
