import { useEffect, useMemo, useState, type ReactNode } from "react";
import { demoStats } from "@/lib/wrapped/demo";
import {
  agentLabel,
  compactNumber,
  formatDuration,
  formatFull,
  formatHour,
  formatUsd,
  weekdayName,
} from "@/lib/wrapped/format";
import type { WrappedStats } from "@/lib/wrapped/types";

type Tone = "ink" | "paper";

export function Experience() {
  const [slide, setSlide] = useState(0);
  const [mode, setMode] = useState<"story" | "card">("story");
  const [redact, setRedact] = useState(false);
  const [privacy, setPrivacy] = useState(false);
  const [agents, setAgents] = useState({ claude: true, codex: true });

  const stats = useMemo(() => demoStats(agents, redact), [agents, redact]);
  const slides = useMemo(() => storySlides(stats, () => setSlide(1)), [stats]);
  const index = Math.min(slide, slides.length - 1);
  const current = slides[index];

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA")) return;
      if (event.key === "ArrowRight" || event.key === " ") {
        event.preventDefault();
        setSlide((n) => Math.min(slides.length - 1, n + 1));
      } else if (event.key === "ArrowLeft") {
        setSlide((n) => Math.max(0, n - 1));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [slides.length]);

  const tone = mode === "card" ? "ink" : current.tone;

  return (
    <main className={`flex h-dvh flex-col overflow-hidden ${tone === "paper" ? "bg-paper text-ink" : "bg-ink text-paper"}`}>
      <header className="flex flex-col gap-3 px-5 pt-4 pb-2 sm:px-8">
        <div className="flex items-center justify-between gap-3">
          <p className="kicker">AgentWrapped</p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              aria-pressed={mode === "story"}
              onClick={() => setMode("story")}
              className={chip(mode === "story", tone)}
            >
              Story
            </button>
            <button
              type="button"
              aria-pressed={mode === "card"}
              onClick={() => setMode("card")}
              className={chip(mode === "card", tone)}
            >
              Card
            </button>
            <button type="button" onClick={() => setPrivacy(true)} className={chip(false, tone)}>
              Privacy
            </button>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <AgentChip
            label="Claude Code"
            pressed={agents.claude}
            tone={tone}
            onClick={() => setAgents((prev) => ({ ...prev, claude: !prev.claude }))}
          />
          <AgentChip
            label="Codex"
            pressed={agents.codex}
            tone={tone}
            onClick={() => setAgents((prev) => ({ ...prev, codex: !prev.codex }))}
          />
          <button
            type="button"
            aria-pressed={redact}
            onClick={() => setRedact((value) => !value)}
            className={chip(redact, tone)}
          >
            {redact ? "Home redacted" : "Redact home"}
          </button>
        </div>
      </header>

      {mode === "story" ? (
        <section
          className="min-h-0 flex-1 overflow-y-auto px-5 sm:px-8"
          onPointerDown={(event) => {
            const start = event.clientX;
            const target = event.currentTarget;
            const end = (up: PointerEvent) => {
              const delta = up.clientX - start;
              if (delta < -48) setSlide((n) => Math.min(slides.length - 1, n + 1));
              if (delta > 48) setSlide((n) => Math.max(0, n - 1));
              target.removeEventListener("pointerup", end);
            };
            target.addEventListener("pointerup", end);
          }}
        >
          <div key={`${current.id}-${redact}-${agents.claude}-${agents.codex}`} className="rise mx-auto flex min-h-full w-full max-w-3xl flex-col justify-center py-6">
            <p className={`kicker ${tone === "paper" ? "text-ink-soft" : "text-mute"}`}>{current.kicker}</p>
            <div className="mt-4">{current.body}</div>
          </div>
        </section>
      ) : (
        <section className="min-h-0 flex-1 overflow-y-auto px-5 py-4 sm:px-8">
          <div className="mx-auto grid w-full max-w-5xl gap-6 md:grid-cols-[minmax(0,280px)_minmax(0,1fr)] md:items-start">
            <Poster stats={stats} shape="portrait" />
            <Poster stats={stats} shape="square" />
          </div>
        </section>
      )}

      <footer className={`flex items-center justify-between gap-3 px-5 py-3 sm:px-8 ${tone === "paper" ? "border-t border-paper-2" : "border-t border-line"}`}>
        {mode === "story" ? (
          <>
            <button type="button" className={nav(tone)} onClick={() => setSlide((n) => Math.max(0, n - 1))} disabled={index === 0}>
              Back
            </button>
            <div className="flex items-center gap-1" aria-label="Story progress">
              {slides.map((item, itemIndex) => (
                <button
                  key={item.id}
                  type="button"
                  aria-label={`Slide ${itemIndex + 1}`}
                  aria-current={itemIndex === index}
                  onClick={() => setSlide(itemIndex)}
                  className="flex h-11 w-4 items-center justify-center"
                >
                  <span
                    className={`h-1.5 rounded-full ${itemIndex === index ? "w-6 bg-signal" : tone === "paper" ? "w-1.5 bg-ink-soft" : "w-1.5 bg-line"}`}
                  />
                </button>
              ))}
            </div>
            <button
              type="button"
              className={nav(tone)}
              onClick={() => setSlide((n) => Math.min(slides.length - 1, n + 1))}
              disabled={index === slides.length - 1}
            >
              Next
            </button>
          </>
        ) : (
          <p className={`kicker w-full text-center ${tone === "paper" ? "text-ink-soft" : "text-mute"}`}>
            Portrait 1080×1920 · square 1080×1080 · npx agentwrapped
          </p>
        )}
      </footer>

      {privacy ? <Privacy tone={tone} onClose={() => setPrivacy(false)} /> : null}
    </main>
  );
}

