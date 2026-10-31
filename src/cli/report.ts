import { agentLabel, compactNumber, formatDuration, formatFull, formatHour, formatUsd, weekdayName } from "../lib/wrapped/format.ts";
import type { WrappedStats } from "../lib/wrapped/types.ts";

export function renderTerminal(stats: WrappedStats, yearLabel: string): string {
  const lines = [
    `AgentWrapped ${yearLabel}`,
    `${formatFull(stats.sessions)} sessions  ${formatFull(stats.turns)} turns  ${formatFull(stats.activeDays)} active days`,
    stats.streakDays
      ? `streak ${stats.streakDays} day${stats.streakDays === 1 ? "" : "s"} (${stats.streakStart} to ${stats.streakEnd})`
      : "streak 0 days",
    "",
    `tokens in   ${formatFull(stats.inputTokens)}`,
    `tokens out  ${formatFull(stats.outputTokens)}`,
    stats.spendUsd == null ? "estimated   skipped" : `estimated   ${formatUsd(stats.spendUsd)}`,
    "",
    `busiest     ${weekdayName(stats.busiestWeekday)}, ${formatHour(stats.busiestHour)}`,
    `top model   ${stats.topModels[0]?.model ?? "none"}`,
    "",
    stats.longestSession
      ? `longest     ${stats.longestSession.sessionId}  ${formatDuration(stats.longestSession.durationMs)}  ${agentLabel(stats.longestSession.agentId)}`
      : "longest     none",
    stats.mostTokenSession
      ? `most tokens ${stats.mostTokenSession.sessionId}  ${compactNumber(stats.mostTokenSession.tokens)}  ${agentLabel(stats.mostTokenSession.agentId)}`
      : "most tokens none",
    "",
    "top files",
  ];
  if (!stats.topFiles.length) lines.push("  none");
  for (const file of stats.topFiles) {
    lines.push(`  ${String(file.count).padStart(2, " ")}  ${file.label}`);
  }
  lines.push("", "npx agentwrapped", "logs stay on this machine");
  return lines.join("\n");
}

export function renderHtml(stats: WrappedStats, yearLabel: string): string {
  const files = stats.topFiles
    .map(
      (file) =>
        `<li><span>${escapeHtml(String(file.count))}</span><code>${escapeHtml(file.label)}</code></li>`,
    )
    .join("");
  const models = stats.topModels
    .slice(0, 5)
    .map(
      (model) =>
        `<li><strong>${escapeHtml(model.model)}</strong><em>${escapeHtml(compactNumber(model.tokens))}</em></li>`,
    )
    .join("");
  const spend = stats.spendUsd == null ? "not estimated" : formatUsd(stats.spendUsd);
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>AgentWrapped ${escapeHtml(yearLabel)}</title>
<style>
  :root { color-scheme: dark; }
  body { margin: 0; background: #10140f; color: #f3f0e6; font: 16px/1.5 "IBM Plex Mono", ui-monospace, monospace; }
  main { max-width: 42rem; margin: 0 auto; padding: 3rem 1.25rem 4rem; }
  h1 { font-family: Georgia, "Iowan Old Style", serif; font-weight: 560; font-size: 3.25rem; line-height: 0.95; letter-spacing: -0.03em; margin: 0.4rem 0 0.8rem; }
  .kicker { letter-spacing: 0.14em; text-transform: uppercase; font-size: 0.75rem; color: #c2c6b4; }
  .signal { color: #dff25a; }
  .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem; margin: 1.5rem 0; }
  .card { background: #1a2118; padding: 1rem; }
  .card b { display: block; font-family: Georgia, serif; font-size: 1.8rem; font-weight: 560; }
  ul { list-style: none; padding: 0; margin: 0; }
  li { display: flex; justify-content: space-between; gap: 1rem; padding: 0.45rem 0; border-top: 1px solid #2c3328; }
  code { font: inherit; }
  footer { margin-top: 2.5rem; color: #c2c6b4; }
  p.note { color: #c2c6b4; }
</style>
</head>
<body>
<main>
  <p class="kicker">AgentWrapped</p>
  <h1>${escapeHtml(yearLabel)}</h1>
  <p class="note">Read-only summary of local coding-agent logs. Nothing in this file was uploaded.</p>
  <div class="grid">
    <div class="card"><span class="kicker">Sessions</span><b>${formatFull(stats.sessions)}</b></div>
    <div class="card"><span class="kicker">Turns</span><b>${formatFull(stats.turns)}</b></div>
    <div class="card"><span class="kicker">Tokens in</span><b class="signal">${escapeHtml(compactNumber(stats.inputTokens))}</b></div>
    <div class="card"><span class="kicker">Tokens out</span><b>${escapeHtml(compactNumber(stats.outputTokens))}</b></div>
    <div class="card"><span class="kicker">Estimated</span><b>${escapeHtml(spend)}</b></div>
    <div class="card"><span class="kicker">Streak</span><b>${stats.streakDays}d</b></div>
  </div>
  <p class="kicker">Busiest</p>
  <p>${escapeHtml(weekdayName(stats.busiestWeekday))} · ${escapeHtml(formatHour(stats.busiestHour))}</p>
  <p class="kicker">Models</p>
  <ul>${models || "<li>none</li>"}</ul>
  <p class="kicker">Files</p>
  <ul>${files || "<li>none</li>"}</ul>
  <footer>npx agentwrapped</footer>
</main>
</body>
</html>
`;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&" + "amp;")
    .replaceAll("<", "&" + "lt;")
    .replaceAll(">", "&" + "gt;")
    .replaceAll('"', "&" + "quot;");
}
