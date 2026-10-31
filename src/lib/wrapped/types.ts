/** One normalized record from any coding-agent log. */
export interface SessionEvent {
  /** Unix epoch milliseconds. */
  ts: number;
  model?: string;
  /** Prompt-side total: fresh input + cache read + cache write. */
  inputTokens?: number;
  outputTokens?: number;
  freshInputTokens?: number;
  cacheReadTokens?: number;
  cacheCreateTokens?: number;
  filesTouched?: string[];
  /** `turn` counts toward turns/tokens. `edit` only contributes files. */
  kind: "turn" | "edit";
  sessionId: string;
  agentId: string;
}

export interface LogSource {
  path: string;
  sessionId?: string;
}

/**
 * Adapter contract. `discover` finds log files; `parse` reads one file.
 * Pure parsers live next to this type; the CLI adapters add the filesystem.
 */
export interface AgentAdapter {
  id: string;
  label: string;
  discover(ctx: DiscoverContext): string[];
  parse(path: string): SessionEvent[];
}

export interface DiscoverContext {
  homeDir: string;
  cwd: string;
  /** Explicit roots from flags. When set, they replace the default home root. */
  extraRoots: string[];
  env: NodeJS.ProcessEnv;
}

export interface SessionHighlight {
  sessionId: string;
  agentId: string;
  durationMs: number;
  tokens: number;
  startedAt: number;
}

export interface FileStat {
  path: string;
  label: string;
  base: string;
  count: number;
}

export interface ModelStat {
  model: string;
  turns: number;
  tokens: number;
}

export interface AgentStat {
  id: string;
  sessions: number;
  turns: number;
  tokens: number;
}

export interface WrappedStats {
  timeZone: string;
  sessions: number;
  turns: number;
  inputTokens: number;
  outputTokens: number;
  freshInputTokens: number;
  cacheReadTokens: number;
  cacheCreateTokens: number;
  spendUsd: number | null;
  pricedWithDefault: boolean;
  busiestHour: number | null;
  busiestWeekday: number | null;
  /** Turn counts for local hours 0 through 23. */
  hourCounts: number[];
  topFiles: FileStat[];
  topModels: ModelStat[];
  longestSession: SessionHighlight | null;
  mostTokenSession: SessionHighlight | null;
  streakDays: number;
  streakStart: string | null;
  streakEnd: string | null;
  agents: AgentStat[];
  activeDays: number;
}
