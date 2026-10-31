import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { aggregate } from "../lib/wrapped/aggregate.ts";
import { parseBound } from "../lib/wrapped/time.ts";
import { parsePriceTable, type PriceTable } from "../lib/wrapped/prices.ts";
import type { DiscoverContext, SessionEvent } from "../lib/wrapped/types.ts";
import { adapterById, adapters, collectAdapter } from "./adapters.ts";
import { discoverFiles } from "./discover.ts";
import { renderTerminal, renderHtml } from "./report.ts";
import { renderCards } from "./render.ts";

export interface Io {
  stdout: (text: string) => void;
  stderr: (text: string) => void;
  env: NodeJS.ProcessEnv;
  cwd: string;
  homeDir: string;
}

interface Flags {
  year?: number;
  from?: string;
  to?: string;
  agents: string[];
  out?: string;
  html?: string;
  square?: string;
  json: boolean;
  noCost: boolean;
  redact: boolean;
  prices?: string;
  claudeDirs: string[];
  codexDirs: string[];
  demo: boolean;
  checkUpdate: boolean;
  help: boolean;
}

const HELP = `agentwrapped — Spotify Wrapped for local coding-agent logs

Usage
  agentwrapped [options]

Options
  --year <yyyy>          Calendar year (default: this year, local time)
  --from <iso>           Start date or timestamp (overrides --year)
  --to <iso>             End date or timestamp, inclusive
  --agents <list>        Comma list: claude,codex (default: both)
  --out <file.png>       Portrait card, 1080x1920
  --square <file.png>    Square card, 1080x1080 (default: next to --out)
  --html <file.html>     Self-contained HTML summary
  --json                 Machine-readable stats on stdout
  --no-cost              Skip dollar estimates
  --redact               Strip home directories and usernames from labels
  --prices <file>        JSON or YAML price table (see prices.example.yaml)
  --claude-dir <path>    Claude config root or a folder of JSONL (repeatable)
  --codex-dir <path>     Codex home or a folder of JSONL (repeatable)
  --demo                 Read the bundled anonymous 2026 fixtures
  --check-update         Optional npm version lookup (off by default)
  --help                 Show this help

Logs are read-only. Nothing is uploaded. No telemetry unless you pass
--check-update.

Claude Code    $CLAUDE_CONFIG_DIR or ~/.claude/projects/**/*.jsonl
               also ~/.claude/sessions and ./ .claude when present
Codex CLI      $CODEX_HOME or ~/.codex/sessions/YYYY/MM/DD/rollout-*.jsonl
               archived sessions under ~/.codex/archived_sessions
`;

export async function run(argv: string[], io: Io = defaultIo()): Promise<number> {
  let flags: Flags;
  try {
    flags = parseArgs(argv);
  } catch (error) {
    io.stderr(`${error instanceof Error ? error.message : String(error)}\n\n${HELP}`);
    return 1;
  }
  if (flags.help) {
    io.stdout(HELP);
    return 0;
  }

  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  let fromMs: number | undefined;
  let toMs: number | undefined;
  let year = flags.year;
  try {
    if (flags.from || flags.to) {
      year = undefined;
      if (flags.from) fromMs = parseBound(flags.from, timeZone, "start");
      if (flags.to) toMs = parseBound(flags.to, timeZone, "end");
    } else if (year == null) {
      year = Number(
        new Intl.DateTimeFormat("en-US", { timeZone, year: "numeric" }).format(new Date()),
      );
    }
  } catch (error) {
    io.stderr(`${error instanceof Error ? error.message : String(error)}\n`);
    return 1;
  }

  let prices: PriceTable | undefined;
  if (flags.prices) {
    try {
      const text = readFileSync(flags.prices, "utf8");
      prices = parsePriceTable(text, flags.prices);
    } catch (error) {
      io.stderr(`Could not read price table: ${error instanceof Error ? error.message : String(error)}\n`);
      return 1;
    }
  }

  const warnings: string[] = [];
  let events: SessionEvent[] = [];
  if (flags.demo) {
    events = loadDemo(flags.agents, warnings);
  } else {
    const ctxBase: DiscoverContext = {
      homeDir: io.homeDir,
      cwd: io.cwd,
      extraRoots: [],
      env: io.env,
    };
    for (const id of flags.agents) {
      const adapter = adapterById(id);
      if (!adapter) {
        io.stderr(`Unknown agent "${id}". Expected claude or codex.\n`);
        return 1;
      }
      const extraRoots = id === "claude" ? flags.claudeDirs : flags.codexDirs;
      const collected = collectAdapter(adapter, { ...ctxBase, extraRoots });
      warnings.push(...collected.warnings);
      events.push(...collected.events);
    }
  }

  const stats = aggregate(events, {
    year,
    fromMs,
    toMs,
    timeZone,
    includeCost: !flags.noCost,
    prices,
    redact: flags.redact,
    homeDir: io.homeDir,
  });

  const yearLabel = yearLabelFor(flags, year, timeZone);
  if (stats.sessions === 0 && flags.demo) {
    warnings.push("Demo fixtures are from 2026. Pass --year 2026 if this year filtered them out.");
  }
  for (const warning of warnings) io.stderr(`warning: ${warning}\n`);

  if (flags.json) io.stdout(`${JSON.stringify({ ...stats, yearLabel }, null, 2)}\n`);
  else io.stdout(`${renderTerminal(stats, yearLabel)}\n`);

  if (flags.html) {
    mkdirSync(dirname(resolve(flags.html)), { recursive: true });
    writeFileSync(flags.html, renderHtml(stats, yearLabel));
  }
  if (flags.out || flags.square) {
    const portraitPath = flags.out;
    const squarePath = flags.square ?? (flags.out ? siblingSquare(flags.out) : undefined);
    const cards = await renderCards(stats, yearLabel);
    if (portraitPath) {
      mkdirSync(dirname(resolve(portraitPath)), { recursive: true });
      writeFileSync(portraitPath, cards.portrait);
    }
    if (squarePath) {
      mkdirSync(dirname(resolve(squarePath)), { recursive: true });
      writeFileSync(squarePath, cards.square);
    }
  }

  if (flags.checkUpdate) await checkUpdate(io);
  return 0;
}

