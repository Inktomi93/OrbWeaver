// THE ONE SPA-navigation vocabulary for the browser probes — the dev nav bridge (`window.__orb.nav`,
// packages/client/src/lib/agent-bridge.ts) every probe drives to reach a surface the URL cannot name (the
// app routes only `/` and `/login`; sections, modals, config groups, context tabs, open chats and the
// SHELL PANEL LAYOUT are all client state).
//
// WHY THIS MODULE EXISTS (2026-08-17, issue #148 item 1): the bridge call was hand-spelled in snap.ts and
// again in design-audit.ts, and `motion-audit`/`perf-meter` — the two probes that answer "is this surface
// SMOOTH / RESPONSIVE" — had no nav flags at all. That was not a missing convenience: a chat room needs
// 2+ hops, so the chat context panel was STRUCTURALLY unmeasurable by both, and a throttled INP number for
// a 208ms keydown could not be taken at all. One vocabulary, four probes, identical semantics.
//
// `panel`/`focus` (2026-08-31, #148 item 2 — the same gap one level out): panels docked/collapsed/focus-mode
// were not an axis ANY probe could reach — not an arm, not a matrix cell, nothing enumerated the states — so
// a report of text flush to a panel edge or a clipped rounded button could not be told apart from "lives in
// a state no instrument visits". For motion-audit specifically a panel toggle is not only a state to reach
// but an ANIMATION (the docked↔collapsed FLIP, `use-list-track-flip.ts` + `shell.css`'s
// `shell-list-push-in`), so driving it also makes one of the app's largest motion surfaces measurable.
//
// The bridge is dev-only (`installAgentDebugHandle` gates on IS_DEV): against a prod/old build every action
// fails LOUDLY with a stated reason. A nav that did not land means the probe is measuring some OTHER
// surface, which is worse than not measuring — never silently continue on `ok:false`.
import { errorMessage } from "@orb/kit/error-message";
import { parseGotoTarget, splitLastEq } from "@orb/tooling/_shared/argv";
import type { Page } from "@playwright/test";
import { budget } from "./load-budget.ts";
import { navResultShape } from "./page-validate.ts";

/** The nav verbs a probe CLI offers, spelled as they appear on the command line (minus the `--`). */
export const NAV_METHODS = ["goto", "open-chat", "open-character", "context-tab", "panel", "focus"] as const;
export type NavMethod = (typeof NAV_METHODS)[number];

/** The CLI flags that carry a nav action, in the order the help text lists them. */
export const NAV_FLAGS: readonly string[] = ["--goto", "--open-chat", "--open-character", "--context-tab", "--panel", "--focus"];

/** `--<flag>` → the nav verb it queues. */
export const NAV_FLAG_METHOD: Record<string, NavMethod> = {
  "--goto": "goto",
  "--open-chat": "open-chat",
  "--open-character": "open-character",
  "--context-tab": "context-tab",
  "--panel": "panel",
  "--focus": "focus",
};

// The 1:1 verb→bridge-method map. `goto` and `panel` are absent by design: `goto`'s target is namespaced
// (`settings:<group>[.<sub>[.<setting>]]` / `modal:<slot>` / a bare section id) and picks its method
// through parseGotoTarget, which REFUSES an address the grammar cannot spell rather than truncating it;
// `panel`'s target carries TWO bridge arguments (`<name>=<mode>`), decoded below beside goto's own
// multi-arg case rather than forced through this 1-target-in-1-arg-out map.
const NAV_BRIDGE_METHOD: Record<Exclude<NavMethod, "goto" | "panel">, string> = {
  "open-chat": "openChat",
  "open-character": "openCharacter",
  "context-tab": "contextTab",
  focus: "focus",
};

/** The decoded bridge call: the concrete `__orb.nav` method plus its already-JS-literal argument list. */
interface NavCall {
  readonly bridgeMethod: string;
  readonly args: string;
}

