import { aggregate, type AggregateOptions } from "./aggregate.ts";
import { parseClaudeJsonl } from "./parse-claude.ts";
import { parseCodexJsonl } from "./parse-codex.ts";
import type { SessionEvent, WrappedStats } from "./types.ts";
import claudeJan from "./fixtures/demo/claude/session-jan.jsonl?raw";
import claudeJun from "./fixtures/demo/claude/session-jun.jsonl?raw";
import claudeMon from "./fixtures/demo/claude/session-mar-mon.jsonl?raw";
import claudeThu from "./fixtures/demo/claude/session-mar-thu.jsonl?raw";
import claudeTue from "./fixtures/demo/claude/session-mar-tue.jsonl?raw";
import claudeWed from "./fixtures/demo/claude/session-mar-wed.jsonl?raw";
import claudeOct from "./fixtures/demo/claude/session-oct.jsonl?raw";
import codexOld from "./fixtures/demo/codex/rollout-2025-12-18T22-00-00-codex-old.jsonl?raw";
import codexTue from "./fixtures/demo/codex/rollout-2026-03-03T22-30-00-codex-tue.jsonl?raw";
import codexWed from "./fixtures/demo/codex/rollout-2026-03-04T22-15-00-codex-wed.jsonl?raw";
import codexThu from "./fixtures/demo/codex/rollout-2026-03-05T22-55-00-codex-thu.jsonl?raw";
import codexAug from "./fixtures/demo/codex/rollout-2026-08-21T16-40-00-codex-aug.jsonl?raw";
import codexOct from "./fixtures/demo/codex/rollout-2026-10-03T22-10-00-codex-oct.jsonl?raw";

const DEMO_HOME = "/home/dev";

const CLAUDE: Array<[string, string]> = [
  ["session-jan.jsonl", claudeJan],
  ["session-mar-mon.jsonl", claudeMon],
  ["session-mar-tue.jsonl", claudeTue],
  ["session-mar-wed.jsonl", claudeWed],
  ["session-mar-thu.jsonl", claudeThu],
  ["session-jun.jsonl", claudeJun],
  ["session-oct.jsonl", claudeOct],
];

const CODEX: Array<[string, string]> = [
  ["rollout-2025.jsonl", codexOld],
  ["rollout-2026-03-03.jsonl", codexTue],
  ["rollout-2026-03-04.jsonl", codexWed],
  ["rollout-2026-03-05.jsonl", codexThu],
  ["rollout-2026-08-21.jsonl", codexAug],
  ["rollout-2026-10-03.jsonl", codexOct],
];

export function demoEvents(agents: { claude: boolean; codex: boolean } = { claude: true, codex: true }): SessionEvent[] {
  const events: SessionEvent[] = [];
  if (agents.claude) {
    for (const [path, text] of CLAUDE) events.push(...parseClaudeJsonl(text, { path }));
  }
  if (agents.codex) {
    for (const [path, text] of CODEX) events.push(...parseCodexJsonl(text, { path }));
  }
  return events;
}

export function demoStats(
  agents: { claude: boolean; codex: boolean },
  redact: boolean,
  options: AggregateOptions = {},
): WrappedStats {
  return aggregate(demoEvents(agents), {
    year: 2026,
    timeZone: "UTC",
    includeCost: true,
    redact,
    homeDir: DEMO_HOME,
    ...options,
  });
}

export const DEMO_TIME_ZONE = "UTC";
export { DEMO_HOME };
