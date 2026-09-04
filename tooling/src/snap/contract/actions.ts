// Snap's one argv-ordered browser-drive queue. Types stay separate from the larger run/result contract so
// adding an action cannot push that contract back over tooling's hard source-size ceiling.
import type { NavMethod } from "../../_shared/nav.ts";

// `page` = the target page index for --pages multi-tab mode (0 when unprefixed / single-page). Every
// step/capture carries it so one flat argv-ordered list can drive N tabs in one shared context.
type StepAction =
  | { kind: "click"; selector: string }
  | { kind: "motion-click"; selector: string | null }
  | { kind: "jsclick"; selector: string }
  | { kind: "press"; selector: string }
  | { kind: "hover"; selector: string }
  | { kind: "fill"; selector: string; value: string }
  | { kind: "key"; selector: string; key: string }
  // A BARE key (`--key Tab`) — dispatched to the page keyboard with NO focus change, which is what
  // makes a Tab WALK possible. The `selector=Key` arm above re-FOCUSES its selector before every press,
  // so N of them land N times on the same neighbour instead of walking (2026-08-16: the settings
  // dialog's tab order was unmeasurable, and the audit concluded "Tab never advances focus").
  | { kind: "keyboard"; key: string }
  | { kind: "waitfor"; selector: string }
  | { kind: "pause"; ms: number }
  | { kind: "wheel"; selector: string; dy: number }
  | { kind: "wheelburst"; selector: string; dy: number; count: number }
  // File picker and DataTransfer are separate browser protocols. Both share the path boundary and
  // receipt engine, but the action kind keeps the app feeder under test explicit.
  | { kind: "upload"; selector: string; paths: readonly string[] }
  | { kind: "drop-files"; selector: string; paths: readonly string[] };
export type Step = StepAction & { page: number };

// --goto / --open-chat / --open-character / --context-tab: SPA navigation via the app's dev nav bridge
// (window.__orb.nav). `target` is the raw flag value; the kind picks the __orb.nav method. These are
// INTERLEAVED with the interaction steps in one argv-ordered queue (see SnapAction) — a nav in the middle
// of a chain runs where it was written, not before the chain.
// The kind axis IS `_kit/nav.ts`'s NavMethod — one importable union for every probe, so a new nav verb
// lands in one place and every probe's dispatch fails to compile until it is handled.
export interface NavAction {
  kind: NavMethod;
  target: string;
  page: number;
}

/** ONE argv-ordered queue of everything that DRIVES the page before capture: bridge navigations,
 *  interaction steps, and `--eval` expressions, tagged by which they are. A flat command reads as
 *  ordered, so it must BE ordered — the old shape kept two arrays and ran every nav before every step as
 *  a CLASS, which silently reordered `--goto modal:newChat --click <create> --context-tab rpg.game` into
 *  a context-tab against the landing page (2026-08-15, one live chain lost to it), and `--eval` stayed
 *  out of the queue entirely until 2026-08-16, so `--eval A --click X` reported A's POST-click state.
 *  Every member carries `.action.page`, so per-page filtering for `--pages @<idx>` reads the same on all.
 *  Only the three ACTION-BEARING flag families live here; the pure captures (--map/--aria/--contrast/
 *  --expect-*) observe the settled surface once, after the queue drains. */
export type SnapAction =
  | { readonly type: "nav"; readonly action: NavAction }
  | { readonly type: "step"; readonly action: Step }
  | { readonly type: "eval"; readonly action: PagedExpr };

// A per-page eval keeps its argv-order expression plus the target page.
export interface PagedExpr {
  expr: string;
  page: number;
}

export type Assertion =
  | { kind: "visible"; selector: string; page: number }
  | { kind: "text"; selector: string; expected: string; page: number }
  | { kind: "count"; selector: string; expected: number; page: number }
  | { kind: "url"; expected: string; page: number }
  | { kind: "overflow"; selector: string; page: number }
  | { kind: "focus"; selector: string; page: number };