/** Decode one verb+target pair into its bridge call. `goto`'s target is namespaced and picks its method
 *  through parseGotoTarget; `panel`'s target is `<name>=<mode>` (the same `<a>=<b>` shape `--fill`/
 *  `--key`/`--expect-text` use, split with splitLastEq — a panel NAME never contains `=`) and becomes TWO
 *  bridge arguments; `focus` takes a `"on"|"off"` target and becomes ONE boolean argument (each CLI's own
 *  parse validates the value is exactly `on`/`off` before this ever runs — this module trusts it); every
 *  other verb passes its target through as one bridge argument. */
function decodeNavCall(method: NavMethod, target: string): NavCall {
  if (method === "goto") {
    const goto = parseGotoTarget(target);
    // openConfig is the one variadic bridge method: `(group, sub?, setting?)`. The optional legs are
    // emitted only when the address spelled them — a trailing `undefined` would be a different call than
    // the two-part form, and parseGotoTarget already refused any shape that cannot fill them in order.
    const parts = goto.method === "openConfig" ? [goto.arg, goto.sub, goto.setting] : [goto.arg];
    return {
      bridgeMethod: goto.method,
      args: parts
        .filter((part) => part !== undefined)
        .map((part) => JSON.stringify(part))
        .join(", "),
    };
  }
  if (method === "panel") {
    const { head, tail } = splitLastEq(target);
    return { bridgeMethod: "panel", args: `${JSON.stringify(head)}, ${JSON.stringify(tail)}` };
  }
  if (method === "focus") {
    return { bridgeMethod: NAV_BRIDGE_METHOD.focus, args: JSON.stringify(target === "on") };
  }
  return { bridgeMethod: NAV_BRIDGE_METHOD[method], args: JSON.stringify(target) };
}

/** The in-page bridge call for one action. The `--goto`/`--panel` decode happens HERE in Node
 *  (parseGotoTarget is unit-tested in _shared/argv.ts) so the emitted script only ever names one concrete
 *  bridge method. */
export function buildNavScript(method: NavMethod, target: string): string {
  const { bridgeMethod, args } = decodeNavCall(method, target);
  return `(async () => {
    const nav = window.__orb && window.__orb.nav;
    if (!nav) return { ok: false, reason: "__orb.nav unavailable (not a dev build?)" };
    return await nav.${bridgeMethod}(${args});
  })()`;
}

/** `{ ok: true }` or a stated reason — the NavResult shape the bridge itself returns. */
export type NavOutcome = { readonly ok: true } | { readonly ok: false; readonly reason: string };

// A CEILING, load-scaled through the one policy (#1232): the literal is the QUIET-BOX base.
const READY_TIMEOUT_MS_BASE = 10_000;
const READY_TIMEOUT_MS = budget(READY_TIMEOUT_MS_BASE);

/** Await app-readiness + the bridge, then run one nav action. Never throws: a thrown evaluate (no bridge,
 *  a navigation mid-call) comes back as `ok:false` with the message, because the caller's job is to COUNT
 *  and PRINT the failure, not to die on it. */
export async function runNav(page: Page, method: NavMethod, target: string): Promise<NavOutcome> {
  try {
    await page.locator("html[data-app-ready]").waitFor({ state: "attached", timeout: READY_TIMEOUT_MS });
    // @orb-waive caught-failure-ownership(page.evaluate): a best-effort readiness ping before the real bridge call two lines below — any genuine failure (no bridge, mid-navigation) is caught by the surrounding try and returned as ok:false with the message. Ends if this becomes the only readiness signal checked.
    await page.evaluate("window.__orb && window.__orb.ready").catch(() => undefined);
    // #1004: the bridge's answer is VALIDATED at the seam, not asserted. An absent `ok` used to read as
    // falsy and report a nav failure that never happened; a truthy non-boolean read as success.
    const result = navResultShape(await page.evaluate(buildNavScript(method, target)), `nav ${method} ${target}`);
    return result.ok ? { ok: true } : { ok: false, reason: result.reason ?? "rejected" };
  } catch (e) {
    return { ok: false, reason: errorMessage(e) };
  }
}
