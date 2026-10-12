// The drill-selection factory (create-drill-selection-store): the shared shape behind the five per-section
// selection stores (corpus/analytics/character/preset/world-info). The reactive read hooks need a React
// render (the create-gated-store.test.ts / message-selection-store.test.ts posture — state transitions are
// exercised end-to-end by the five *-selection-store.ct.tsx), so this node lane pins the FACTORY contract:
// the primary-only vs secondary-drill surface, callable actions, and the createGatedStore duplicate-name
// guard propagating through the mint (two stores can never share a devtools connection label).

import { createDrillSelectionStore } from "@orb/client/state";
import type { CharacterId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { expect, test } from "@orb/testkit/node/fixtures.ts";
import { afterEach, describe, vi } from "vitest";

const DUPLICATE_NAME_RE = /duplicate store name/u;
const PROBE = castId<CharacterId>("char_drillfactory_probe");

describe("createDrillSelectionStore", () => {
  test("a primary-only store exposes the primary drill surface as callable actions", () => {
    const drill = createDrillSelectionStore<CharacterId>("t-drill-primary");
    for (const fn of [drill.usePrimaryId, drill.select, drill.clear, drill.selectFromList]) {
      expect(typeof fn).toBe("function");
    }
    // The actions run without throwing (select drills, clear/selectFromList reset — selectFromList also
    // pokes the shell overlay). The rendered read-back lives in the per-section CTs.
    expect(() => {
      drill.select(PROBE);
      drill.selectFromList(PROBE);
      drill.clear();
    }).not.toThrow();
  });

  test("a secondary-drill store adds the sub-drill + dismiss surface", () => {
    const drill = createDrillSelectionStore<CharacterId, string>("t-drill-secondary", { secondary: true });
    for (const fn of [drill.useSecondaryId, drill.selectSecondary, drill.clearSecondary, drill.dismissSecondary]) {
      expect(typeof fn).toBe("function");
    }
    expect(() => {
      drill.select(PROBE);
      drill.selectSecondary("facet_probe");
      drill.clearSecondary();
      drill.dismissSecondary();
    }).not.toThrow();
  });

  test("a duplicate store name throws at creation (the createGatedStore label guard propagates)", () => {
    createDrillSelectionStore<CharacterId>("t-drill-dupe");
    expect(() => createDrillSelectionStore<CharacterId>("t-drill-dupe")).toThrow(DUPLICATE_NAME_RE);
  });
});

// ── ONE DOOR BACK (side-eye P2) ──────────────────────────────────────────────────────────────────────
// The measured split: `corpus-dossier-surface`/`analytics-character-surface` called `clear*Selection`
// (selection only) while the shell's mobile back door called clear AND released the slide-over request —
// so from a dashboard-reached drill, in-content Back and topbar Back landed in two different states. The
// factory now owns ONE clear and the seam re-exports THAT function, which is the property pinned here: the
// two doors cannot drift, because there is only one.

describe("createDrillSelectionStore — one door back", () => {
  test("the section-registry seam's `clear` IS the store's `clear` (identity, not a copy that must agree)", () => {
    const drill = createDrillSelectionStore<CharacterId>("t-drill-one-door");
    expect(drill.selection.clear).toBe(drill.clear);
  });

  test("`clear` drops the selection through the seam the shell reads", () => {
    const drill = createDrillSelectionStore<CharacterId>("t-drill-release");
    drill.select(PROBE);
    expect(drill.selection.hasSelection()).toBe(true);
    drill.clear();
    expect(drill.selection.hasSelection()).toBe(false);
    // The OTHER half of one-door — that `clear` also RELEASES the slide-over request — needs a rendered
    // read of the shell store (its only read API is a hook), so it is pinned in
    // tests/legacy/client/state/section-list-projection.ct.tsx.
  });
});

// ── EVERY SECTION'S ITEM SWITCH MOVES THE SAME WAY ─────────────────────────────────────────────────────
// Chats, characters and corpus swapped content through the shell's content-swap door; the factory's own
// writes were plain `setState`, so Refinery, Presets, Databank, Plugin pages and the rest hard-cut. The
// factory is the one door for all of them, so its content writes ride the same view transition.

describe("createDrillSelectionStore — content writes ride the shell's content swap", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  test("select, selectFromList and clear each raise one view transition and write inside it", async () => {
    const callbacks: Array<() => void | Promise<void>> = [];
    const start = vi.fn((callback: () => void | Promise<void>) => {
      callbacks.push(callback);
      return { ready: Promise.resolve(), finished: Promise.resolve(), updateCallbackDone: Promise.resolve() };
    });
    vi.stubGlobal("matchMedia", () => ({ matches: false }));
    vi.stubGlobal("document", { querySelector: () => null, startViewTransition: start });
    const drill = createDrillSelectionStore<CharacterId>("t-drill-swap");

    drill.select(PROBE);
    expect(start).toHaveBeenCalledTimes(1);
    expect(drill.getPrimaryId()).toBeNull();
    await callbacks[0]?.();
    expect(drill.getPrimaryId()).toBe(PROBE);

    await Promise.resolve();
    drill.clear();
    expect(start).toHaveBeenCalledTimes(2);
    expect(drill.getPrimaryId()).toBe(PROBE);
    await callbacks[1]?.();
    expect(drill.getPrimaryId()).toBeNull();

    await Promise.resolve();
    drill.selectFromList(PROBE);
    expect(start).toHaveBeenCalledTimes(3);
    await callbacks[2]?.();
    expect(drill.getPrimaryId()).toBe(PROBE);
  });
});