function storySlides(
  stats: WrappedStats,
  onStart: () => void,
): Array<{ id: string; tone: Tone; kicker: string; body: ReactNode }> {
  if (stats.sessions === 0) {
    return [
      {
        id: "empty",
        tone: "ink",
        kicker: "2026 · demo fixtures",
        body: (
          <>
            <h1 className="display text-mega text-balance">Nothing in range</h1>
            <p className="mt-6 max-w-md text-base text-mute text-pretty">
              Turn an agent back on. This preview only reads bundled, fictional session logs.
            </p>
          </>
        ),
      },
    ];
  }

  const total = stats.inputTokens + stats.outputTokens;
  const maxHour = Math.max(...stats.hourCounts, 1);
  const agentLine = stats.agents.map((agent) => `${agentLabel(agent.id)} ${agent.sessions}`).join(" · ");

  return [
    {
      id: "cover",
      tone: "ink",
      kicker: "2026 · local logs only",
      body: (
        <>
          <h1 className="display text-mega text-balance">
            Agent
            <span className="block italic text-signal">Wrapped</span>
          </h1>
          <p className="mt-6 max-w-md text-base text-mute text-pretty">
            Tokens, cost, hours, and the files your coding agents actually touched. Built from fictional fixture logs — nothing here is yours, and nothing leaves the machine.
          </p>
          <button type="button" onClick={onStart} className="mt-8 min-h-11 bg-signal px-5 text-sm text-ink">
            Play 2026
          </button>
        </>
      ),
    },
    {
      id: "sessions",
      tone: "paper",
      kicker: "Sessions",
      body: (
        <>
          <p className="display text-mega tabular-nums">{formatFull(stats.sessions)}</p>
          <h2 className="display mt-3 text-3xl text-balance">times an agent sat with the repo</h2>
          <p className="mt-6 text-ink-soft text-pretty">
            {formatFull(stats.turns)} turns · {agentLine}
          </p>
        </>
      ),
    },
    {
      id: "tokens",
      tone: "ink",
      kicker: "Tokens in",
      body: (
        <>
          <p className="display text-mega text-signal tabular-nums">{compactNumber(stats.inputTokens)}</p>
          <h2 className="display mt-3 text-3xl">prompt side, cache included</h2>
          <p className="mt-6 text-mute">
            {compactNumber(stats.outputTokens)} out · {compactNumber(total)} combined
          </p>
          <div className="mt-8 flex h-2 w-full max-w-md overflow-hidden bg-line" aria-hidden>
            <div className="bg-signal" style={{ width: `${total ? (stats.inputTokens / total) * 100 : 0}%` }} />
          </div>
        </>
      ),
    },
    {
      id: "spend",
      tone: "paper",
      kicker: "Estimated spend",
      body: (
        <>
          <p className="display text-mega tabular-nums">{stats.spendUsd == null ? "—" : formatUsd(stats.spendUsd)}</p>
          <h2 className="display mt-3 text-3xl text-balance">not a bill</h2>
          <p className="mt-6 max-w-md text-ink-soft text-pretty">
            Priced from the shipped table. Swap it for your own rates. No API keys, and this preview never asks a model anything.
          </p>
        </>
      ),
    },
    {
      id: "when",
      tone: "ink",
      kicker: "When the keyboard got handed over",
      body: (
        <>
          <h2 className="display text-5xl text-balance sm:text-6xl">
            <span className="italic text-signal">{weekdayName(stats.busiestWeekday)}</span>
            <span className="mt-2 block">{formatHour(stats.busiestHour)} UTC</span>
          </h2>
          <div className="mt-10 flex h-24 items-end gap-1" aria-hidden>
            {stats.hourCounts.map((count, hour) => (
              <div key={hour} className="flex h-full flex-1 items-end">
                <div
                  className={`w-full ${hour === stats.busiestHour ? "bg-signal" : "bg-line"}`}
                  style={{ height: `${Math.max(6, (count / maxHour) * 100)}%` }}
                />
              </div>
            ))}
          </div>
          <p className="mt-3 flex justify-between text-xs text-mute">
            <span>12 AM</span>
            <span>noon</span>
            <span>11 PM</span>
          </p>
        </>
      ),
    },
    {
      id: "models",
      tone: "paper",
      kicker: "Who did the typing",
      body: (
        <ul className="flex flex-col gap-4">
          {stats.topModels.map((model) => {
            const width = stats.topModels[0]?.tokens ? (model.tokens / stats.topModels[0].tokens) * 100 : 0;
            return (
              <li key={model.model}>
                <div className="mb-2 flex items-baseline justify-between gap-4">
                  <h2 className="display text-xl sm:text-2xl">{model.model}</h2>
                  <span className="text-sm text-ink-soft tabular-nums">{compactNumber(model.tokens)}</span>
                </div>
                <div className="h-2 bg-paper-2">
                  <div className="h-2 bg-ink" style={{ width: `${width}%` }} />
                </div>
              </li>
            );
          })}
        </ul>
      ),
    },
    {
      id: "files",
      tone: "ink",
      kicker: "What got edited",
      body: (
        <ol className="flex flex-col">
          {stats.topFiles.map((file, fileIndex) => (
            <li key={file.path} className="flex items-baseline justify-between gap-4 border-t border-line py-2.5">
              <div className="min-w-0">
                <p className="truncate text-base">
                  <span className="mr-3 text-mute">{String(fileIndex + 1).padStart(2, "0")}</span>
                  {file.base}
                </p>
                <p className="truncate pl-8 text-sm text-mute">{file.path}</p>
              </div>
              <span className="text-signal tabular-nums">{file.count}</span>
            </li>
          ))}
        </ol>
      ),
    },
    {
      id: "records",
      tone: "paper",
      kicker: "Streak",
      body: (
        <>
          <p className="display text-mega tabular-nums">{stats.streakDays}</p>
          <h2 className="display mt-2 text-3xl">days in a row</h2>
          <p className="mt-3 text-ink-soft">
            {stats.streakStart} to {stats.streakEnd}
          </p>
          <dl className="mt-8 grid gap-4 sm:grid-cols-2">
            <div className="bg-paper-2 p-4">
              <dt className="kicker text-ink-soft">Longest session</dt>
              <dd className="display mt-2 text-2xl">
                {stats.longestSession ? formatDuration(stats.longestSession.durationMs) : "—"}
              </dd>
              <dd className="mt-1 text-sm text-ink-soft">
                {stats.longestSession ? agentLabel(stats.longestSession.agentId) : ""}
              </dd>
            </div>
            <div className="bg-paper-2 p-4">
              <dt className="kicker text-ink-soft">Most tokens</dt>
              <dd className="display mt-2 text-2xl">
                {stats.mostTokenSession ? compactNumber(stats.mostTokenSession.tokens) : "—"}
              </dd>
              <dd className="mt-1 text-sm text-ink-soft">
                {stats.mostTokenSession ? agentLabel(stats.mostTokenSession.agentId) : ""}
              </dd>
            </div>
          </dl>
        </>
      ),
    },
    {
      id: "close",
      tone: "ink",
      kicker: "Take it with you",
      body: (
        <>
          <h2 className="display text-4xl text-balance sm:text-5xl">
            Same engine.
            <span className="block italic text-signal">Your logs stay put.</span>
          </h2>
          <p className="mt-6 max-w-md bg-ink-2 px-4 py-3 text-sm">npx agentwrapped --year 2026 --out wrapped.png</p>
          <p className="mt-6 max-w-md text-mute text-pretty">
            Read-only. No keys. No telemetry unless you ask for an update check. The card on the next tab is the portrait the CLI writes.
          </p>
        </>
      ),
    },
  ];
}

