import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { createElement as h, type CSSProperties, type ReactNode } from "react";
import satori from "satori";
import { initWasm, Resvg } from "@resvg/resvg-wasm";
import { agentLabel, compactNumber, formatDuration, formatHour, formatUsd, weekdayName } from "../lib/wrapped/format.ts";
import type { WrappedStats } from "../lib/wrapped/types.ts";

function packageFile(specifier: string): string {
  return fileURLToPath(import.meta.resolve(specifier));
}
const PAPER = "#f3f0e6";
const SIGNAL = "#dff25a";
const MUTE = "#c2c6b4";
const LINE = "#2c3328";

let wasmReady: Promise<void> | null = null;
let fontsReady: Promise<FontSet> | null = null;

interface FontSet {
  fraunces: Buffer;
  frauncesItalic: Buffer;
  plex: Buffer;
  plexMedium: Buffer;
}

const INK = "#10140f";

function loadFonts(): Promise<FontSet> {
  if (!fontsReady) {
    fontsReady = Promise.all([
      readFile(packageFile("@fontsource/fraunces/files/fraunces-latin-600-normal.woff")),
      readFile(packageFile("@fontsource/fraunces/files/fraunces-latin-600-italic.woff")),
      readFile(packageFile("@fontsource/ibm-plex-mono/files/ibm-plex-mono-latin-400-normal.woff")),
      readFile(packageFile("@fontsource/ibm-plex-mono/files/ibm-plex-mono-latin-500-normal.woff")),
    ]).then(([fraunces, frauncesItalic, plex, plexMedium]) => ({ fraunces, frauncesItalic, plex, plexMedium }));
  }
  return fontsReady;
}

function ensureWasm(): Promise<void> {
  if (!wasmReady) {
    const wasmPath = packageFile("@resvg/resvg-wasm/index_bg.wasm");
    wasmReady = readFile(wasmPath).then((bytes) => initWasm(bytes));
  }
  return wasmReady;
}

export interface CardRender {
  portrait: Buffer;
  square: Buffer;
  portraitSvg: string;
  squareSvg: string;
}

export async function renderCards(stats: WrappedStats, yearLabel: string): Promise<CardRender> {
  const [fonts] = await Promise.all([loadFonts(), ensureWasm()]);
  const fontConfig = [
    { name: "Fraunces", data: fonts.fraunces, weight: 600 as const, style: "normal" as const },
    { name: "Fraunces", data: fonts.frauncesItalic, weight: 600 as const, style: "italic" as const },
    { name: "IBM Plex Mono", data: fonts.plex, weight: 400 as const, style: "normal" as const },
    { name: "IBM Plex Mono", data: fonts.plexMedium, weight: 500 as const, style: "normal" as const },
  ];
  const portraitSvg = await satori(portraitTree(stats, yearLabel), { width: 1080, height: 1920, fonts: fontConfig });
  const squareSvg = await satori(squareTree(stats, yearLabel), { width: 1080, height: 1080, fonts: fontConfig });
  return {
    portraitSvg,
    squareSvg,
    portrait: raster(portraitSvg),
    square: raster(squareSvg),
  };
}

function raster(svg: string): Buffer {
  const image = new Resvg(svg, { fitTo: { mode: "width", value: 1080 } }).render();
  try {
    return Buffer.from(image.asPng());
  } finally {
    image.free();
  }
}

function portraitTree(stats: WrappedStats, yearLabel: string): ReactNode {
  const total = stats.inputTokens + stats.outputTokens;
  return column(
    { width: "100%", height: "100%", backgroundColor: INK, color: PAPER, padding: 72, flexDirection: "column" },
    header(yearLabel),
    rule(),
    kicker("TOKENS", { marginTop: 56 }),
    hero(total ? compactNumber(total) : "0", 168),
    text("in and out, cache included", { color: MUTE, fontSize: 28, marginTop: 8, fontFamily: "IBM Plex Mono" }),
    row({ marginTop: 56, justifyContent: "space-between" }, [
      metric("SESSIONS", String(stats.sessions)),
      metric("TURNS", String(stats.turns)),
      metric("STREAK", stats.streakDays ? `${stats.streakDays}d` : "0"),
    ]),
    row({ marginTop: 36, justifyContent: "space-between" }, [
      metric("ESTIMATED", stats.spendUsd == null ? "off" : formatUsd(stats.spendUsd)),
      metric("PEAK", `${weekdayName(stats.busiestWeekday).slice(0, 3)} ${formatHour(stats.busiestHour)}`),
    ]),
    kicker("TOP MODEL", { marginTop: 64 }),
    text(stats.topModels[0]?.model ?? "No model recorded", {
      fontFamily: "Fraunces",
      fontSize: 54,
      fontStyle: "italic",
      marginTop: 8,
    }),
    kicker("FILES TOUCHED", { marginTop: 56 }),
    column(
      { flexDirection: "column", marginTop: 16 },
      ...(stats.topFiles.slice(0, 6).length
        ? stats.topFiles.slice(0, 6).map((file) => fileRow(file.base, file.label, file.count))
        : [text("No edits in range", { color: MUTE, fontSize: 28, fontFamily: "IBM Plex Mono" })]),
    ),
    column({ flexGrow: 1, flexDirection: "column" }),
    highlight(stats),
    footer(),
  );
}

