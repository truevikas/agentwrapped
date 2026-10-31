import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parseClaudeJsonl } from "../lib/wrapped/parse-claude.ts";
import { parseCodexJsonl } from "../lib/wrapped/parse-codex.ts";
import type { AgentAdapter, DiscoverContext, SessionEvent } from "../lib/wrapped/types.ts";
import { discoverFiles, preferChildren, type DiscoverResult } from "./discover.ts";

export interface CollectedLogs {
  events: SessionEvent[];
  warnings: string[];
  files: string[];
}

export const claudeAdapter: AgentAdapter = {
  id: "claude",
  label: "Claude Code",
  discover(ctx) {
    return locateClaude(ctx).files;
  },
  parse(path) {
    return parseClaudeJsonl(readFileSync(path, "utf8"), { path });
  },
};

export const codexAdapter: AgentAdapter = {
  id: "codex",
  label: "Codex CLI",
  discover(ctx) {
    return locateCodex(ctx).files;
  },
  parse(path) {
    return parseCodexJsonl(readFileSync(path, "utf8"), { path });
  },
};

export const adapters: AgentAdapter[] = [claudeAdapter, codexAdapter];

export function adapterById(id: string): AgentAdapter | undefined {
  return adapters.find((adapter) => adapter.id === id);
}

export function collectAdapter(adapter: AgentAdapter, ctx: DiscoverContext): CollectedLogs {
  const located = adapter.id === "codex" ? locateCodex(ctx) : locateClaude(ctx);
  const warnings = located.missing.map((path) => `${adapter.label}: no logs at ${path}`);
  const events: SessionEvent[] = [];
  for (const file of located.files) {
    try {
      events.push(...adapter.parse(file));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      warnings.push(`${adapter.label}: skipped ${file} (${message})`);
    }
  }
  if (!located.files.length && !warnings.length) {
    warnings.push(`${adapter.label}: no JSONL transcripts found`);
  }
  return { events, warnings, files: located.files };
}

function locateClaude(ctx: DiscoverContext): DiscoverResult {
  const configured = ctx.extraRoots.length
    ? ctx.extraRoots
    : [ctx.env.CLAUDE_CONFIG_DIR || ctx.env.AGENTWRAPPED_CLAUDE_DIR || join(ctx.homeDir, ".claude")];
  const found = discoverFiles(configured.flatMap((root) => preferChildren(root, ["projects", "sessions"])));
  if (ctx.extraRoots.length) return found;
  const project = join(ctx.cwd, ".claude");
  if (!existsSync(project)) return found;
  const extra = discoverFiles(preferChildren(project, ["projects", "sessions"]));
  return { files: [...found.files, ...extra.files].sort(), missing: found.missing };
}

function locateCodex(ctx: DiscoverContext): DiscoverResult {
  const raw = ctx.extraRoots.length
    ? ctx.extraRoots
    : (ctx.env.CODEX_HOME || ctx.env.AGENTWRAPPED_CODEX_DIR || join(ctx.homeDir, ".codex"))
        .split(",")
        .map((part) => part.trim())
        .filter(Boolean);
  return discoverFiles(raw.flatMap((root) => preferChildren(root, ["sessions", "archived_sessions"])));
}
