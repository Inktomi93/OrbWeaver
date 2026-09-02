// The three flag-class Sets ops/parse.ts's scanner validates argv against (required-value, optional
// inline selector, page-targetable). Split out of ops/flags.ts alongside the handler table when that
// file crossed the tooling line cap (docs/architecture/core/Core-Tooling-Law.md §4.3) — these Sets are read-only
// classification data, distinct from the dispatch table they describe.
import { APPEARANCE_VALUE_FLAGS } from "../../_shared/appearance-flags.ts";
import { refuseDirectInvocation } from "../../_shared/entrypoint.ts";
import { PANEL_PRESET_VALUE_FLAGS } from "../../_shared/panel-flags.ts";
import { THEME_VALUE_FLAGS } from "../../_shared/theme.ts";

refuseDirectInvocation(import.meta.url, "pnpm snap <route>");

export const REQUIRED_VALUE_FLAGS = new Set([
  "--scenario",
  "--wait",
  "--sse",
  "--base",
  "--debug-token",
  "--click",
  "--jsclick",
  "--press",
  "--hover",
  "--ls",
  "--fill",
  "--key",
  "--wait-for",
  "--upload",
  "--goto",
  "--open-chat",
  "--open-character",
  "--context-tab",
  "--panel",
  "--focus",
  ...PANEL_PRESET_VALUE_FLAGS,
  "--pages",
  "--contexts",
  "--as",
  "--fixture-server",
  "--fixture-base",
  "--file",
  "--watch",
  "--every",
  "--aria-depth",
  "--shot-of",
  "--mask",
  "--crop",
  "--out",
  "--viewport",
  "--scale",
  "--cpu-throttle",
  "--network",
  ...APPEARANCE_VALUE_FLAGS,
  ...THEME_VALUE_FLAGS,
  "--eval",
  "--contrast",
  "--cascade",
  "--expect-visible",
  "--expect-text",
  "--expect-count",
  "--expect-url",
  "--expect-focus",
  "--ref",
  "--session",
  "--session-daemon",
  "--session-close",
  "--session-export",
  "--session-ttl",
]);

export const OPTIONAL_SELECTOR_FLAGS = new Set(["--aria", "--text", "--map", "--expect-no-overflow"]);

/** Flags whose optional inline value is a NAME, never a selector — consumed when the next token is not a
 *  flag (ops/flags-session.ts `consumeOptionalName` is the handler-side twin of the scanner's rule). Kept
 *  apart from OPTIONAL_SELECTOR_FLAGS on purpose: that set is containment-pinned against
 *  lib/selector-shape.ts's SELECTOR_VALUE_FLAGS, and a session name is not a selector to refuse. */
export const OPTIONAL_NAME_FLAGS = new Set(["--session-status"]);

export const PAGE_TARGET_FLAGS = new Set([
  "--click",
  "--jsclick",
  "--press",
  "--hover",
  "--fill",
  "--key",
  "--wait-for",
  "--upload",
  "--goto",
  "--open-chat",
  "--open-character",
  "--context-tab",
  "--panel",
  "--focus",
  "--aria",
  "--text",
  "--eval",
  "--contrast",
  "--cascade",
  "--expect-visible",
  "--expect-text",
  "--expect-count",
  "--expect-url",
  "--expect-no-overflow",
  "--expect-focus",
  "--map",
]);
