// THE ONE SPA-navigation vocabulary for the browser probes — the dev nav bridge (`window.__orb.nav`,
// packages/client/src/lib/agent-bridge.ts) every probe drives to reach a surface the URL cannot name (the
// app routes only `/` and `/login`; sections, modals, config groups, context tabs, open chats and the
// SHELL PANEL LAYOUT are all client state).
//
// WHY THIS MODULE EXISTS: the bridge call was hand-spelled in snap.ts and
// again in design-audit.ts, and `motion-audit`/`perf-meter` — the two probes that answer "is this surface
// SMOOTH / RESPONSIVE" — had no nav flags at all. That was not a missing convenience: a chat room needs
// 2+ hops, so the chat context panel was STRUCTURALLY unmeasurable by both, and a throttled INP number for
// a 208ms keydown could not be taken at all. One vocabulary, four probes, identical semantics.
//
// `panel` (the same gap one level out): panels docked/collapsed
// were not an axis ANY probe could reach — not an arm, not a matrix cell, nothing enumerated the states — so
// a report of text flush to a panel edge or a clipped rounded button could not be told apart from "lives in
// a state no instrument visits". For motion-audit specifically a panel toggle is not only a state to reach
// but an ANIMATION (the docked↔collapsed FLIP, `use-shell-track-flip.ts` + `shell.css`'s
// `shell-main-flip`), so driving it also makes one of the app's largest motion surfaces measurable.
//
// The bridge is dev-only (`installAgentDebugHandle` gates on IS_DEV): against a prod/old build every action
// fails LOUDLY with a stated reason. A nav that did not land means the probe is measuring some OTHER
// surface, which is worse than not measuring — never silently continue on `ok:false`.
import { errorMessage } from "@orb/kit/error-message";
import { parseGotoTarget, splitLastEq } from "@orb/tooling/floor/instrument/argv";
import type { Page } from "@playwright/test";
import { navResultShape } from "../browser/page-validate.ts";
import { budgets } from "../host/load-budget.ts";
import type { OrbNav } from "./orb-bridge.ts";

/** The nav verbs a probe CLI offers, spelled as they appear on the command line (minus the `--`). */
export const NAV_METHODS = ["goto", "open-chat", "open-character", "context-tab", "panel"] as const;
export type NavMethod = (typeof NAV_METHODS)[number];

/** The CLI flags that carry a nav action, in the order the help text lists them. */
export const NAV_FLAGS: readonly string[] = ["--goto", "--open-chat", "--open-character", "--context-tab", "--panel"];

/** `--<flag>` → the nav verb it queues. */
export const NAV_FLAG_METHOD: Record<string, NavMethod> = {
  "--goto": "goto",
  "--open-chat": "open-chat",
  "--open-character": "open-character",
  "--context-tab": "context-tab",
  "--panel": "panel",
};

// The 1:1 verb→bridge-method map. `goto` and `panel` are absent by design: `goto`'s target is namespaced
// (`settings:<group>[.<sub>[.<setting>]]` / `modal:<slot>` / a bare section id) and picks its method
// through parseGotoTarget, which REFUSES an address the grammar cannot spell rather than truncating it;
// `panel`'s target carries TWO bridge arguments (`<name>=<mode>`), decoded below beside goto's own
// multi-arg case rather than forced through this 1-target-in-1-arg-out map.
const NAV_BRIDGE_METHOD = {
  "open-chat": "openChat",
  "open-character": "openCharacter",
  "context-tab": "contextTab",
} as const satisfies Record<Exclude<NavMethod, "goto" | "panel">, keyof OrbNav>;

type NavBridgeMethod = "section" | "openModal" | "openConfig" | "panel" | (typeof NAV_BRIDGE_METHOD)[keyof typeof NAV_BRIDGE_METHOD];

/** The decoded bridge call: one concrete `__orb.nav` method with the arguments the handle's own signature takes. */
export type NavInvocation = { readonly [Method in NavBridgeMethod]: { readonly method: Method; readonly args: Parameters<OrbNav[Method]> } }[NavBridgeMethod];

