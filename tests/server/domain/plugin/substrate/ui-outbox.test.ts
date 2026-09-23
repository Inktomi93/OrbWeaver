// The per-plugin UI OUTBOX + the dialog resolve. Mirror of
// `domain/plugin/substrate/ui-outbox.ts`.
//
// FOUR PROPERTIES ARE LOAD-BEARING HERE, and each is a wall rather than a convenience:
//  1. ATTRIBUTION — the plugin's name is stamped host-side. A guest supplies only the sentence, so it can never
//     spell a prefix that names someone else. This is the toast half of the §4.8 labelled-shell rule.
//  2. THE RATE FLOOR — a toast is an interruption and the membrane admits 32 concurrent host calls per
//     instance, so without a floor one plugin buries the screen. It THROWS (a rejected guest promise) rather
//     than dropping silently: a plugin over its ceiling should be told.
//  3. PER-PLUGIN ISOLATION — one plugin's outbox is never drained by another's round-trip, and one plugin's
//     cooldown never gates another's toast.
//  4. THE DIALOG RESOLVE — an id survives only when it names a `dialog`-anchored surface THIS instance
//     registered. A `page`/`settings` surface smuggled into the modal shell, or a stale id, costs the ask and
//     nothing else (the §4.9 soft-refusal posture).

import type { PluginInstance, PluginSurfaceRegistration } from "@orb/contracts/plugin";
import { PLUGIN_TOAST_COOLDOWN_SECONDS, PLUGIN_TOAST_MAX_CHARS, PLUGIN_UI_OUTBOX_MAX } from "@orb/contracts/plugin";
import { ID_PREFIX, mintTypeId } from "@orb/kit/ids";
import { createPluginUiOutbox, resolveUiOutcome } from "@orb/server/domain/plugin";
import { describe } from "vitest";
import { expect, test } from "../../../../support/fixtures.ts";

// TypeIDs are MINTED, never hand-written literals (the branded suffix is validated at runtime).
const PLUGIN = { id: mintTypeId(ID_PREFIX.plugin), name: "Oracle Deck", slug: "oracle-deck" };
const OTHER = { id: mintTypeId(ID_PREFIX.plugin), name: "Scene Chips", slug: "scene-chips" };

const COOLDOWN_MS = PLUGIN_TOAST_COOLDOWN_SECONDS * 1000;

/** A frozen clock the test advances — the injected-clock seam, so the cooldown is exercised without sleeping. */
function frozenClock(): { now: () => number; advance: (ms: number) => void } {
  let at = 1_700_000_000_000;
  return {
    now: (): number => at,
    advance: (ms: number): void => {
      at += ms;
    },
  };
}

function instanceWith(surfaces: readonly PluginSurfaceRegistration[]): PluginInstance {
  return { tools: [], transforms: [], events: [], pubsub: [], surfaces, commands: [], displayTransforms: [], macros: [] };
}

