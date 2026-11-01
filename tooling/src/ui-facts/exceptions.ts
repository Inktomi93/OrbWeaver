// The checked-in exceptions: a site the report leaves out, each with the ruling that permits it. An entry without a citation is refused.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { UsageError } from "../floor/cli/run-tool.ts";
import type { Site } from "./sites.ts";

const EXCEPTIONS_FILE = "tooling/src/ui-facts/exceptions.json";

/** A ruling cites a decision id (`D336`) or a law or ADR document path. */
const CITATION = /\bD\d+\b|docs\/(?:law|adr)\/[\w.-]+\.md/u;

export interface ExceptionEntry {
  readonly kind: string;
  /** A repository path, or `path:line`. */
  readonly at: string;
  readonly ruling: string;
}

export function parseExceptions(text: string): readonly ExceptionEntry[] {
  const parsed = JSON.parse(text) as { readonly entries?: readonly Partial<ExceptionEntry>[] };
  const entries = parsed.entries ?? [];
  return entries.map((entry, index) => {
    if (entry.kind === undefined || entry.at === undefined || entry.ruling === undefined || !CITATION.test(entry.ruling)) {
      throw new UsageError(`${EXCEPTIONS_FILE} entry ${index}: kind, at and a ruling that cites a D-number or a docs/law or docs/adr path are required`);
    }
    return { kind: entry.kind, at: entry.at, ruling: entry.ruling };
  });
}

export function loadExceptions(root: string): readonly ExceptionEntry[] {
  return parseExceptions(readFileSync(join(root, EXCEPTIONS_FILE), "utf8"));
}

export function isExcepted(site: Site, entries: readonly ExceptionEntry[]): boolean {
  return entries.some((entry) => entry.kind === site.kind && (entry.at === site.path || entry.at === `${site.path}:${site.line}`));
}
