// resolveContextTabs/defineContextTabs (client-architecture-lockdown.md §6b, M3.3) — the pure resolver is
// the M3 correctness core: when-filtering, own-then-contributor declared order, the duplicate-id THROW at
// mint construction, null-state passthrough, and actions binding.

import type { ContextRegionDef, ContextTabDef, ContextTabsSpec } from "@orb/client/lib";
import { createContributorRegistry, defineContextRegion, defineContextTabs, resolveContextTabs } from "@orb/client/lib";
import { describe } from "vitest";
import { expect, test } from "../../support/fixtures";

interface State {
  readonly n: number;
}

const DUPLICATE_TAB_RE = /duplicate tab id "a"/u;

function tab(id: string, when?: (s: State) => boolean): ContextTabDef<State> {
  return when === undefined ? { id, label: id, body: (s) => s.n } : { id, label: id, when, body: (s) => s.n };
}

describe("resolveContextTabs", () => {
  test("filters out a tab whose when() returns false", () => {
    const spec: ContextTabsSpec<State> = {
      useContextState: () => ({ n: 1 }),
      tabs: [tab("a"), tab("b", (s) => s.n >= 2)],
    };
    const resolved = resolveContextTabs(spec, { n: 1 });
    expect(resolved.tabs.map((t) => t.id)).toEqual(["a"]);
  });

  test("declares own tabs before contributors, in each list's own order", () => {
    const contributors = createContributorRegistry<ContextTabDef<State>>("t", [tab("z"), tab("y")]);
    const spec: ContextTabsSpec<State> = {
      useContextState: () => ({ n: 1 }),
      tabs: [tab("b"), tab("a")],
      contributors,
    };
    const resolved = resolveContextTabs(spec, { n: 1 });
    expect(resolved.tabs.map((t) => t.id)).toEqual(["b", "a", "z", "y"]);
  });

  test("resolves defaultTab against state (false when absent) — the §4.1 preferred-landing flag", () => {
    const spec: ContextTabsSpec<State> = {
      useContextState: () => ({ n: 2 }),
      tabs: [tab("a"), { id: "b", label: "b", body: (s) => s.n, defaultTab: (s) => s.n >= 2 }],
    };
    const resolved = resolveContextTabs(spec, { n: 2 });
    expect(resolved.tabs.map((t) => ({ id: t.id, defaultTab: t.defaultTab }))).toEqual([
      { id: "a", defaultTab: false },
      { id: "b", defaultTab: true },
    ]);
  });

  test("binds actions against the same state", () => {
    const spec: ContextTabsSpec<State> = {
      useContextState: () => ({ n: 5 }),
      tabs: [tab("a")],
      actions: (s) => s.n,
    };
    const resolved = resolveContextTabs(spec, { n: 5 });
    expect(resolved.actions).toBe(5);
  });

  test("binds the header band identity against the same state (N4), undefined when absent", () => {
    const withHeader: ContextTabsSpec<State> = {
      useContextState: () => ({ n: 7 }),
      tabs: [tab("a")],
      header: (s) => s.n,
    };
    expect(resolveContextTabs(withHeader, { n: 7 }).header).toBe(7);
    const noHeader: ContextTabsSpec<State> = { useContextState: () => ({ n: 1 }), tabs: [tab("a")] };
    expect(resolveContextTabs(noHeader, { n: 1 }).header).toBeUndefined();
  });
});

// ── The whole-pane REGION CLAIM (HUD-1 §3.2/§10) ────────────────────────────────────────────────────
// The claim rides the SAME resolve as the tabs: a claimant is handed everything the shell would have
// rendered itself, so a region can never suppress resolution or fork the selection.

function region(id: string, claims: (s: State) => boolean): ContextRegionDef<State> {
  return defineContextRegion<State>({ id, claims, render: () => id });
}

