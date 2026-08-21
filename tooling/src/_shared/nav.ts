// THE ONE SPA-navigation vocabulary for the browser probes — the dev nav bridge (`window.__orb.nav`,
// packages/client/src/lib/agent-bridge.ts) every probe drives to reach a surface the URL cannot name (the
// app routes only `/` and `/login`; sections, modals, settings categories, context tabs and open chats are
// client state).
//
// WHY THIS MODULE EXISTS (2026-08-17, issue #148 item 1): the bridge call was hand-spelled in snap.ts and
// again in design-audit.ts, and `motion-audit`/`perf-meter` — the two probes that answer "is this surface
// SMOOTH / RESPONSIVE" — had no nav flags at all. That was not a missing convenience: a chat room needs
// 2+ hops, so the chat context panel was STRUCTURALLY unmeasurable by both, and a throttled INP number for
// a 208ms keydown could not be taken at all. One vocabulary, four probes, identical semantics.
//
// The bridge is dev-only (`installAgentDebugHandle` gates on IS_DEV): against a prod/old build every action
// fails LOUDLY with a stated reason. A nav that did not land means the probe is measuring some OTHER
// surface, which is worse than not measuring — never silently continue on `ok:false`.
import { errorMessage } from "@orb/kit/error-message";
import { parseGotoTarget } from "@orb/tooling/_shared/argv";
import type { Page } from "@playwright/test";

/** The nav verbs a probe CLI offers, spelled as they appear on the command line (minus the `--`). */
export const NAV_METHODS = ["goto", "open-chat", "open-character", "context-tab"] as const;
export type NavMethod = (typeof NAV_METHODS)[number];

/** The CLI flags that carry a nav action, in the order the help text lists them. */
export const NAV_FLAGS: readonly string[] = ["--goto", "--open-chat", "--open-character", "--context-tab"];

/** `--<flag>` → the nav verb it queues. */
export const NAV_FLAG_METHOD: Record<string, NavMethod> = {
  "--goto": "goto",
  "--open-chat": "open-chat",
  "--open-character": "open-character",
  "--context-tab": "context-tab",
};

// The 1:1 verb→bridge-method map. `goto` is absent by design: its target is namespaced
// (`settings:<cat>` / `modal:<slot>` / a bare section id) and picks its method through parseGotoTarget.
const NAV_BRIDGE_METHOD: Record<Exclude<NavMethod, "goto">, string> = {
  "open-chat": "openChat",
  "open-character": "openCharacter",
  "context-tab": "contextTab",
};

/** The in-page bridge call for one action. The `--goto` decode happens HERE in Node (parseGotoTarget is
 *  unit-tested in _shared/argv.ts) so the emitted script only ever names one concrete bridge method. */
export function buildNavScript(method: NavMethod, target: string): string {
  const goto = method === "goto" ? parseGotoTarget(target) : null;
  const bridgeMethod = goto === null ? NAV_BRIDGE_METHOD[method as Exclude<NavMethod, "goto">] : goto.method;
  const arg = JSON.stringify(goto === null ? target : goto.arg);
  return `(async () => {
    const nav = window.__orb && window.__orb.nav;
    if (!nav) return { ok: false, reason: "__orb.nav unavailable (not a dev build?)" };
    return await nav.${bridgeMethod}(${arg});
  })()`;
}

/** `{ ok: true }` or a stated reason — the NavResult shape the bridge itself returns. */
export type NavOutcome = { readonly ok: true } | { readonly ok: false; readonly reason: string };

const READY_TIMEOUT_MS = 10_000;

/** Await app-readiness + the bridge, then run one nav action. Never throws: a thrown evaluate (no bridge,
 *  a navigation mid-call) comes back as `ok:false` with the message, because the caller's job is to COUNT
 *  and PRINT the failure, not to die on it. */
export async function runNav(page: Page, method: NavMethod, target: string): Promise<NavOutcome> {
  try {
    await page.locator("html[data-app-ready]").waitFor({ state: "attached", timeout: READY_TIMEOUT_MS });
    await page.evaluate("window.__orb && window.__orb.ready").catch(() => undefined);
    const result = (await page.evaluate(buildNavScript(method, target))) as { ok: boolean; reason?: string };
    return result.ok ? { ok: true } : { ok: false, reason: result.reason ?? "rejected" };
  } catch (e) {
    return { ok: false, reason: errorMessage(e) };
  }
}
