// panel-resolve unit test — the shell's ONE mode-resolution algebra, driven directly against the exported
// function (it is pure: no store, no React, no viewport), so a NEW branch is proven by name rather than
// transitively through the hooks that call it. The hook-level and rendered-frame proofs live in
// tests/client/state/shell-store.ct.tsx and tests/client/features/app-shell/surfaces/app-shell.ct.tsx.

import type { OverlayPanelRequest } from "@orb/client/state";
import { resolvePanelMode } from "@orb/client/state";
import { describe } from "vitest";
import { expect, test } from "../../support/fixtures.ts";

describe("resolvePanelMode", () => {
  test("resolvePanelMode — the shared algebra both useListDocked and useShellLayout's resolvePanel call — precedence isMobile > narrow > wide", () => {
    const regime = (isMobile: boolean, isNarrow: boolean, openOverlayPanel: OverlayPanelRequest): Parameters<typeof resolvePanelMode>[2] => ({
      isFocus: false,
      isMobile,
      isNarrow,
      openOverlayPanel,
      // The default arm: NOT the list-as-screen section (that arm has its own block below).
      listIsScreen: false,
    });

    // Wide: passes the resolved mode through untouched.
    expect(resolvePanelMode("list", "docked", regime(false, false, null))).toBe("docked");
    expect(resolvePanelMode("list", "collapsed", regime(false, false, null))).toBe("collapsed");

    // Narrow + docked-default: CLOSED by default, OPEN only when named.
    expect(resolvePanelMode("list", "docked", regime(false, true, null))).toBe("collapsed");
    expect(resolvePanelMode("list", "docked", regime(false, true, "list"))).toBe("overlay");
    // Narrow + an explicit non-docked override: passes through unchanged (no auto-downgrade to touch)…
    expect(resolvePanelMode("list", "collapsed", regime(false, true, null))).toBe("collapsed");
    // …UNLESS the panel is the one named open right now. A stored `collapsed` is a WIDE dock preference, and
    // at this width docking is impossible, so it must not outvote a live open — that precedence bug is what
    // made the ≤64rem "Show detail panel" toggle read as a dead control (the `chats` CONTEXT pane defaults
    // `collapsed`, so its FIRST click resolved straight back to collapsed).
    expect(resolvePanelMode("list", "collapsed", regime(false, true, "list"))).toBe("overlay");

    // Mobile takes precedence over narrow — never "docked" regardless of the resolved default.
    expect(resolvePanelMode("list", "docked", regime(true, true, null))).toBe("collapsed");
    expect(resolvePanelMode("list", "docked", regime(true, true, "list"))).toBe("overlay");

    // FOCUS outranks all three (item 20): while the flag is on, EVERY panel resolves collapsed in EVERY
    // regime — even one the user just named open. That is what makes the flag, the label and the pixels one
    // truth, and it is a pure derivation: the stored mode fed in here is never rewritten.
    const focused = { isFocus: true, isMobile: false, isNarrow: false, openOverlayPanel: null, listIsScreen: false } as const;
    expect(resolvePanelMode("list", "docked", focused)).toBe("collapsed");
    expect(resolvePanelMode("context", "docked", focused)).toBe("collapsed");
    expect(resolvePanelMode("list", "docked", { ...focused, isNarrow: true, openOverlayPanel: "list" })).toBe("collapsed");
    expect(resolvePanelMode("list", "docked", { ...focused, isMobile: true, openOverlayPanel: "list" })).toBe("collapsed");
    // …including the mobile LIST-as-screen arm: focus is "nothing is showing", and a roster is something.
    expect(resolvePanelMode("list", "docked", { ...focused, isMobile: true, listIsScreen: true })).toBe("collapsed");
  });

  test("resolvePanelMode — the MOBILE ONE-SHELL arm: a list-bearing section with nothing selected resolves its LIST as the SCREEN, and only an explicit close drops it", () => {
    const onMobile = (openOverlayPanel: OverlayPanelRequest, listIsScreen: boolean): Parameters<typeof resolvePanelMode>[2] => ({
      isFocus: false,
      isMobile: true,
      isNarrow: true,
      openOverlayPanel,
      listIsScreen,
    });

    // Nothing selected ⇒ the roster IS the screen (`docked`, in flow) with NO request at all — that is what
    // makes it the DEFAULT rather than a sheet somebody has to open. It holds whatever the section's stored
    // desktop preference says, because on a phone that preference is unhonourable either way.
    expect(resolvePanelMode("list", "docked", onMobile(null, true))).toBe("docked");
    expect(resolvePanelMode("list", "collapsed", onMobile(null, true))).toBe("docked");
    // The user's explicit close wins over the default — the topbar toggle reaching the section's own
    // no-selection CONTENT (the corpus/analytics dashboards). Without this the toggle is a dead control.
    expect(resolvePanelMode("list", "docked", onMobile("none", true))).toBe("collapsed");
    // A selection ends the arm: CONTENT is the screen and the roster is off it (the back affordance returns).
    expect(resolvePanelMode("list", "docked", onMobile(null, false))).toBe("collapsed");
    // The CONTEXT panel is untouched by the rule — it is still a sheet, opened only when named…
    expect(resolvePanelMode("context", "docked", onMobile(null, true))).toBe("collapsed");
    expect(resolvePanelMode("context", "docked", onMobile("context", true))).toBe("overlay");
    // …and closing THAT sheet releases to `null`, which must leave the roster behind it standing.
    expect(resolvePanelMode("list", "docked", onMobile("context", true))).toBe("docked");
  });
});
