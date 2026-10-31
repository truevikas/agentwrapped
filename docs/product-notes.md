# Product notes

Original brief for AgentWrapped. The README is the user-facing guide. This file is the spec the CLI and the card were built against: local logs only, Claude Code and Codex CLI, no upload, no telemetry by default.

Build AgentWrapped: a CLI + shareable “year in review” card for coding agents.

## Product
- Name: agentwrapped
- One-liner: Spotify Wrapped for AI coding agents — tokens, cost, hours, top files — from local session logs.
- Install: `npx agentwrapped` (also `npm i -g agentwrapped`)
- Zero API keys. Read-only. Never upload logs. Never collect telemetry by default.
- Output: terminal summary + a shareable PNG card (+ optional HTML page).

## Agents to support (MVP)
1. Claude Code — parse local JSONL / session logs under common paths (~/.claude, project .claude)
2. OpenAI Codex CLI — parse its local session/transcript format
Document exact paths you discover; make paths configurable via flags and env.

## CLI
`agentwrapped [options]`
- `--year 2026` (default: current calendar year)
- `--from` / `--to` ISO dates
- `--agents claude,codex` (default: all detected)
- `--out ./wrapped.png` and `--html ./wrapped.html`
- `--json` machine-readable stats
- `--no-cost` skip dollar estimates
- `--redact` strip absolute home paths / usernames from labels in the card
- Exit 0 even if one agent’s logs are missing; warn clearly.

## Metrics (card + CLI)
- Total sessions, total turns, total tokens in/out
- Estimated spend (configurable model price table in YAML/JSON; ship sensible defaults)
- Busiest hour-of-day and day-of-week (local timezone)
- Top 10 edited file paths (basename + short relative path; redact home)
- Top models used
- Longest session / most-token session (one highlight each)
- Streak: consecutive days with ≥1 session

## Card design
- One portrait PNG (~1080×1920) and one square (~1080×1080)
- Dark, clean “Wrapped” look; big numbers; 5–7 slides/sections composited into one image OR multi-page PNG set — pick one approach and keep it sharp
- Branding: “AgentWrapped” + “npx agentwrapped” footer (no other product logos)
- Use satori / resvg or equivalent for deterministic PNG from React/HTML
- Sample card in README as a GIF or PNG

## Architecture
- TypeScript, Node 20+
- Monorepo or single package is fine
- Modules: `discover` → `parse` → `aggregate` → `estimateCost` → `render`
- Parsers behind a common `AgentAdapter` interface: `{ id, discover(), parse(path): SessionEvent[] }`
- `SessionEvent`: `{ ts, model?, inputTokens?, outputTokens?, filesTouched?: string[], kind }`
- Pure functions + unit tests with fixture JSONL (commit anonymized fixtures)
- No network calls except optional `--check-update` (off by default)

## Repo hygiene
- MIT license
- README: 30-second demo GIF, `npx` usage, privacy section (“logs never leave your machine”), supported agents, price-table override
- CONTRIBUTING: how to add an adapter
- GitHub Action: typecheck + unit tests on PR
- `package.json` bin entry `agentwrapped`

## Out of scope (do not build yet)
- Cloud sync, accounts, dashboards
- Cursor / IDE plugin UI
- Auto-posting to social
- Reading git remotes or git config for identity

## Acceptance criteria
1. With fixture logs, `npx agentwrapped --year 2026 --out /tmp/w.png` produces a valid PNG
2. Unit tests cover parsers + aggregation
3. `--redact` removes home directory prefixes from card text
4. README alone is enough to try it in under 60 seconds
5. No PII in fixtures, docs, defaults, or sample output

Start by scaffolding the package, Adapter interface, Claude + Codex parsers with fixtures, aggregator, then the PNG card. Ship a working MVP end-to-end before polish.