import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../../", import.meta.url));

test("cli renders a redacted png and html from demo fixtures", () => {
  const dir = mkdtempSync(join(tmpdir(), "aw-cli-"));
  const out = join(dir, "w.png");
  const square = join(dir, "sq.png");
  const html = join(dir, "w.html");
  const result = spawnSync(
    process.execPath,
    [
      "cli/agentwrapped.mjs",
      "--demo",
      "--year",
      "2026",
      "--out",
      out,
      "--square",
      square,
      "--html",
      html,
      "--json",
      "--redact",
    ],
    { cwd: root, encoding: "utf8" },
  );
  assert.equal(result.status, 0, result.stderr);
  const stats = JSON.parse(result.stdout) as { sessions: number; topFiles: Array<{ path: string }> };
  assert.equal(stats.sessions, 12);
  assert.equal(JSON.stringify(stats).includes("/home/dev"), false);
  const png = readFileSync(out);
  assert.equal(png.subarray(0, 8).toString("hex"), "89504e470d0a1a0a");
  assert.equal(png.readUInt32BE(16), 1080);
  assert.equal(png.readUInt32BE(20), 1920);
  const squarePng = readFileSync(square);
  assert.equal(squarePng.readUInt32BE(16), 1080);
  assert.equal(squarePng.readUInt32BE(20), 1080);
  const page = readFileSync(html, "utf8");
  assert.equal(page.includes("/home/dev"), false);
  assert.match(page, /npx agentwrapped/);
});

test("missing logs still exit 0 and write a card", () => {
  const dir = mkdtempSync(join(tmpdir(), "aw-empty-"));
  const out = join(dir, "empty.png");
  const result = spawnSync(
    process.execPath,
    [
      "cli/agentwrapped.mjs",
      "--year",
      "2026",
      "--claude-dir",
      join(dir, "no-claude"),
      "--codex-dir",
      join(dir, "no-codex"),
      "--out",
      out,
      "--square",
      join(dir, "empty-square.png"),
    ],
    { cwd: root, encoding: "utf8" },
  );
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stderr, /no logs/);
  const png = readFileSync(out);
  assert.equal(png.subarray(0, 8).toString("hex"), "89504e470d0a1a0a");
  assert.match(result.stdout, /0 sessions/);
});