function Poster({ stats, shape }: { stats: WrappedStats; shape: "portrait" | "square" }) {
  const total = stats.inputTokens + stats.outputTokens;
  const files = stats.topFiles.slice(0, shape === "portrait" ? 5 : 3);
  return (
    <article
      className={`poster-${shape} flex w-full flex-col bg-ink p-5 text-paper ${shape === "square" ? "md:max-w-xl" : ""}`}
    >
      <div className="flex items-center justify-between">
        <p className="kicker text-mute">AgentWrapped</p>
        <p className="display text-lg italic text-signal">2026</p>
      </div>
      <div className="mt-4 h-1.5 w-10 bg-signal" />
      <p className="kicker mt-6 text-mute">Tokens</p>
      <p className="display text-5xl italic text-signal">{total ? compactNumber(total) : "0"}</p>
      <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
        <div>
          <dt className="kicker text-mute">Sessions</dt>
          <dd className="display text-2xl">{stats.sessions}</dd>
        </div>
        <div>
          <dt className="kicker text-mute">Turns</dt>
          <dd className="display text-2xl">{stats.turns}</dd>
        </div>
        <div>
          <dt className="kicker text-mute">Streak</dt>
          <dd className="display text-2xl">{stats.streakDays}d</dd>
        </div>
        <div>
          <dt className="kicker text-mute">Spend</dt>
          <dd className="display text-2xl">{stats.spendUsd == null ? "—" : formatUsd(stats.spendUsd)}</dd>
        </div>
      </dl>
      <p className="mt-4 text-sm text-mute">
        {weekdayName(stats.busiestWeekday)} {formatHour(stats.busiestHour)} · {stats.topModels[0]?.model ?? "no model"}
      </p>
      <ul className="mt-4 flex flex-1 flex-col justify-end">
        {files.map((file) => (
          <li key={file.path} className="flex items-baseline justify-between gap-3 border-t border-line py-1.5 text-sm">
            <span className="truncate">{file.base}</span>
            <span className="text-signal">{file.count}</span>
          </li>
        ))}
      </ul>
      <p className="mt-3 border-t border-line pt-3 text-xs text-mute">npx agentwrapped</p>
    </article>
  );
}

