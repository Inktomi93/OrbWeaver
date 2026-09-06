// Shared constants + the queue-pusher/selector helpers ops/flags.ts's dispatch table is built from —
// split out when that table crossed the tooling line cap (docs/architecture/core/Core-Tooling-Law.md §4.3).
import { refuseDirectInvocation } from "../../_shared/entrypoint.ts";
import type { Args, NavAction, PagedExpr, Step } from "../contract/types.ts";

refuseDirectInvocation(import.meta.url, "pnpm snap <route>");

export const MS_PER_SECOND = 1000;

/** THE UNSTATED SENTINEL (#1509), and the `--watch` tick interval's ONE resolver. `args.watchEveryMs`
 *  parses to 0 — "the argv did not state a cadence" — and every reader resolves it HERE, to one second. It
 *  used to parse straight to that default, which erased the difference between "no `--every`" and
 *  "`--every 1000`": session inheritance had no way to ask whether the call stated a cadence, so it asked
 *  about `--watch` instead and gave both asymmetric calls an interval the argv never asked for
 *  (`lib/session-plan.ts`). A stated `--every` can never be 0 — `FLAG_HANDLERS` floors it at 1. */
export function watchIntervalMs(args: Pick<Args, "watchEveryMs">): number {
  return args.watchEveryMs === 0 ? MS_PER_SECOND : args.watchEveryMs;
}

// --mobile: a Playwright device descriptor name (registry lookup in _shared/browser.ts). Real touch +
// pointer:coarse + mobile UA + DPR3, so the app's coarse-pointer progressive-disclosure and bottom-tab
// rail both render — a bare narrow viewport misses them. `scale:"css"` in SHOT_BASE keeps the DPR3 shot
// at 1 image px / CSS px (not 3×), so the PNG cost stays sane.
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
    return rest.shift() ?? null;
  }
  return null;
}

// The `--aria`/`--text` and `--map` flag bodies used to live here too; they moved to their arms
// (ops/arms/aria.ts, ops/arms/map.ts) with the registry, because a flag body belongs beside the code that
// reads what it parsed. What stays is what is genuinely SHARED across families: the queue pushers, the
// optional-selector predicate, and the viewport constants.
