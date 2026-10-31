# Changelog

All notable changes to AgentWrapped are documented here.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project uses [Semantic Versioning](https://semver.org/).

## [0.1.0] - 2026-10-31

First public release. Spotify Wrapped for local AI coding-agent logs.

### Added

- Claude Code parser for `~/.claude/projects`, `~/.claude/sessions`, and `./.claude` JSONL logs.
- Codex CLI parser for `~/.codex/sessions`, archived sessions, and `codex exec --json` transcripts.
- Year and custom date-range filters, in the machine's local timezone.
- Stats for sessions, turns, tokens in and out, estimated spend, busiest hour and weekday, streak, top models, top files, longest session, and highest-token session.
- Portrait card (1080×1920) and square card (1080×1080).
- Self-contained HTML summary and `--json` output.
- `--redact` for home directories and usernames on cards, HTML, and JSON labels.
- Custom price tables in JSON or YAML. `--no-cost` skips dollar estimates.
- `--demo` mode that uses the anonymous fixtures in this repo. No home directory is read.
- Interactive web story of the same demo year: story slides, share card, agent toggles, and redaction.
- Read-only by design. No upload, no model calls, no telemetry unless `--check-update` is passed.

[0.1.0]: https://github.com/truevikas/agentwrapped/releases/tag/v0.1.0
