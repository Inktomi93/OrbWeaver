// Shared constants + the queue-pusher/selector helpers ops/flags.ts's dispatch table is built from —
// split out when that table crossed the tooling line cap (docs/architecture/core/Core-Tooling-Law.md §4.3).
import type { Viewport } from "../../_shared/argv.ts";
import { refuseDirectInvocation } from "../../_shared/entrypoint.ts";
import type { Args, NavAction, PagedExpr, Step } from "../contract/types.ts";

refuseDirectInvocation(import.meta.url, "pnpm snap <route>");

export const MS_PER_SECOND = 1000;

export const DEFAULT_VIEWPORT: Viewport = { width: 1280, height: 800 };
// --wide: layout sanity at a real monitor width (neo's 1280 default disguised a dialog max-width bug for a morning).
export const WIDE_VIEWPORT: Viewport = { width: 1920, height: 1080 };
// --mobile: a Playwright device descriptor name (registry lookup in _shared/browser.ts). Real touch +
// pointer:coarse + mobile UA + DPR3, so the app's coarse-pointer progressive-disclosure and bottom-tab
// rail both render — a bare narrow viewport misses them. `scale:"css"` in SHOT_BASE keeps the DPR3 shot
// at 1 image px / CSS px (not 3×), so the PNG cost stays sane.
export const MOBILE_DEVICE = "iPhone 14 Pro Max";

// ── Flag dispatch helpers ───────────────────────────────────────────────────
// Each consumes what it needs from `rest`. Repeatable flags push; every order-sensitive drive flag
// (step OR bridge nav) lands in the ONE args.actions queue in argv order. `page` is the --pages tab
// index parsed off a `@<idx>` flag suffix (0 when unprefixed / single-page) — queued actions +
// per-page captures stamp it. The `FlagHandler` type these are shaped for lives with FLAG_HANDLERS in
// ops/flags-handlers.ts (module-private there, same as before the split).
export function pushStep(args: Args, step: Step): void {
  args.actions.push({ type: "step", action: step });
}

export function pushNav(args: Args, action: NavAction): void {
  args.actions.push({ type: "nav", action });
}

// --eval lands in BOTH homes on purpose: `args.eval` stays the canonical argv-ordered expr list (page
// targeting validation + the --watch series re-runs it every tick), while the queue entry carries its
// POSITION so an eval written mid-chain runs mid-chain. capture() runs each expression exactly once —
// see its drive/trailing split.
export function pushEval(args: Args, action: PagedExpr): void {
  args.eval.push(action);
  args.actions.push({ type: "eval", action });
}
// A `@<idx>` suffix on a flag (`--click@1`, `--eval@0`, `--aria@2`) selects a --pages tab — parsed by
// splitPageSuffix (_shared/argv.ts, unit-tested there).

// Optional inline selector: consume the next token ONLY if it's not a flag (--…) and not a
// route (/…). Selectors start with [ . # or a tag name. Shared by --aria/--text/--map's
// "defaults to a broad scope, narrow it inline" idiom.
export function consumeOptionalSelector(rest: string[]): string | null {
  const next = rest[0];
  if (next !== undefined && !next.startsWith("-") && !next.startsWith("/")) {
    return rest.shift() as string;
  }
  return null;
}

export function ariaFlag(args: Args, rest: string[], textMode: boolean, page: number): void {
  args.aria = true;
  args.ariaPage = page;
  // --text is the cheap combo: structure-as-text, no pixels.
  if (textMode) {
    args.shot = false;
  }
  const sel = consumeOptionalSelector(rest);
  if (sel !== null) {
    args.ariaSelector = sel;
  }
}

export function mapFlag(args: Args, rest: string[], page: number): void {
  args.map = true;
  args.mapPage = page;
  const sel = consumeOptionalSelector(rest);
  if (sel !== null) {
    args.mapSelector = sel;
  }
}
