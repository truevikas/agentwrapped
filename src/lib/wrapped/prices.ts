import { parse as parseYaml } from "yaml";
import defaults from "./default-prices.json" with { type: "json" };
import type { SessionEvent } from "./types";

export interface TokenRates {
  inputPerMTok: number;
  outputPerMTok: number;
  cacheReadPerMTok?: number;
  cacheWritePerMTok?: number;
}

export interface ModelPrice extends TokenRates {
  match: string;
}

export interface PriceTable {
  models: ModelPrice[];
  default: TokenRates;
}

export function defaultPriceTable(): PriceTable {
  return structuredClone(defaults) as PriceTable;
}

export function parsePriceTable(text: string, filename = "prices.json"): PriceTable {
  const trimmed = text.trim();
  if (!trimmed) throw new Error(`Price table ${filename} is empty`);
  const data = /\.ya?ml$/i.test(filename) || trimmed.startsWith("models:")
    ? parseYaml(trimmed)
    : JSON.parse(trimmed);
  if (!data || typeof data !== "object") {
    throw new Error(`Price table ${filename} is not an object`);
  }
  const models = Array.isArray(data.models) ? data.models : [];
  const fallback = data.default;
  if (!fallback || typeof fallback.inputPerMTok !== "number" || typeof fallback.outputPerMTok !== "number") {
    throw new Error(`Price table ${filename} needs default.inputPerMTok and default.outputPerMTok`);
  }
  return {
    models: models.map((entry: ModelPrice) => {
      if (!entry || typeof entry.match !== "string") {
        throw new Error(`Price table ${filename} has a model rule without match`);
      }
      return entry;
    }),
    default: fallback,
  };
}

export function resolveRates(model: string | undefined, table: PriceTable): { rates: TokenRates; usedDefault: boolean } {
  const name = (model ?? "").toLowerCase();
  let best: ModelPrice | undefined;
  for (const rule of table.models) {
    if (!name.includes(rule.match.toLowerCase())) continue;
    if (!best || rule.match.length > best.match.length) best = rule;
  }
  if (!best) return { rates: table.default, usedDefault: true };
  return { rates: best, usedDefault: false };
}

/** USD estimate for one event. Cache rates fall back to the input rate when omitted. */
export function estimateEventCost(event: SessionEvent, table: PriceTable): { usd: number; usedDefault: boolean } {
  const { rates, usedDefault } = resolveRates(event.model, table);
  const fresh = event.freshInputTokens ?? 0;
  const cacheRead = event.cacheReadTokens ?? 0;
  const cacheWrite = event.cacheCreateTokens ?? 0;
  const output = event.outputTokens ?? 0;
  const readRate = rates.cacheReadPerMTok ?? rates.inputPerMTok;
  const writeRate = rates.cacheWritePerMTok ?? rates.inputPerMTok;
  const usd =
    (fresh * rates.inputPerMTok + cacheRead * readRate + cacheWrite * writeRate + output * rates.outputPerMTok) /
    1_000_000;
  return { usd, usedDefault };
}
