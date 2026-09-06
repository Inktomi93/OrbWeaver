// THE CONTEXT-TAB ARM (issue #656 — the false `ok:true` that poisoned every one-call probe chain), split
// out of agent-nav/index.ts (component-size, 2026-09-06) — no behavior change, same module graph
// (`#state`, `../lib/motion-stats.ts`, `../lib/agent-bridge.ts`), just its own file.
//
// A VOCABULARY THAT MAY BE EMPTY IS NOT A VOCABULARY. The context-tab set is PUBLISHED BY A MOUNT EFFECT
// and is empty for a beat after every navigation. Validating against it while empty validated vacuously —
// the arm dispatched an unresolvable string and reported `ok:true` on a panel showing a different tab.
// `resolveContextTab` waits on the panel's own publish (bounded) and verifies the landing; that is why it,
// alone among the bridge's arms, is async.

import type { PublishedContextTab } from "#state";
import { getAvailableContextTabIds, getAvailableContextTabs, getContextTab, revealContextPanel, subscribeShellState } from "#state";
import type { NavResult } from "../lib/agent-bridge.ts";
import { markAgentNavigation } from "../lib/motion-stats.ts";

// How long `contextTab` waits for the CONTEXT panel to publish a vocabulary that RESOLVES the request
// (issue #656). It is a deadline on the panel's OWN mount signal, never a sleep: the common case returns on
// the very first store write. The bound exists so a genuinely absent panel — a `single`-kind context, a
// closed shell, a surface with no tabs at all — FAILS LOUDLY instead of hanging a probe. 2s is far above a
// mount+publish (one effect after paint) and far below the harness's 10s readiness gate, so a refusal from
// here is a real "this surface has no such tab", not a timing artifact.
const CONTEXT_TAB_SETTLE_MS = 2000;

/** The outcome of matching a requested tab name against ONE reading of the published vocabulary: the stable
 *  id, the ids a label matched more than once, or nothing (which may only mean "not published yet"). */
type ContextTabMatch =
  | { readonly kind: "resolved"; readonly id: string }
  | { readonly kind: "ambiguous"; readonly ids: readonly string[] }
  | { readonly kind: "unmatched"; readonly available: readonly PublishedContextTab[] };

/** Match `requested` (a stable id OR a visible label, case-insensitively) against the tabs published RIGHT
 *  NOW. Pure over one reading — the caller decides whether an `unmatched` is a typo or an unmounted panel. */
function matchContextTab(requested: string): ContextTabMatch {
  const available = getAvailableContextTabs();
  const exactId = available.find((tab) => tab.id === requested);
  if (exactId !== undefined) {
    return { kind: "resolved", id: exactId.id };
  }
  const normalized = requested.toLocaleLowerCase();
  const byLabel = available.filter((tab) => tab.label.toLocaleLowerCase() === normalized);
  if (byLabel.length > 1) {
    return { kind: "ambiguous", ids: byLabel.map((tab) => tab.id) };
  }
  const single = byLabel[0];
  return single === undefined ? { kind: "unmatched", available } : { kind: "resolved", id: single.id };
}

/** Wait until `read()` returns a value, or give up at `deadlineMs` and return `null`.
 *
 *  DRIVEN BY THE STORE'S OWN CHANGE SIGNAL, NEVER A SLEEP (issue #656): a tabbed CONTEXT surface publishes
 *  its ids from a mount effect, so "the panel is ready" is a store write, and a fixed sleep would be exactly
 *  the settle-guess that made the bug survivable-looking. The deadline is the loud-failure floor. */
async function awaitShellValue<T>(read: () => T | null, deadlineMs: number): Promise<T | null> {
  const immediate = read();
  if (immediate !== null) {
    return immediate;
  }
  return await new Promise<T | null>((resolve) => {
    let unsubscribe: (() => void) | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const finish = (value: T | null): void => {
      if (timer !== null) {
        clearTimeout(timer);
        timer = null;
      }
      unsubscribe?.();
      unsubscribe = null;
      resolve(value);
    };
    timer = setTimeout((): void => finish(null), deadlineMs);
    unsubscribe = subscribeShellState((): void => {
      const value = read();
      if (value !== null) {
        finish(value);
      }
    });
  });
}

