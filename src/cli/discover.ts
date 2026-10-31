import { existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

export interface DiscoverResult {
  files: string[];
  missing: string[];
}

/** Recursively collect `.jsonl` files. Missing roots are reported, not thrown. */
export function discoverFiles(roots: string[]): DiscoverResult {
  const files: string[] = [];
  const missing: string[] = [];
  for (const root of roots) {
    if (!root) continue;
    if (!existsSync(root)) {
      missing.push(root);
      continue;
    }
    walk(root, 0, files);
  }
  return { files: [...new Set(files)].sort(), missing };
}

function walk(dir: string, depth: number, files: string[]): void {
  if (depth > 8) return;
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (entry.name === "node_modules" || entry.name === ".git") continue;
    const path = join(dir, entry.name);
    if (entry.isSymbolicLink()) continue;
    if (entry.isDirectory()) {
      walk(path, depth + 1, files);
      continue;
    }
    if (entry.isFile() && entry.name.endsWith(".jsonl")) files.push(path);
  }
}

/** Prefer known child folders when they exist; otherwise scan the root itself. */
export function preferChildren(root: string, children: string[]): string[] {
  if (!existsSync(root)) return [root];
  try {
    if (!statSync(root).isDirectory()) return [root];
  } catch {
    return [root];
  }
  const found = children.map((child) => join(root, child)).filter((path) => existsSync(path));
  return found.length ? found : [root];
}