describe("plugin UI outbox", () => {
  test("a toast is stamped with the PLUGIN's own name — the guest supplies only the sentence", () => {
    const clock = frozenClock();
    const outbox = createPluginUiOutbox(clock.now);
    outbox.pushToast(PLUGIN, "info", "The Road (1 of 22)");
    expect(outbox.drain(PLUGIN.id).toasts).toEqual([{ level: "info", message: "Oracle Deck: The Road (1 of 22)" }]);
  });

  test("the body is capped — a plugin cannot buy screen space by writing a paragraph", () => {
    const clock = frozenClock();
    const outbox = createPluginUiOutbox(clock.now);
    outbox.pushToast(PLUGIN, "info", "x".repeat(PLUGIN_TOAST_MAX_CHARS * 2));
    const [toast] = outbox.drain(PLUGIN.id).toasts;
    // The prefix is the plugin's name plus ": " — the CAP applies to the guest's own text.
    expect(toast?.message).toBe(`Oracle Deck: ${"x".repeat(PLUGIN_TOAST_MAX_CHARS)}`);
  });

  test("the RATE FLOOR throws inside the cooldown and admits again after it — one notice per window", () => {
    const clock = frozenClock();
    const outbox = createPluginUiOutbox(clock.now);
    outbox.pushToast(PLUGIN, "info", "first");
    expect(() => outbox.pushToast(PLUGIN, "info", "second")).toThrow(/every \d+s/u);
    // Just short of the window is still refused…
    clock.advance(COOLDOWN_MS - 1);
    expect(() => outbox.pushToast(PLUGIN, "info", "still too soon")).toThrow();
    // …and the window's far edge admits.
    clock.advance(1);
    outbox.pushToast(PLUGIN, "info", "later");
    expect(outbox.drain(PLUGIN.id).toasts.map((t) => t.message)).toEqual(["Oracle Deck: first", "Oracle Deck: later"]);
  });

  test("the floor and the queue are PER PLUGIN — one plugin never gates or drains another", () => {
    const clock = frozenClock();
    const outbox = createPluginUiOutbox(clock.now);
    outbox.pushToast(PLUGIN, "info", "mine");
    // Inside PLUGIN's cooldown, but a different plugin's own window has not started.
    outbox.pushToast(OTHER, "info", "theirs");
    expect(outbox.drain(PLUGIN.id).toasts).toEqual([{ level: "info", message: "Oracle Deck: mine" }]);
    expect(outbox.drain(OTHER.id).toasts).toEqual([{ level: "info", message: "Scene Chips: theirs" }]);
  });

  test("the queue is BOUNDED, oldest evicted — the outbox carries an invocation's effects, never a backlog", () => {
    const clock = frozenClock();
    const outbox = createPluginUiOutbox(clock.now);
    for (let i = 0; i < PLUGIN_UI_OUTBOX_MAX + 3; i += 1) {
      clock.advance(COOLDOWN_MS); // clear the floor between pushes — the CAP is what is under test here.
      outbox.pushToast(PLUGIN, "info", `n${i}`);
    }
    const drained = outbox.drain(PLUGIN.id).toasts;
    expect(drained).toHaveLength(PLUGIN_UI_OUTBOX_MAX);
    // The OLDEST went, not the newest: the person should see what just happened.
    expect(drained.at(-1)?.message).toBe(`Oracle Deck: n${PLUGIN_UI_OUTBOX_MAX + 2}`);
    expect(drained.at(0)?.message).toBe("Oracle Deck: n3");
  });

  test("draining CLEARS — a queued item never arrives twice, and never on a later unrelated round-trip", () => {
    const clock = frozenClock();
    const outbox = createPluginUiOutbox(clock.now);
    outbox.pushToast(PLUGIN, "info", "once");
    outbox.requestDialog(PLUGIN.id, "reveal_dialog");
    expect(outbox.drain(PLUGIN.id)).toEqual({ toasts: [{ level: "info", message: "Oracle Deck: once" }], openDialog: "reveal_dialog" });
    expect(outbox.drain(PLUGIN.id)).toEqual({ toasts: [] });
  });

  test("a dialog ask is LAST-WRITE-WINS — two modals at once is not a state the shell has", () => {
    const clock = frozenClock();
    const outbox = createPluginUiOutbox(clock.now);
    outbox.requestDialog(PLUGIN.id, "first");
    outbox.requestDialog(PLUGIN.id, "second");
    expect(outbox.drain(PLUGIN.id).openDialog).toBe("second");
  });

  test("clearForPlugin drops a disabled plugin's pending chrome — nothing arrives after the lights go out", () => {
    const clock = frozenClock();
    const outbox = createPluginUiOutbox(clock.now);
    outbox.pushToast(PLUGIN, "info", "queued");
    outbox.requestDialog(PLUGIN.id, "reveal_dialog");
    outbox.clearForPlugin(PLUGIN.id);
    expect(outbox.drain(PLUGIN.id)).toEqual({ toasts: [] });
  });

  test("the dialog RESOLVE keeps only an id naming a `dialog`-anchored surface THIS instance registered", () => {
    const dialog: PluginSurfaceRegistration = { id: "reveal_dialog", anchor: "dialog", title: "Reveal", tier: "static" };
    const page: PluginSurfaceRegistration = { id: "deck_page", anchor: "page", title: "The Deck", tier: "static" };
    const instance = instanceWith([dialog, page]);

    expect(resolveUiOutcome({ toasts: [], openDialog: "reveal_dialog" }, instance).openDialog).toBe("reveal_dialog");
    // A PAGE smuggled into the modal shell is a different surface than the person consented to see there.
    expect(resolveUiOutcome({ toasts: [], openDialog: "deck_page" }, instance).openDialog).toBeUndefined();
    // A stale id costs the ask and nothing else (the §4.9 soft-refusal posture) — the toasts still land.
    const stale = resolveUiOutcome({ toasts: [{ level: "info", message: "Oracle Deck: hi" }], openDialog: "gone" }, instance);
    expect(stale.openDialog).toBeUndefined();
    expect(stale.toasts).toHaveLength(1);
  });
});