function loadDemo(agentIds: string[], warnings: string[]): SessionEvent[] {
  const root = fileURLToPath(new URL("../lib/wrapped/fixtures/demo", import.meta.url));
  const events: SessionEvent[] = [];
  for (const id of agentIds) {
    const adapter = adapterById(id);
    if (!adapter) {
      warnings.push(`Unknown agent "${id}"`);
      continue;
    }
    const dir = join(root, id);
    const files = discoverFiles([dir]).files;
    if (!files.length) warnings.push(`${adapter.label}: demo fixtures missing`);
    for (const file of files) events.push(...adapter.parse(file));
  }
  return events;
}

function siblingSquare(portraitPath: string): string {
  const slash = portraitPath.replaceAll("\\", "/");
  const dot = slash.lastIndexOf(".");
  if (dot === -1 || slash.slice(dot).includes("/")) return `${portraitPath}-square.png`;
  return `${portraitPath.slice(0, dot)}-square${portraitPath.slice(dot)}`;
}

function yearLabelFor(flags: Flags, year: number | undefined, timeZone: string): string {
  if (flags.from || flags.to) return `${flags.from ?? "start"} – ${flags.to ?? "now"}`;
  if (year != null) return String(year);
  return new Intl.DateTimeFormat("en-US", { timeZone, year: "numeric" }).format(new Date());
}

async function checkUpdate(io: Io): Promise<void> {
  try {
    const pkg = JSON.parse(readFileSync(fileURLToPath(new URL("../../package.json", import.meta.url)), "utf8")) as {
      version?: string;
    };
    const response = await fetch("https://registry.npmjs.org/agentwrapped/latest", {
      signal: AbortSignal.timeout(4000),
    });
    if (!response.ok) {
      io.stderr(`warning: update check failed (${response.status})\n`);
      return;
    }
    const body = (await response.json()) as { version?: string };
    if (body.version && body.version !== pkg.version) {
      io.stderr(`update available: ${pkg.version ?? "local"} → ${body.version}\n`);
    } else io.stderr("agentwrapped is current\n");
  } catch (error) {
    io.stderr(`warning: update check failed (${error instanceof Error ? error.message : "network"})\n`);
  }
}

function parseArgs(argv: string[]): Flags {
  const flags: Flags = {
    agents: [],
    json: false,
    noCost: false,
    redact: false,
    claudeDirs: [],
    codexDirs: [],
    demo: false,
    checkUpdate: false,
    help: false,
  };
  const want = new Set([
    "--year",
    "--from",
    "--to",
    "--agents",
    "--out",
    "--html",
    "--square",
    "--prices",
    "--claude-dir",
    "--codex-dir",
  ]);
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === "--help" || token === "-h") {
      flags.help = true;
      continue;
    }
    if (token === "--json") {
      flags.json = true;
      continue;
    }
    if (token === "--no-cost") {
      flags.noCost = true;
      continue;
    }
    if (token === "--redact") {
      flags.redact = true;
      continue;
    }
    if (token === "--demo") {
      flags.demo = true;
      continue;
    }
    if (token === "--check-update") {
      flags.checkUpdate = true;
      continue;
    }
    if (!want.has(token)) throw new Error(`Unknown option ${token}`);
    const value = argv[++i];
    if (!value || value.startsWith("--")) throw new Error(`${token} needs a value`);
    if (token === "--year") {
      if (!/^\d{4}$/.test(value)) throw new Error(`Invalid year ${value}`);
      flags.year = Number(value);
    } else if (token === "--from") flags.from = value;
    else if (token === "--to") flags.to = value;
    else if (token === "--agents") flags.agents = value.split(",").map((part) => part.trim()).filter(Boolean);
    else if (token === "--out") flags.out = value;
    else if (token === "--html") flags.html = value;
    else if (token === "--square") flags.square = value;
    else if (token === "--prices") flags.prices = value;
    else if (token === "--claude-dir") flags.claudeDirs.push(value);
    else if (token === "--codex-dir") flags.codexDirs.push(value);
  }
  if (!flags.agents.length) flags.agents = adapters.map((adapter) => adapter.id);
  return flags;
}

function defaultIo(): Io {
  return {
    stdout: (text) => process.stdout.write(text),
    stderr: (text) => process.stderr.write(text),
    env: process.env,
    cwd: process.cwd(),
    homeDir: homedir(),
  };
}

const entry = process.argv[1] ? resolve(process.argv[1]) : "";
if (entry && fileURLToPath(import.meta.url) === entry) {
  run(process.argv.slice(2)).then(
    (code) => process.exit(code),
    (error) => {
      process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
      process.exit(1);
    },
  );
}
