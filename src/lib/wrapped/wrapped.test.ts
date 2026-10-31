import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { aggregate } from "./aggregate.ts";
import { parseClaudeJsonl } from "./parse-claude.ts";
import { parseCodexJsonl } from "./parse-codex.ts";
import { defaultPriceTable, parsePriceTable, resolveRates } from "./prices.ts";
import { redactText } from "./redact.ts";

const mini = (name: string) =>
  readFileSync(fileURLToPath(new URL(`./fixtures/mini/${name}`, import.meta.url)), "utf8");

test("claude parser dedupes message ids and ignores reads", () => {
  const events = parseClaudeJsonl(mini("claude.jsonl"), { path: "claude.jsonl" });
  assert.equal(events.length, 2);
  assert.equal(events[0]?.inputTokens, 160);
  assert.equal(events[0]?.freshInputTokens, 100);
  assert.equal(events[0]?.cacheReadTokens, 50);
  assert.equal(events[0]?.cacheCreateTokens, 10);
  assert.equal(events[0]?.outputTokens, 40);
  assert.deepEqual(events[0]?.filesTouched, ["/home/dev/app/src/lib/parse.ts"]);
  assert.equal(events[1]?.outputTokens, 5);
  assert.equal(events[0]?.kind, "turn");
});

test("codex parser diffs cumulative tokens and reads apply_patch", () => {
  const events = parseCodexJsonl(mini("codex.jsonl"), { path: "codex.jsonl" });
  const turns = events.filter((event) => event.kind === "turn");
  const edits = events.filter((event) => event.kind === "edit");
  assert.equal(turns.length, 2);
  assert.equal(turns[0]?.freshInputTokens, 600);
  assert.equal(turns[0]?.cacheReadTokens, 400);
  assert.equal(turns[0]?.outputTokens, 100);
  assert.equal(turns[0]?.model, "gpt-5.4");
  assert.equal(turns[1]?.freshInputTokens, 200);
  assert.equal(turns[1]?.cacheReadTokens, 100);
  assert.equal(turns[1]?.outputTokens, 80);
  assert.equal(turns[1]?.model, "gpt-5-mini");
  assert.deepEqual(edits[0]?.filesTouched, [
    "/home/dev/app/src/server/routes.ts",
    "/home/dev/app/src/new.ts",
  ]);
});

test("codex exec json counts each turn once", () => {
  const path = "rollout-2026-05-01T12-00-00-thread-mini.jsonl";
  const events = parseCodexJsonl(mini(path), { path });
  const turn = events.find((event) => event.kind === "turn");
  assert.ok(turn);
  assert.equal(turn.sessionId, "thread-mini");
  assert.equal(turn.freshInputTokens, 315);
  assert.equal(turn.cacheReadTokens, 24448);
  assert.equal(turn.outputTokens, 122);
  assert.equal(turn.ts, Date.parse("2026-05-01T12:00:00Z"));
  const edit = events.find((event) => event.kind === "edit");
  assert.deepEqual(edit?.filesTouched, ["src/app.ts"]);
});

test("aggregate filters a year, redacts home, and prices sonnet", () => {
  const events = parseClaudeJsonl(mini("claude.jsonl"), { path: "claude.jsonl" });
  const stats = aggregate(events, {
    year: 2026,
    timeZone: "UTC",
    redact: true,
    homeDir: "/home/dev",
  });
  assert.equal(stats.sessions, 1);
  assert.equal(stats.turns, 2);
  assert.equal(stats.inputTokens, 180);
  assert.equal(stats.outputTokens, 45);
  assert.equal(stats.topFiles[0]?.base, "parse.ts");
  assert.equal(stats.topFiles[0]?.label, "src/lib/parse.ts");
  assert.equal(stats.topFiles[0]?.path.includes("/home/dev"), false);
  assert.match(stats.topFiles[0]?.path ?? "", /^~\/app\//);
  assert.ok(Math.abs((stats.spendUsd ?? 0) - 0.0010875) < 1e-9);
  const outside = aggregate(events, { year: 2025, timeZone: "UTC" });
  assert.equal(outside.sessions, 0);
});

test("price rules prefer the longest match", () => {
  const table = defaultPriceTable();
  assert.equal(resolveRates("gpt-5.4-mini-2026", table).rates.inputPerMTok, 0.4);
  assert.equal(resolveRates("gpt-5.4", table).rates.inputPerMTok, 2.5);
  assert.equal(resolveRates("claude-sonnet-4-5", table).rates.outputPerMTok, 15);
  assert.equal(resolveRates("mystery-model", table).usedDefault, true);
  const custom = parsePriceTable("models:\n  - match: demo\n    inputPerMTok: 1\n    outputPerMTok: 2\ndefault:\n  inputPerMTok: 9\n  outputPerMTok: 9\n", "prices.yaml");
  assert.equal(resolveRates("demo-model", custom).rates.inputPerMTok, 1);
});

test("redact strips home prefixes and usernames", () => {
  assert.equal(redactText("/home/dev/app/src/a.ts", "/home/dev"), "~/app/src/a.ts");
  assert.equal(redactText("/Users/ada/code/app.ts"), "~/code/app.ts");
  assert.equal(redactText("C:\\Users\\ada\\proj\\a.ts"), "~\\proj\\a.ts");
});

test("demo fixtures: year, streak, peak hour, highlights", () => {
  const root = fileURLToPath(new URL("./fixtures/demo", import.meta.url));
  const events = [];
  for (const name of readdirSync(join(root, "claude"))) {
    const path = join(root, "claude", name);
    events.push(...parseClaudeJsonl(readFileSync(path, "utf8"), { path }));
  }
  for (const name of readdirSync(join(root, "codex"))) {
    const path = join(root, "codex", name);
    events.push(...parseCodexJsonl(readFileSync(path, "utf8"), { path }));
  }
  const stats = aggregate(events, { year: 2026, timeZone: "UTC", redact: true, homeDir: "/home/dev" });
  assert.equal(stats.sessions, 12);
  assert.equal(stats.busiestHour, 22);
  assert.equal(stats.busiestWeekday, 4);
  assert.equal(stats.streakDays, 4);
  assert.equal(stats.streakStart, "2026-03-02");
  assert.equal(stats.streakEnd, "2026-03-05");
  assert.equal(stats.longestSession?.sessionId, "claude-wed");
  assert.equal(stats.mostTokenSession?.sessionId, "claude-jun");
  assert.equal(stats.topFiles[0]?.base, "parse.ts");
  assert.equal(JSON.stringify(stats.topFiles).includes("/home/dev"), false);
  assert.equal(stats.agents.map((agent) => agent.id).sort().join(","), "claude,codex");
});