/** Decode one verb+target pair into its bridge call. `goto`'s target is namespaced and picks its method
 *  through parseGotoTarget; `panel`'s target is `<name>=<mode>` (the same `<a>=<b>` shape `--fill`/
 *  `--key`/`--expect-text` use, split with splitLastEq — a panel NAME never contains `=`) and becomes TWO
 *  bridge arguments; every other verb passes its target through as one bridge argument. The `--goto`/`--panel`
 *  decode happens HERE in Node (parseGotoTarget is unit-tested in floor/instrument/argv.ts) so the page only ever
 *  receives one concrete bridge method. */
export function decodeNavCall(method: NavMethod, target: string): NavInvocation {
  if (method === "goto") {
    const goto = parseGotoTarget(target);
    if (goto.method === "openConfig") {
      // openConfig is the one variadic bridge method: `(group, sub?, setting?)`. The optional legs are
      // passed only when the address spelled them — a trailing `undefined` would be a different call than
      // the two-part form, and parseGotoTarget already refused any shape that cannot fill them in order.
      if (goto.sub === undefined) {
        return { method: "openConfig", args: [goto.arg] };
      }
      return { method: "openConfig", args: goto.setting === undefined ? [goto.arg, goto.sub] : [goto.arg, goto.sub, goto.setting] };
    }
    return { method: goto.method, args: [goto.arg] };
  }
  if (method === "panel") {
    const { head, tail } = splitLastEq(target);
    return { method: "panel", args: [head, tail] };
  }
  return { method: NAV_BRIDGE_METHOD[method], args: [target] };
}

/** The in-page half of one nav action, run by `page.evaluate`: it carries no import, because the page cannot see this
 *  module's scope, and it is the one place the nav handle's members are called, so the compiler checks each against
 *  the client's own `OrbNavHandle`. */
export async function callNavInPage(call: NavInvocation): Promise<NavOutcome> {
  const nav = globalThis.__orb?.nav;
  if (nav === undefined) {
    return { ok: false, reason: "__orb.nav unavailable (not a dev build?)" };
  }
  switch (call.method) {
    case "section":
      return nav.section(...call.args);
    case "openModal":
      return nav.openModal(...call.args);
    case "openConfig":
      return nav.openConfig(...call.args);
    case "panel":
      return await nav.panel(...call.args);
    case "openChat":
      return await nav.openChat(...call.args);
    case "openCharacter":
      return await nav.openCharacter(...call.args);
    case "contextTab":
      return await nav.contextTab(...call.args);
  }
}

/** Run one nav action in the page and hand back the bridge's raw answer for `navResultShape` to validate. */
export function evaluateNav(page: Pick<Page, "evaluate">, method: NavMethod, target: string): Promise<NavOutcome> {
  return page.evaluate(callNavInPage, decodeNavCall(method, target));
}

/** `{ ok: true }` or a stated reason — the NavResult shape the bridge itself returns. */
export type NavOutcome = { readonly ok: true } | { readonly ok: false; readonly reason: string };

// A CEILING, load-scaled through the one policy: the literal is the QUIET-BOX base.
const CEILINGS_MS = budgets({ readyTimeout: 10_000 });

/** Await app-readiness + the bridge, then run one nav action. Never throws: a thrown evaluate (no bridge,
 *  a navigation mid-call) comes back as `ok:false` with the message, because the caller's job is to COUNT
 *  and PRINT the failure, not to die on it. */
export async function runNav(page: Page, method: NavMethod, target: string): Promise<NavOutcome> {
  try {
    await page.locator("html[data-app-ready]").waitFor({ state: "attached", timeout: CEILINGS_MS.readyTimeout });
    // the readiness ping is advisory and the bridge call below it is the check: a missing bridge or a navigation mid-call comes back from runNav as { ok: false, reason }, which motion-nav prints as NAV FAILED. Ends if the ping becomes the only readiness check.
    await page.evaluate(() => globalThis.__orb?.ready).catch(() => undefined);
    // The bridge's answer is VALIDATED at the seam, not asserted. An absent `ok` used to read as
    // falsy and report a nav failure that never happened; a truthy non-boolean read as success.
    const result = navResultShape(await evaluateNav(page, method, target), `nav ${method} ${target}`);
    return result.ok ? { ok: true } : { ok: false, reason: result.reason ?? "rejected" };
  } catch (e) {
    return { ok: false, reason: errorMessage(e) };
  }
}
