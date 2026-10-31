const WEEKDAY_LONG = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export function weekdayName(index: number | null): string {
  if (index == null) return "—";
  return WEEKDAY_LONG[index] ?? "—";
}

export function formatHour(hour: number | null): string {
  if (hour == null) return "—";
  const suffix = hour >= 12 ? "PM" : "AM";
  const hr = hour % 12 === 0 ? 12 : hour % 12;
  return `${hr} ${suffix}`;
}

export function compactNumber(value: number): string {
  const sign = value < 0 ? "-" : "";
  const n = Math.abs(value);
  if (n < 1000) return `${sign}${Math.round(n)}`;
  const units = [
    { div: 1_000_000_000, suffix: "B" },
    { div: 1_000_000, suffix: "M" },
    { div: 1_000, suffix: "K" },
  ];
  for (const unit of units) {
    if (n >= unit.div) {
      const scaled = n / unit.div;
      const digits = scaled >= 100 ? 0 : scaled >= 10 ? 1 : 2;
      return `${sign}${trimZeros(scaled.toFixed(digits))}${unit.suffix}`;
    }
  }
  return `${sign}${Math.round(n)}`;
}

function trimZeros(value: string): string {
  return value.replace(/\.0+$/, "").replace(/(\.\d)0$/, "$1");
}

export function formatFull(value: number): string {
  return Math.round(value).toLocaleString("en-US");
}

export function formatUsd(value: number): string {
  if (!Number.isFinite(value)) return "$0";
  if (Math.abs(value) >= 100) return `$${value.toFixed(0)}`;
  return `$${value.toFixed(2)}`;
}

export function formatDuration(ms: number): string {
  const minutes = Math.max(0, Math.round(ms / 60_000));
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rem = minutes % 60;
  if (rem === 0) return `${hours}h`;
  return `${hours}h ${rem}m`;
}

export function agentLabel(id: string): string {
  if (id === "claude") return "Claude Code";
  if (id === "codex") return "Codex CLI";
  return id;
}