/** The tab the mounted panel is ACTUALLY showing, or `null` when no tabbed surface is mounted.
 *
 *  This is `useContextTabSelection`'s rule read from the outside, not a second copy of it: that resolver
 *  shows the stored `contextTab` only while it is still VISIBLE (published by the mounted surface) and
 *  otherwise falls back to the default/first tab. So a stored id the surface publishes IS the active tab —
 *  and a stored id it does not publish is precisely the fell-back case this arm must never call `ok`. */
function activeContextTab(): string | null {
  const published = getAvailableContextTabIds();
  if (published.length === 0) {
    return null;
  }
  const stored = getContextTab();
  return stored !== null && published.includes(stored) ? stored : null;
}

/** THE CONTEXT-TAB ARM (issue #656 — the false `ok:true` that poisoned every one-call probe chain).
 *
 *  WHAT WENT WRONG: the old arm validated the request against the published tab-id set and, when that set
 *  was EMPTY, treated "nothing to validate against" as permission to dispatch — an empty set validates
 *  vacuously. But the set is empty for a whole beat after `--open-chat`, because the panel publishes from a
 *  MOUNT EFFECT; so the first call wrote the raw LABEL ("This chat") as the stored tab id, the resolver saw
 *  an id it does not publish, fell back to Members — and the bridge returned `ok:true`. Every design-audit
 *  and snap chain that navigated with a single call censused MEMBERS while reporting the This-chat surface.
 *
 *  THE CONTRACT NOW: a navigation step that cannot verify its landing must not report success. Resolve
 *  against a vocabulary that EXISTS (waiting on the panel's own publish, bounded), then verify the tab the
 *  panel actually landed on. Every failure is distinguishable by its reason — an empty name, an ambiguous
 *  label, an unknown name against a published set, a panel that never published, and a landing that
 *  disagrees with the request are five different sentences, because a probe's next move differs for each. */
export async function resolveContextTab(name: string): Promise<NavResult> {
  const requested = name.trim();
  if (requested === "") {
    return { ok: false, reason: "context tab name is empty" };
  }
  let match = matchContextTab(requested);
  if (match.kind === "unmatched") {
    // The panel may simply not be mounted yet. OPEN it — with NO tab argument, because writing the
    // unresolved request is the false-ok itself — and wait for its own publish to resolve the name. The
    // wait also covers a set that GROWS after mount (a game chat's rpg tabs land with their query).
    markAgentNavigation();
    revealContextPanel();
    match = (await awaitShellValue((): ContextTabMatch | null => {
      const attempt = matchContextTab(requested);
      return attempt.kind === "unmatched" ? null : attempt;
    }, CONTEXT_TAB_SETTLE_MS)) ?? { kind: "unmatched", available: getAvailableContextTabs() };
  }
  if (match.kind === "ambiguous") {
    return { ok: false, reason: `ambiguous context tab label "${requested}" matches: ${match.ids.join(", ")}` };
  }
  if (match.kind === "unmatched") {
    return {
      ok: false,
      reason:
        match.available.length === 0
          ? `no tabbed context surface published any tabs within ${CONTEXT_TAB_SETTLE_MS}ms — "${requested}" could not be resolved, so the panel was NOT switched`
          : `unknown context tab "${requested}" — the mounted context surface offers: ${match.available.map((tab) => `${tab.id} (${tab.label})`).join(", ")}`,
    };
  }
  // COMPOSE the reveal, never a bare request (the `openChatIn` precedent: an arm that cannot take effect
  // must open what it needs). `setContextTab` alone left a collapsed panel unmounted, so the stored tab
  // was read by nothing — `revealContextPanel` opens the panel AND sets the tab, so the switch is visible.
  const resolved = match.id;
  markAgentNavigation();
  revealContextPanel(resolved);
  // THE LANDING CHECK. Bounded rather than immediate because a reveal can re-mount the panel (the sheet/dock
  // regimes), which republishes and momentarily reports nothing active.
  const landed = await awaitShellValue((): true | null => (activeContextTab() === resolved ? true : null), CONTEXT_TAB_SETTLE_MS);
  if (landed === null) {
    return {
      ok: false,
      reason: `context tab "${requested}" resolved to "${resolved}" but the mounted panel settled on "${activeContextTab() ?? "no tabbed surface"}"`,
    };
  }
  return { ok: true };
}