function Privacy({ tone, onClose }: { tone: Tone; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-20 flex items-end justify-center bg-ink/80 p-4 sm:items-center" role="presentation">
      <div
        role="dialog"
        aria-labelledby="privacy-title"
        className={`max-h-[85dvh] w-full max-w-lg overflow-y-auto p-6 ${tone === "paper" ? "bg-paper text-ink" : "bg-ink-2 text-paper"}`}
      >
        <h2 id="privacy-title" className="display text-3xl">
          Logs never leave the machine
        </h2>
        <div className={`mt-4 space-y-3 text-sm text-pretty ${tone === "paper" ? "text-ink-soft" : "text-mute"}`}>
          <p>AgentWrapped is read-only. It does not upload transcripts, call a model, or send telemetry unless you pass --check-update.</p>
          <p>This preview plays a fixed 2026 fixture set. The paths are /home/dev — a stand-in, not a person. Redact strips that prefix.</p>
          <p>Claude Code stores one JSONL per session under ~/.claude/projects, or $CLAUDE_CONFIG_DIR. Project-local .claude JSONL is included when it exists.</p>
          <p>Codex CLI: ~/.codex/sessions/YYYY/MM/DD/rollout-*.jsonl and ~/.codex/archived_sessions. Override with $CODEX_HOME, a comma-separated list.</p>
        </div>
        <button type="button" onClick={onClose} className="mt-6 min-h-11 bg-signal px-5 text-sm text-ink">
          Close
        </button>
      </div>
    </div>
  );
}

function AgentChip({
  label,
  pressed,
  tone,
  onClick,
}: {
  label: string;
  pressed: boolean;
  tone: Tone;
  onClick: () => void;
}) {
  return (
    <button type="button" aria-pressed={pressed} onClick={onClick} className={chip(pressed, tone)}>
      {label}
    </button>
  );
}

function chip(active: boolean, tone: Tone): string {
  const base = "min-h-11 px-3 text-xs tracking-wide";
  if (active) return `${base} bg-signal text-ink`;
  if (tone === "paper") return `${base} bg-paper-2 text-ink`;
  return `${base} bg-ink-2 text-paper`;
}

function nav(tone: Tone): string {
  const base = "min-h-11 min-w-16 px-3 text-sm disabled:opacity-40";
  return tone === "paper" ? `${base} bg-ink text-paper` : `${base} bg-paper text-ink`;
}
