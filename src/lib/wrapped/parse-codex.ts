import { asRecord, jsonLines, num, parseTs, sessionIdFromPath } from "./parse-claude.ts";
import type { LogSource, SessionEvent } from "./types.ts";

const PATCH_FILE = /^\*\*\*\s+(?:Update|Add|Delete)\s+File:\s+(.+?)\s*$/gm;

/**
 * Parse OpenAI Codex CLI session logs.
 * Rollout files (`~/.codex/sessions/.../rollout-*.jsonl`) use cumulative
 * `token_count` totals. `codex exec --json` transcripts use per-turn
 * `turn.completed` usage and are treated as deltas already.
 */
export function parseCodexJsonl(text: string, source: LogSource = { path: "rollout.jsonl" }): SessionEvent[] {
  const lines = jsonLines(text);
  const fallbackTs = timestampFromFilename(source.path);
  let sessionId = source.sessionId ?? sessionIdFromPath(source.path);
  let model: string | undefined;
  let cacheIsSubset: boolean | null = null;
  const prev = { input: 0, cached: 0, output: 0 };
  const events: SessionEvent[] = [];

  for (const record of lines) {
    const ts = parseTs(record.timestamp) ?? fallbackTs ?? 0;
    if (record.type === "session_meta") {
      const payload = asRecord(record.payload);
      if (typeof payload?.id === "string") sessionId = payload.id;
      const metaTs = parseTs(payload?.timestamp);
      if (metaTs != null && events.length === 0) {
        // session start is not itself a turn
      }
      continue;
    }
    if (record.type === "turn_context") {
      const payload = asRecord(record.payload);
      if (typeof payload?.model === "string") model = payload.model;
      continue;
    }
    if (record.type === "thread.started" && typeof record.thread_id === "string") {
      sessionId = record.thread_id;
      continue;
    }
    if (record.type === "response_item") {
      const files = filesFromResponseItem(asRecord(record.payload));
      if (files.length && ts) {
        events.push(editEvent(ts, sessionId, model, files));
      }
      continue;
    }
    if (record.type === "item.completed" || record.type === "item.started") {
      const files = filesFromExecItem(asRecord(record.item));
      if (files.length && ts) events.push(editEvent(ts, sessionId, model, files));
      continue;
    }
    if (record.type === "turn.completed") {
      const usage = asRecord(record.usage);
      if (!usage || !ts) continue;
      const split = splitUsage(num(usage.input_tokens), cachedOf(usage), num(usage.output_tokens), cacheIsSubset);
      events.push(turnEvent(ts, sessionId, model, split));
      continue;
    }
    if (record.type !== "event_msg") continue;
    const payload = asRecord(record.payload);
    if (!payload || payload.type !== "token_count" || !ts) continue;
    const info = asRecord(payload.info);
    if (!info) continue;
    if (typeof info.model === "string") model = info.model;
    const total = asRecord(info.total_token_usage);
    const last = asRecord(info.last_token_usage);
    const snapshot = total ?? last;
    if (!snapshot) continue;
    if (cacheIsSubset == null) cacheIsSubset = inferCacheSubset(snapshot);

    if (total) {
      const cur = {
        input: num(total.input_tokens),
        cached: cachedOf(total),
        output: num(total.output_tokens),
      };
      const delta = {
        input: Math.max(0, cur.input - prev.input),
        cached: Math.max(0, cur.cached - prev.cached),
        output: Math.max(0, cur.output - prev.output),
      };
      prev.input = cur.input;
      prev.cached = cur.cached;
      prev.output = cur.output;
      if (delta.input === 0 && delta.cached === 0 && delta.output === 0) continue;
      const split = splitCounts(delta.input, delta.cached, delta.output, cacheIsSubset);
      events.push(turnEvent(ts, sessionId, model, split));
      continue;
    }

    const split = splitUsage(num(last?.input_tokens), cachedOf(last), num(last?.output_tokens), cacheIsSubset);
    if (split.fresh + split.cacheRead + split.output === 0) continue;
    events.push(turnEvent(ts, sessionId, model, split));
  }

  return events.sort((a, b) => a.ts - b.ts);
}

function editEvent(ts: number, sessionId: string, model: string | undefined, files: string[]): SessionEvent {
  return {
    ts,
    model,
    filesTouched: files,
    kind: "edit",
    sessionId,
    agentId: "codex",
  };
}

interface Split {
  fresh: number;
  cacheRead: number;
  output: number;
}

function turnEvent(ts: number, sessionId: string, model: string | undefined, split: Split): SessionEvent {
  return {
    ts,
    model,
    inputTokens: split.fresh + split.cacheRead,
    outputTokens: split.output,
    freshInputTokens: split.fresh,
    cacheReadTokens: split.cacheRead,
    cacheCreateTokens: 0,
    kind: "turn",
    sessionId,
    agentId: "codex",
  };
}

function splitUsage(input: number, cached: number, output: number, cacheIsSubset: boolean | null): Split {
  return splitCounts(input, cached, output, cacheIsSubset !== false);
}

function splitCounts(input: number, cached: number, output: number, cacheIsSubset: boolean | null): Split {
  const subset = cacheIsSubset !== false && cached <= input;
  const fresh = subset ? Math.max(0, input - cached) : input;
  return { fresh, cacheRead: cached, output };
}

function inferCacheSubset(snapshot: Record<string, unknown>): boolean {
  const input = num(snapshot.input_tokens);
  const cached = cachedOf(snapshot);
  const output = num(snapshot.output_tokens);
  const total = num(snapshot.total_tokens);
  if (!total) return cached <= input;
  const asSubset = Math.abs(total - (input + output));
  const asAdditive = Math.abs(total - (input + cached + output));
  return asSubset <= asAdditive;
}

function cachedOf(usage: Record<string, unknown> | null): number {
  if (!usage) return 0;
  return num(usage.cached_input_tokens) || num(usage.cache_read_input_tokens);
}

function filesFromResponseItem(payload: Record<string, unknown> | null): string[] {
  if (!payload) return [];
  const name = typeof payload.name === "string" ? payload.name : "";
  const type = typeof payload.type === "string" ? payload.type : "";
  const blobs: string[] = [];
  if (typeof payload.input === "string") blobs.push(payload.input);
  if (typeof payload.arguments === "string") blobs.push(payload.arguments);
  if (name === "apply_patch" || type === "custom_tool_call" || type === "function_call" || /patch/i.test(name)) {
    return unique(blobs.flatMap(pathsFromPatch));
  }
  return [];
}

function filesFromExecItem(item: Record<string, unknown> | null): string[] {
  if (!item || item.type !== "file_change") return [];
  const changes = Array.isArray(item.changes) ? item.changes : [];
  const files: string[] = [];
  for (const change of changes) {
    const rec = asRecord(change);
    if (!rec) continue;
    if (typeof rec.path === "string") files.push(rec.path);
    else if (typeof rec.filename === "string") files.push(rec.filename);
  }
  if (typeof item.path === "string") files.push(item.path);
  return unique(files);
}

export function pathsFromPatch(text: string): string[] {
  const files: string[] = [];
  for (const match of text.matchAll(PATCH_FILE)) {
    if (match[1]) files.push(match[1].trim());
  }
  return files;
}

function unique(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

function timestampFromFilename(path: string): number | null {
  const match = /(\d{4}-\d{2}-\d{2})[T-](\d{2})-(\d{2})-(\d{2})/.exec(path);
  if (!match) return null;
  const iso = `${match[1]}T${match[2]}:${match[3]}:${match[4]}Z`;
  const ms = Date.parse(iso);
  return Number.isNaN(ms) ? null : ms;
}
