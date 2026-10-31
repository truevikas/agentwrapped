import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { collectAdapter } from "./adapters.ts";
import { discoverFiles } from "./discover.ts";

test("discover walks jsonl and skips everything else", () => {
  const root = mkdtempSync(join(tmpdir(), "aw-discover-"));
  mkdirSync(join(root, "projects", "app"), { recursive: true });
  mkdirSync(join(root, "sessions"), { recursive: true });
  mkdirSync(join(root, "node_modules", "pkg"), { recursive: true });
  writeFileSync(join(root, "projects", "app", "a.jsonl"), "{}\n");
  writeFileSync(join(root, "sessions", "b.jsonl"), "{}\n");
  writeFileSync(join(root, "notes.txt"), "nope");
  writeFileSync(join(root, "node_modules", "pkg", "skip.jsonl"), "{}\n");
  const found = discoverFiles([root]);
  const bases = found.files.map((file) => file.split(/[/\\]/).slice(-2).join("/")).sort();
  assert.deepEqual(bases, ["app/a.jsonl", "sessions/b.jsonl"]);
  assert.equal(found.files.some((file) => file.includes("node_modules")), false);
  const missing = discoverFiles([join(root, "nope")]);
  assert.equal(missing.files.length, 0);
  assert.equal(missing.missing.length, 1);
});

test("adapters warn when a home is missing and still return", () => {
  const root = mkdtempSync(join(tmpdir(), "aw-adapt-"));
  const missing = join(root, "missing-claude");
  const collected = collectAdapter(
    { id: "claude", label: "Claude Code", discover: () => [], parse: () => [] },
    { homeDir: root, cwd: root, extraRoots: [missing], env: {} },
  );
  assert.equal(collected.files.length, 0);
  assert.match(collected.warnings.join("\n"), /no logs/);
});
