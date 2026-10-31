# Contributing

AgentWrapped is a pipeline: discover logs, parse them into `SessionEvent`s, aggregate a year, estimate cost, render a card.

## Add an agent adapter

1. Add a pure parser next to [`src/lib/wrapped/parse-claude.ts`](src/lib/wrapped/parse-claude.ts). It should take JSONL text plus a `LogSource` and return `SessionEvent[]`. Do not read the filesystem in the parser — tests and the browser demo call it with strings.

   Each event needs:

   - `ts` — epoch milliseconds
   - `kind` — `"turn"` for a model reply, `"edit"` for a file touch with no new tokens
   - `sessionId` and `agentId`
   - optional `model`, token fields, and `filesTouched`

   Claude-style usage is fresh input plus separate cache read/write. Codex rollout files report cumulative `token_count` totals; diff them, and do not double-count a repeated snapshot. `codex exec --json` `turn.completed` usage is already per turn.

2. Register an `AgentAdapter` in [`src/cli/adapters.ts`](src/cli/adapters.ts):

   ```ts
   export interface AgentAdapter {
     id: string;
     label: string;
     discover(ctx: DiscoverContext): string[];
     parse(path: string): SessionEvent[];
   }
   ```

   `discover` should accept a config root, an env override, and a repeatable CLI directory. Missing directories are warnings, not crashes. Exit 0 when a log folder is absent.

3. Commit anonymized JSONL fixtures under `src/lib/wrapped/fixtures/`. No real usernames, emails, home directories, or hostnames. `/home/dev/app` is the stand-in.

4. Add unit tests in [`src/lib/wrapped/wrapped.test.ts`](src/lib/wrapped/wrapped.test.ts) for the parser and for whatever the aggregator should do with those events (year filter, tokens, files).

5. Document the on-disk path in [README.md](README.md).

## Price rows

Add a `match` entry to `src/lib/wrapped/default-prices.json`. Rates are USD per million tokens. Longer `match` strings win, so `gpt-5.4-mini` must stay longer than `gpt-5.4`.

## Checks

```bash
npm test
npm run typecheck
```

The card renderer is [`src/cli/render.ts`](src/cli/render.ts) (satori + resvg). Keep type in the portrait and square frames; do not add other product logos.
