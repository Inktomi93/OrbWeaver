// domain/discovery/themes/utils — small pure helpers for the theme subsystem (zero I/O).

import { trimEdgesWhile } from "@orb/kit/strings";

const MAX_NAME_LEN = 60;
const LEADING_BULLET = /^[-*\d.)\s]+/;
const SURROUNDING_QUOTES = "\"'`";
const INNER_WHITESPACE = /\s+/g;

/** Sanitize an LLM-produced theme name into a clean short label: trim, strip a leading markdown bullet/
 *  numbering + surrounding quotes/backticks, collapse inner whitespace, cap length. Returns `null` for an
 *  empty result (the caller leaves the cluster unnamed rather than store junk). */
export function parseThemeName(raw: string): string | null {
  const unquoted = trimEdgesWhile(raw.trim().replace(LEADING_BULLET, ""), SURROUNDING_QUOTES);
  const cleaned = unquoted.replace(INNER_WHITESPACE, " ").trim().slice(0, MAX_NAME_LEN).trim();
  return cleaned.length === 0 ? null : cleaned;
}
