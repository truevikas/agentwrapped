import type { LogSource, SessionEvent } from "./types.ts";

const EDIT_TOOLS = new Set(["Edit", "Write", "MultiEdit", "NotebookEdit", "str_replace_editor"]);

interface Usage {
  input_tokens?: number;
  output_tokens?: number;
  cache_read_input_tokens?: number;
  cache_creation_input_tokens?: number;
}

/** Parse a Claude Code session JSONL transcript into session events. */
export function parseClaudeJsonl(text: string, source: LogSource = { path: "session.jsonl" }): SessionEvent[] {
  const fallbackSession = source.sessionId ?? sessionIdFromPath(source.path);
  const best = new Map<string, { event: SessionEvent; score: number }>();
  const anon: SessionEvent[] = [];

  for (const record of jsonLines(text)) {
    if (record.type !== "assistant") continue;
    const message = asRecord(record.message);
    if (!message) continue;
    const usage = asRecord(message.usage) as Usage | null;
    if (!usage) continue;
    const ts = parseTs(record.timestamp) ?? parseTs(message.timestamp);
    if (ts == null) continue;

    const fresh = num(usage.input_tokens);
    const cacheRead = num(usage.cache_read_input_tokens);
    const cacheCreate = num(usage.cache_creation_input_tokens);
    const output = num(usage.output_tokens);
    const files = filesFromContent(message.content);
    const event: SessionEvent = {
      ts,
      model: typeof message.model === "string" ? message.model : undefined,
      inputTokens: fresh + cacheRead + cacheCreate,
      outputTokens: output,
      freshInputTokens: fresh,
      cacheReadTokens: cacheRead,
      cacheCreateTokens: cacheCreate,
      filesTouched: files.length ? files : undefined,
      kind: "turn",
      sessionId: typeof record.sessionId === "string" ? record.sessionId : fallbackSession,
      agentId: "claude",
    };
    const score = (event.inputTokens ?? 0) + (event.outputTokens ?? 0);
    const id = typeof message.id === "string" ? message.id : "";
    if (!id) {
      anon.push(event);
      continue;
    }
    const prev = best.get(id);
    if (!prev || score >= prev.score) best.set(id, { event, score });
  }

  return [...anon, ...[...best.values()].map((item) => item.event)].sort((a, b) => a.ts - b.ts || a.sessionId.localeCompare(b.sessionId));
}

function filesFromContent(content: unknown): string[] {
  if (!Array.isArray(content)) return [];
  const files: string[] = [];
  for (const block of content) {
    const rec = asRecord(block);
    if (!rec || rec.type !== "tool_use") continue;
    if (typeof rec.name !== "string" || !EDIT_TOOLS.has(rec.name)) continue;
    const input = asRecord(rec.input);
    if (!input) continue;
    for (const key of ["file_path", "path", "notebook_path", "target_notebook"]) {
      if (typeof input[key] === "string" && input[key]) files.push(input[key] as string);
    }
  }
  return [...new Set(files)];
}

export function jsonLines(text: string): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = [];
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const value = JSON.parse(trimmed) as unknown;
      const rec = asRecord(value);
      if (rec) out.push(rec);
    } catch {
      // Skip malformed lines. Logs are append-only and sometimes torn.
    }
  }
  return out;
}

export function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

export function num(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

export function parseTs(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value < 1e12 ? value * 1000 : value;
  if (typeof value !== "string" || !value) return null;
  const ms = Date.parse(value);
  return Number.isNaN(ms) ? null : ms;
}

export function sessionIdFromPath(path: string): string {
  const base = path.split(/[/\\]/).pop() ?? path;
  return base.replace(/\.jsonl$/i, "") || "session";
}