describe("resolveContextTabs — regions", () => {
  test("no claimant: `region` is undefined and the tab set is unaffected (the six-section floor)", () => {
    const spec: ContextTabsSpec<State> = { useContextState: () => ({ n: 1 }), tabs: [tab("a"), tab("b")], actions: (s) => s.n };
    const withoutRegistry = resolveContextTabs(spec, { n: 1 });
    const withIdleRegion = resolveContextTabs({ ...spec, regions: createContributorRegistry("r", [region("idle", () => false)]) }, { n: 1 });

    expect(withIdleRegion.region).toBeUndefined();
    expect(withIdleRegion.tabs.map((t) => t.id)).toEqual(withoutRegistry.tabs.map((t) => t.id));
    expect(withIdleRegion.actions).toBe(withoutRegistry.actions);
  });

  test("a claiming region carries `region` AND still the FULL resolved tab set", () => {
    const spec: ContextTabsSpec<State> = {
      useContextState: () => ({ n: 2 }),
      tabs: [tab("a"), tab("b")],
      regions: createContributorRegistry("r", [region("hud", (s) => s.n >= 2)]),
    };
    const resolved = resolveContextTabs(spec, { n: 2 });

    expect(resolved.region).toBeDefined();
    // The claimant renders these itself — the resolve must hand it everything, never a subset.
    expect(resolved.tabs.map((t) => t.id)).toEqual(["a", "b"]);
  });

  test("the claim is re-evaluated against state — the same registry does not claim a non-matching state", () => {
    const spec: ContextTabsSpec<State> = {
      useContextState: () => ({ n: 1 }),
      tabs: [tab("a")],
      regions: createContributorRegistry("r", [region("hud", (s) => s.n >= 2)]),
    };
    expect(resolveContextTabs(spec, { n: 1 }).region).toBeUndefined();
    expect(resolveContextTabs(spec, { n: 2 }).region).toBeDefined();
  });

  test("two claimants at one state: the FIRST in declared order wins, deterministically", () => {
    const spec: ContextTabsSpec<State> = {
      useContextState: () => ({ n: 1 }),
      tabs: [tab("a")],
      regions: createContributorRegistry("r", [region("first", () => true), region("second", () => true)]),
    };
    expect(resolveContextTabs(spec, { n: 1 }).region?.({ tabs: [], activeTab: null, selectTab: () => undefined })).toBe("first");
  });

  test("the duplicate-tab-id throw is unchanged with a claiming region present", () => {
    const contributors = createContributorRegistry<ContextTabDef<State>>("t", [tab("a")]);
    expect(() =>
      defineContextTabs<State>({
        useContextState: () => ({ n: 1 }),
        tabs: [tab("a")],
        contributors,
        regions: createContributorRegistry("r", [region("hud", () => true)]),
      }),
    ).toThrow(DUPLICATE_TAB_RE);
  });
});

describe("defineContextTabs", () => {
  test("throws at construction on a duplicate tab id across own tabs and contributors", () => {
    const contributors = createContributorRegistry<ContextTabDef<State>>("t", [tab("a")]);
    expect(() =>
      defineContextTabs<State>({
        useContextState: () => ({ n: 1 }),
        tabs: [tab("a")],
        contributors,
      }),
    ).toThrow(DUPLICATE_TAB_RE);
  });

  test("useResolved returns null when the projection hook reports no selection", () => {
    const definition = defineContextTabs<State>({ useContextState: () => null, tabs: [tab("a")] });
    if (definition.kind !== "tabs") {
      throw new Error("expected a tabs ContextDefinition");
    }
    expect(definition.useResolved()).toBeNull();
  });

  test("useResolved resolves the live tab strip when a state is present", () => {
    const definition = defineContextTabs<State>({
      useContextState: () => ({ n: 1 }),
      tabs: [tab("a"), tab("b", (s) => s.n >= 2)],
    });
    if (definition.kind !== "tabs") {
      throw new Error("expected a tabs ContextDefinition");
    }
    expect(definition.useResolved()?.tabs.map((t) => t.id)).toEqual(["a"]);
  });
});
