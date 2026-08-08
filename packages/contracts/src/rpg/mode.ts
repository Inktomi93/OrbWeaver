// @orb/contracts/rpg/mode — the `mode` axis and its exhaustive `MODE_POLICY` record (rpg-design/05 §2.2).
// Both rows are DATA from day one: a new mode member fails `tsc` (the mapped-type `Record`), a new axis
// fails `tsc` at EVERY arm. Verb guards read the record via ONE `requireModeCapability(game, axis)` — never
// `if (mode === …)` in a verb body (§5.5 discipline).
//
// The line between lite and full is ENGINES vs DATA (the amendment): the ENGINE axes gate MACHINERY (d20
// checks, encounters, clocks, seat, sessions, maps, npcs, loot, the time/weather engine); the DATA-plane
// axes (`quests`/`journal`) are lite-TRUE (the 2026-07-26 amendment — objectives + beats are structured
// output that steers the plot). `quests`/`journal` stay POLICY AXES even though both modes are true: the
// axis is where full's ENGINE halves key their guards later (GM notes, quest clocks, session-wrap journal
// types); a both-true axis costs one `true` literal per row and deleting/re-adding it at graft is the
// re-spell the record exists to prevent.
//
// The preset override is DELIBERATELY NOT policy: it is the `gmPresetId` KNOB (§4.11 #1), mode-blind
// data with per-mode DEFAULTS. `prompt` shrinks to the prompt-STRATEGY axis only (injection vs gm-preset).

import type { RpgGameMode } from "./enums.ts";
import type { RpgToolName } from "./tools.ts";
import { RPG_LITE_TOOL_NAMES } from "./tools.ts";

export interface RpgModePolicy {
  /** lite: the 7-tuple (§4.6); full: its superset (grafts as data). */
  readonly tools: readonly RpgToolName[];
  /** The prompt STRATEGY only — injection (steering block) vs gm-preset (8 macros + GM reminder). The
   *  PRESET override is the `gmPresetId` KNOB (§4.11 #1), NOT policy. */
  readonly prompt: "injection" | "gm-preset";
  // ── the ENGINE axes (gate MACHINERY, never data planes) ──
  readonly seat: boolean;
  readonly sessions: boolean;
  readonly scenes: boolean;
  readonly clocks: boolean;
  readonly encounters: boolean;
  readonly maps: boolean;
  readonly morale: boolean;
  readonly perception: boolean;
  readonly checks: boolean;
  readonly npcs: boolean;
  readonly loot: boolean;
  /** the ENGINE; ambient DATA is mode-blind (§2.7). */
  readonly timeWeather: boolean;
  // ── the DATA-plane axes (lite TRUE per the 2026-07-26 amendment) ──
  readonly quests: boolean;
  readonly journal: boolean;
  /** full refuses non-tool models; lite degrades visibly (the honest-arms doctrine, §4.6). */
  readonly requireToolCapable: "hard" | "soft";
}

/** The exhaustive policy record — both rows shipped whole. `full` is present as DATA even though
 *  unmintable: `createGame(mode:"full")` throws the typed `RpgModeUnbuiltError` (PHASE
 *  disable-with-reason — the refusal names the graft, never pretends full doesn't exist). */
export const MODE_POLICY: Readonly<Record<RpgGameMode, RpgModePolicy>> = {
  lite: {
    tools: RPG_LITE_TOOL_NAMES,
    prompt: "injection",
    seat: false,
    sessions: false,
    scenes: false,
    clocks: false,
    encounters: false,
    maps: false,
    morale: false,
    perception: false,
    checks: false,
    npcs: false,
    loot: false,
    timeWeather: false,
    quests: true,
    journal: true,
    requireToolCapable: "soft",
  },
  full: {
    tools: RPG_LITE_TOOL_NAMES,
    prompt: "gm-preset",
    seat: true,
    sessions: true,
    scenes: true,
    clocks: true,
    encounters: true,
    maps: true,
    morale: true,
    perception: true,
    checks: true,
    npcs: true,
    loot: true,
    timeWeather: true,
    quests: true,
    journal: true,
    requireToolCapable: "hard",
  },
};

/** The ENGINE-axis names — the boolean gates a verb reads via `requireModeCapability`. Excludes `tools`
 *  (a tuple), `prompt`/`requireToolCapable` (non-boolean strategy axes). Derived so a new boolean axis is
 *  covered without a re-spell. */
/** @public locked shape — the derived key-union over `RpgModePolicy`'s boolean engine axes; every current
 *  `requireModeCapability` call site reads a specific axis literal, not this union. It is the full-mode
 *  surface a generic/iterating capability consumer would key off (rpg/index.ts KISS/YAGNI SUSPENDED). */
export type RpgModeCapabilityAxis = {
  [K in keyof RpgModePolicy]: RpgModePolicy[K] extends boolean ? K : never;
}[keyof RpgModePolicy];
