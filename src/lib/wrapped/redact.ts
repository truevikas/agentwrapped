/** Strip home-directory prefixes and /Users|home/<name> segments from a label. */
export function redactText(input: string, homeDir?: string): string {
  let text = input;
  if (homeDir) {
    const home = homeDir.replace(/[\\/]+$/, "");
    if (home) {
      text = text.split(home).join("~");
      text = text.split(home.replaceAll("/", "\\")).join("~");
    }
  }
  text = text.replace(/\/(?:Users|home)\/[^/\\]+/g, "~");
  text = text.replace(/[A-Za-z]:\\Users\\[^\\]+/g, "~");
  return text;
}

export function fileDisplay(
  rawPath: string,
  opts: { redact?: boolean; homeDir?: string } = {},
): { path: string; label: string; base: string } {
  const cleaned = opts.redact ? redactText(rawPath, opts.homeDir) : rawPath;
  const normalized = cleaned.replace(/\\/g, "/");
  const parts = normalized.split("/").filter((part) => part.length > 0);
  const base = parts[parts.length - 1] ?? normalized;
  const label = parts.slice(-3).join("/") || base;
  return { path: normalized, label, base };
}
