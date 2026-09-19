// The four flag-class Sets ops/parse.ts's scanner validates argv against (required-value, optional inline
// selector, optional inline name, page-targetable). Split out of ops/flags.ts alongside the handler table
// when that file crossed the tooling line cap (docs/architecture/core/Core-Tooling-Law.md §4.3) — these
// Sets are read-only classification data, distinct from the dispatch table they describe.
//
// THE ARM MEMBERS ARE DERIVED, NOT LISTED (docs/design/1208-instrument-substrate.md §6). Every arm flag
// declares its own consumption `kind` on its `ArmDef.flags` row, and the registry folds those into the
// classes below. Two of these Sets — the optional-selector and optional-value classes — turned out to be
// ENTIRELY arm-owned, which is the tell that the split was real: they exist because arms scope
// themselves inline. Before this, a new arm flag meant remembering to add it here as well as to the
// handler table, and the failure mode of forgetting was silent (an unlisted required-value flag has its
// value counted as the positional ROUTE).
import { APPEARANCE_VALUE_FLAGS } from "../../_shared/appearance-flags.ts";
import { refuseDirectInvocation } from "../../_shared/entrypoint.ts";
import { PANEL_PRESET_VALUE_FLAGS } from "../../_shared/panel-flags.ts";
import { THEME_VALUE_FLAGS } from "../../_shared/theme.ts";
import { armFlagsOfKind, pageTargetableArmFlags } from "./arms/registry.ts";

refuseDirectInvocation(import.meta.url, "pnpm snap <route>");

export const REQUIRED_VALUE_FLAGS = new Set([
  "--scenario",
  "--wait",
  "--stream-settle",
  "--base",
  "--debug-token",
  "--diagnostics",
  "--click",
  "--tap",
  "--dom-click",
  "--force-click",
  "--hover",
  "--local-storage",
  "--fill",
  "--key",
  "--wait-for",
  "--upload",
  "--drop-files",
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
  "--out",
  "--viewport",
  "--scale",
  "--cpu-throttle",
  "--network",
  ...APPEARANCE_VALUE_FLAGS,
  ...THEME_VALUE_FLAGS,
  "--ref",
  "--session",
  "--session-daemon",
  "--session-close",
  "--session-export",
  "--session-ttl",
  "--stage-owner",
  "--stage-keeper",
  ...armFlagsOfKind("required-value"),
]);

/** Flags that take an OPTIONAL inline SELECTOR (`--map .rail`, `--text body`) — consumed when the next
 *  token is neither a flag nor a route, and then held to the unmatchable-selector refusal. */
export const OPTIONAL_SELECTOR_FLAGS = new Set(armFlagsOfKind("optional-selector"));

/** Flags that take an OPTIONAL inline value which is NOT a selector, so the scanner must consume it
 *  without handing it to the unmatchable-selector refusal. Kept apart from OPTIONAL_SELECTOR_FLAGS on
 *  purpose: `--requests trpc` is a URL substring, and lib/selector-shape.ts would read the bare word as a
 *  type-selector chain and refuse the run (the #550 predicate, applied to the wrong vocabulary). The
 *  containment pin in tests/tooling/snap/lib/selector-shape.test.ts governs the selector set only. */
export const OPTIONAL_VALUE_FLAGS = new Set(armFlagsOfKind("optional-value"));

/** Flags whose optional inline value is a NAME, never a selector — consumed when the next token is not a
 *  flag (ops/flags-session.ts `consumeOptionalName` is the handler-side twin of the scanner's rule). Kept
 *  apart from OPTIONAL_SELECTOR_FLAGS for the same reason as OPTIONAL_VALUE_FLAGS above, and apart from
 *  OPTIONAL_VALUE_FLAGS because the RULES differ: a name swallows a `/`-leading token (so
 *  `--session-status /x` is refused as a bad name), a value does not (so `--requests /route` leaves the
 *  route alone). Two classes, two predicates in ops/parse.ts — not a synonym pair. */
export const OPTIONAL_NAME_FLAGS = new Set(["--session-status"]);

export const PAGE_TARGET_FLAGS = new Set([
  "--click",
  "--tap",
  "--dom-click",
  "--force-click",
  "--hover",
  "--fill",
  "--key",
  "--wait-for",
  "--upload",
  "--drop-files",
  "--goto",
  "--open-chat",
  "--open-character",
  "--context-tab",
  "--panel",
  "--focus",
  ...pageTargetableArmFlags(),
]);
