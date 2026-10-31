const WEEKDAY_INDEX: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

export interface ZonedParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  weekday: number;
  key: string;
}

function partMap(ms: number, timeZone: string, weekday: boolean): Record<string, string> {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    weekday: weekday ? "short" : undefined,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(new Date(ms));
  const map: Record<string, string> = {};
  for (const part of parts) {
    if (part.type !== "literal") map[part.type] = part.value;
  }
  if (map.hour === "24") map.hour = "00";
  return map;
}

export function zonedParts(ms: number, timeZone: string): ZonedParts {
  const map = partMap(ms, timeZone, true);
  const year = Number(map.year);
  const month = Number(map.month);
  const day = Number(map.day);
  const hour = Number(map.hour);
  const weekday = WEEKDAY_INDEX[map.weekday ?? ""] ?? 0;
  const key = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  return { year, month, day, hour, weekday, key };
}

/** Milliseconds to add to a UTC timestamp to get the zone's wall clock, encoded as UTC. */
export function timeZoneOffsetMs(utcMs: number, timeZone: string): number {
  const map = partMap(utcMs, timeZone, false);
  const asUtc = Date.UTC(
    Number(map.year),
    Number(map.month) - 1,
    Number(map.day),
    Number(map.hour),
    Number(map.minute),
    Number(map.second),
  );
  return asUtc - utcMs;
}

export function addDays(key: string, days: number): string {
  const [year, month, day] = key.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + days);
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Date-only values are local midnights in `timeZone`. Full ISO timestamps stay absolute. */
export function parseBound(input: string, timeZone: string, edge: "start" | "end"): number {
  if (/[Tt]/.test(input) || /Z$|[+-]\d\d:?\d\d$/.test(input)) {
    const ms = Date.parse(input);
    if (Number.isNaN(ms)) throw new Error(`Invalid date: ${input}`);
    return ms;
  }
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(input);
  if (!match) throw new Error(`Invalid date: ${input}`);
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = edge === "end" ? 23 : 0;
  const minute = edge === "end" ? 59 : 0;
  const second = edge === "end" ? 59 : 0;
  const millis = edge === "end" ? 999 : 0;
  return zonedCivilToUtc(year, month, day, hour, minute, second, millis, timeZone);
}

function zonedCivilToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  second: number,
  millis: number,
  timeZone: string,
): number {
  const wall = Date.UTC(year, month - 1, day, hour, minute, second, millis);
  const first = wall - timeZoneOffsetMs(wall, timeZone);
  return wall - timeZoneOffsetMs(first, timeZone);
}
