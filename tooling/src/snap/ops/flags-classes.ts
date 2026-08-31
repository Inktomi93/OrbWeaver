// The three flag-class Sets ops/parse.ts's scanner validates argv against (required-value, optional
// inline selector, page-targetable). Split out of ops/flags.ts alongside the handler table when that
// file crossed the tooling line cap (docs/architecture/core/Core-Tooling-Law.md §4.3) — these Sets are read-only
// classification data, distinct from the dispatch table they describe.
import { APPEARANCE_VALUE_FLAGS } from "../../_shared/appearance.ts";
import { refuseDirectInvocation } from "../../_shared/entrypoint.ts";
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
]);

export const OPTIONAL_SELECTOR_FLAGS = new Set(["--aria", "--text", "--map", "--expect-no-overflow"]);

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
