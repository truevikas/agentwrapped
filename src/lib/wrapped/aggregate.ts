import { fileDisplay } from "./redact.ts";
import { defaultPriceTable, estimateEventCost, type PriceTable } from "./prices.ts";
import { addDays, zonedParts } from "./time.ts";
import type { AgentStat, SessionEvent, SessionHighlight, WrappedStats } from "./types.ts";

export interface AggregateOptions {
  year?: number;
  fromMs?: number;
  toMs?: number;
  timeZone?: string;
  includeCost?: boolean;
  prices?: PriceTable;
  redact?: boolean;
  homeDir?: string;
}

export function aggregate(events: SessionEvent[], options: AggregateOptions = {}): WrappedStats {
  const timeZone = options.timeZone ?? "UTC";
  const includeCost = options.includeCost !== false;
  const prices = options.prices ?? defaultPriceTable();
  const kept = events.filter((event) => inRange(event, options, timeZone));

  let inputTokens = 0;
  let outputTokens = 0;
  let freshInputTokens = 0;
  let cacheReadTokens = 0;
  let cacheCreateTokens = 0;
  let spendUsd = 0;
  let pricedWithDefault = false;
  let turns = 0;

  const sessions = new Map<string, { agentId: string; min: number; max: number; tokens: number }>();
  const hours = new Map<number, number>();
  const hourCounts = Array.from({ length: 24 }, () => 0);
  const weekdays = new Map<number, number>();
  const days = new Set<string>();
  const fileCounts = new Map<string, { path: string; label: string; base: string; count: number }>();
  const models = new Map<string, { turns: number; tokens: number }>();
  const agentSessions = new Map<string, Set<string>>();
  const agentTurns = new Map<string, number>();
  const agentTokens = new Map<string, number>();

  for (const event of kept) {
    const zone = zonedParts(event.ts, timeZone);
    const session = sessions.get(event.sessionId) ?? {
      agentId: event.agentId,
      min: event.ts,
      max: event.ts,
      tokens: 0,
    };
    session.min = Math.min(session.min, event.ts);
    session.max = Math.max(session.max, event.ts);
    sessions.set(event.sessionId, session);
    days.add(zone.key);

    const bucket = agentSessions.get(event.agentId) ?? new Set<string>();
    bucket.add(event.sessionId);
    agentSessions.set(event.agentId, bucket);

    if (event.kind === "turn") {
      turns += 1;
      const input = event.inputTokens ?? 0;
      const output = event.outputTokens ?? 0;
      inputTokens += input;
      outputTokens += output;
      freshInputTokens += event.freshInputTokens ?? 0;
      cacheReadTokens += event.cacheReadTokens ?? 0;
      cacheCreateTokens += event.cacheCreateTokens ?? 0;
      session.tokens += input + output;
      hours.set(zone.hour, (hours.get(zone.hour) ?? 0) + 1);
      hourCounts[zone.hour] += 1;
      weekdays.set(zone.weekday, (weekdays.get(zone.weekday) ?? 0) + 1);
      agentTurns.set(event.agentId, (agentTurns.get(event.agentId) ?? 0) + 1);
      agentTokens.set(event.agentId, (agentTokens.get(event.agentId) ?? 0) + input + output);
      if (event.model) {
        const model = models.get(event.model) ?? { turns: 0, tokens: 0 };
        model.turns += 1;
        model.tokens += input + output;
        models.set(event.model, model);
      }
      if (includeCost) {
        const cost = estimateEventCost(event, prices);
        spendUsd += cost.usd;
        pricedWithDefault = pricedWithDefault || cost.usedDefault;
      }
    }

    for (const file of event.filesTouched ?? []) {
      const display = fileDisplay(file, { redact: options.redact, homeDir: options.homeDir });
      const prev = fileCounts.get(display.path);
      if (prev) prev.count += 1;
      else fileCounts.set(display.path, { ...display, count: 1 });
    }
  }

  const highlights = [...sessions.entries()].map(([sessionId, info]) => ({
    sessionId,
    agentId: info.agentId,
    durationMs: Math.max(0, info.max - info.min),
    tokens: info.tokens,
    startedAt: info.min,
  }));

  const longestSession = pickHighlight(highlights, (item) => item.durationMs, (item) => item.tokens);
  const mostTokenSession = pickHighlight(highlights, (item) => item.tokens, (item) => item.durationMs);
  const streak = longestStreak([...days].sort());

  const agents: AgentStat[] = [...agentSessions.entries()]
    .map(([id, set]) => ({
      id,
      sessions: set.size,
      turns: agentTurns.get(id) ?? 0,
      tokens: agentTokens.get(id) ?? 0,
    }))
    .sort((a, b) => b.tokens - a.tokens || a.id.localeCompare(b.id));

  return {
    timeZone,
    sessions: sessions.size,
    turns,
    inputTokens,
    outputTokens,
    freshInputTokens,
    cacheReadTokens,
    cacheCreateTokens,
    spendUsd: includeCost ? spendUsd : null,
    pricedWithDefault: includeCost ? pricedWithDefault : false,
    busiestHour: modeKey(hours),
    busiestWeekday: modeKey(weekdays),
    hourCounts,
    topFiles: [...fileCounts.values()].sort((a, b) => b.count - a.count || a.path.localeCompare(b.path)).slice(0, 10),
    topModels: [...models.entries()]
      .map(([model, info]) => ({ model, ...info }))
      .sort((a, b) => b.tokens - a.tokens || b.turns - a.turns || a.model.localeCompare(b.model)),
    longestSession,
    mostTokenSession,
    streakDays: streak.days,
    streakStart: streak.start,
    streakEnd: streak.end,
    agents,
    activeDays: days.size,
  };
}

function inRange(event: SessionEvent, options: AggregateOptions, timeZone: string): boolean {
  if (options.year != null && zonedParts(event.ts, timeZone).year !== options.year) return false;
  if (options.fromMs != null && event.ts < options.fromMs) return false;
  if (options.toMs != null && event.ts > options.toMs) return false;
  return true;
}

function modeKey(counts: Map<number, number>): number | null {
  let best: number | null = null;
  let bestCount = -1;
  for (const [key, count] of [...counts.entries()].sort((a, b) => a[0] - b[0])) {
    if (count > bestCount) {
      best = key;
      bestCount = count;
    }
  }
  return best;
}

function pickHighlight(
  items: SessionHighlight[],
  primary: (item: SessionHighlight) => number,
  secondary: (item: SessionHighlight) => number,
): SessionHighlight | null {
  if (!items.length) return null;
  return [...items].sort((a, b) => secondary(b) - secondary(a) || a.sessionId.localeCompare(b.sessionId)).sort(
    (a, b) => primary(b) - primary(a) || secondary(b) - secondary(a) || a.sessionId.localeCompare(b.sessionId),
  )[0];
}

function longestStreak(days: string[]): { days: number; start: string | null; end: string | null } {
  if (!days.length) return { days: 0, start: null, end: null };
  let bestStart = days[0];
  let bestEnd = days[0];
  let best = 1;
  let runStart = days[0];
  let run = 1;
  for (let i = 1; i < days.length; i += 1) {
    if (days[i] === addDays(days[i - 1], 1)) {
      run += 1;
    } else if (days[i] !== days[i - 1]) {
      run = 1;
      runStart = days[i];
    }
    if (run > best) {
      best = run;
      bestStart = runStart;
      bestEnd = days[i];
    }
  }
  return { days: best, start: bestStart, end: bestEnd };
}