function squareTree(stats: WrappedStats, yearLabel: string): ReactNode {
  const total = stats.inputTokens + stats.outputTokens;
  return column(
    { width: "100%", height: "100%", backgroundColor: INK, color: PAPER, padding: 64, flexDirection: "column" },
    header(yearLabel),
    rule(),
    kicker("TOKENS", { marginTop: 36 }),
    hero(total ? compactNumber(total) : "0", 120),
    row({ marginTop: 28, justifyContent: "space-between" }, [
      metric("SESSIONS", String(stats.sessions)),
      metric("TURNS", String(stats.turns)),
      metric("STREAK", stats.streakDays ? `${stats.streakDays}d` : "0"),
      metric("SPEND", stats.spendUsd == null ? "off" : formatUsd(stats.spendUsd)),
    ]),
    kicker("PEAK / MODEL", { marginTop: 36 }),
    text(
      `${weekdayName(stats.busiestWeekday)} ${formatHour(stats.busiestHour)}  ·  ${stats.topModels[0]?.model ?? "none"}`,
      { fontFamily: "IBM Plex Mono", fontSize: 28, marginTop: 10 },
    ),
    column({ flexGrow: 1, flexDirection: "column" }),
    ...(stats.topFiles.slice(0, 3).map((file) => fileRow(file.base, file.label, file.count))),
    footer(),
  );
}

function header(yearLabel: string): ReactNode {
  return row({ justifyContent: "space-between", alignItems: "center" }, [
    text("AGENTWRAPPED", { fontFamily: "IBM Plex Mono", fontSize: 26, fontWeight: 500, letterSpacing: 3 }),
    text(yearLabel, { fontFamily: "Fraunces", fontSize: 36, fontStyle: "italic", color: SIGNAL }),
  ]);
}

function rule(): ReactNode {
  return h("div", { style: { width: 128, height: 8, backgroundColor: SIGNAL, marginTop: 28 } });
}

function kicker(value: string, extra: CSSProperties = {}): ReactNode {
  return text(value, {
    fontFamily: "IBM Plex Mono",
    fontSize: 22,
    letterSpacing: 3,
    color: MUTE,
    ...extra,
  });
}

function hero(value: string, size: number): ReactNode {
  return text(value, {
    fontFamily: "Fraunces",
    fontStyle: "italic",
    fontSize: size,
    color: SIGNAL,
    marginTop: 8,
    lineHeight: 0.9,
  });
}

function metric(label: string, value: string): ReactNode {
  return column({ flexDirection: "column", width: "24%" }, [
    text(label, { fontFamily: "IBM Plex Mono", fontSize: 18, letterSpacing: 2, color: MUTE }),
    text(value, { fontFamily: "Fraunces", fontSize: 42, marginTop: 6 }),
  ]);
}

function fileRow(base: string, label: string, count: number): ReactNode {
  return row(
    { justifyContent: "space-between", alignItems: "baseline", borderTop: `1px solid ${LINE}`, paddingTop: 10, paddingBottom: 10 },
    [
      column({ flexDirection: "column" }, [
        text(base, { fontFamily: "IBM Plex Mono", fontSize: 28, fontWeight: 500 }),
        text(label, { fontFamily: "IBM Plex Mono", fontSize: 18, color: MUTE, marginTop: 2 }),
      ]),
      text(String(count), { fontFamily: "Fraunces", fontSize: 32, color: SIGNAL }),
    ],
  );
}

function highlight(stats: WrappedStats): ReactNode {
  const longest = stats.longestSession
    ? `${formatDuration(stats.longestSession.durationMs)} longest · ${agentLabel(stats.longestSession.agentId)}`
    : "No session length";
  const hungry = stats.mostTokenSession
    ? `${compactNumber(stats.mostTokenSession.tokens)} hungriest · ${agentLabel(stats.mostTokenSession.agentId)}`
    : "";
  return text([longest, hungry].filter(Boolean).join("   "), {
    fontFamily: "IBM Plex Mono",
    fontSize: 22,
    color: MUTE,
    marginBottom: 28,
  });
}

function footer(): ReactNode {
  return row(
    { justifyContent: "space-between", borderTop: `1px solid ${LINE}`, paddingTop: 22 },
    [
      text("npx agentwrapped", { fontFamily: "IBM Plex Mono", fontSize: 24, fontWeight: 500 }),
      text("logs stay local", { fontFamily: "IBM Plex Mono", fontSize: 22, color: MUTE }),
    ],
  );
}

function column(style: CSSProperties, ...children: ReactNode[]): ReactNode {
  return h("div", { style: { display: "flex", ...style } }, ...children);
}

function row(style: CSSProperties, children: ReactNode[]): ReactNode {
  return h("div", { style: { display: "flex", flexDirection: "row", width: "100%", ...style } }, ...children);
}

function text(value: string, style: CSSProperties): ReactNode {
  return h("div", { style: { display: "flex", ...style } }, value);
}
