// Closed path-to-format dispatch for resource-backed ordinary-waiver carriers.
import type { OrdinaryWaiverResourceFormat } from "../contract/ordinary-waiver-source.ts";

const FORMAT_BY_EXTENSION: ReadonlyMap<string, OrdinaryWaiverResourceFormat> = new Map([
  [".css", "css"],
  [".md", "markdown"],
  [".markdown", "markdown"],
  [".jsonc", "jsonc"],
  [".json", "json"],
  [".sql", "sql"],
]);

export function ordinaryWaiverResourceFormat(path: string): OrdinaryWaiverResourceFormat | undefined {
  return FORMAT_BY_EXTENSION.get(path.slice(path.lastIndexOf(".")));
}
