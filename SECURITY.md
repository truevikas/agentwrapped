# Security

AgentWrapped reads coding-agent logs on the machine where you run it.
Those logs can contain prompts, file paths, and code. Treat the generated
card, HTML, and JSON as sensitive if you did not pass `--redact`.

## What this project does not do

- It does not upload transcripts.
- It does not call a model.
- It does not send telemetry. The only optional network request is `--check-update`, which looks up the package version and is off unless you pass the flag.
- It does not write back to Claude or Codex log directories.

## Reporting a vulnerability

Please do not open a public issue for a security problem.

Use [GitHub private vulnerability reporting](https://github.com/truevikas/agentwrapped/security/advisories/new)
or email the maintainer through the address on their GitHub profile.

Include the version, the command you ran, and what you expected. Do not attach raw session logs.
A redacted fixture that reproduces the bug is enough.
