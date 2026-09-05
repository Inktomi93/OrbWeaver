// resolveContextTabs/defineContextTabs (client-architecture-lockdown.md §6b, M3.3) — the pure resolver is
// the M3 correctness core: when-filtering, own-then-contributor declared order, the duplicate-id THROW at
// mint construction, null-state passthrough, and actions binding.

import { createAppQueryClient, createTrpcClient, createTrpcProxy } from "@orb/client/data";
import { automationActivityTab } from "@orb/client/features/automation";
import { chatContextTabs } from "@orb/client/features/chat";
import { makeRpgContextTabs } from "@orb/client/features/rpg";
import type { ChatContextState, ContextRegionDef, ContextTabDef, ContextTabsSpec } from "@orb/client/lib";
import { createContributorRegistry, defineContextRegion, defineContextTabs, resolveContextTabs } from "@orb/client/lib";
import { describe } from "vitest";
import { expect, test } from "../../support/fixtures.ts";
import { CT_META_RAIL_CROWNED_IDS } from "../features/app-shell/_crowned-tabs.ts";

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

  test("carries the host-only `crown` flag through, defaulted to false (HUD-1 §4)", () => {
    // A PRESENTATION flag declared by each tab's owner, exactly like `strip`: it exists so a claimant can
    // paint host-only cells without carrying a list of foreign tab ids. Absent must mean false, not
    // undefined — the renderer branches on it and an untouched section never spells it.
    const spec: ContextTabsSpec<State> = {
      useContextState: () => ({ n: 1 }),
      tabs: [tab("a"), { id: "b", label: "b", crown: true, body: (s) => s.n }],
    };
    expect(resolveContextTabs(spec, { n: 1 }).tabs.map((t) => ({ id: t.id, crown: t.crown }))).toEqual([
      { id: "a", crown: false },
      { id: "b", crown: true },
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

// ── The HEAD-BAND REGION CLAIM (HUD-1 §3.2/§10, re-shaped by the context bracket #860) ───────────────
// The claim rides the SAME resolve as the tabs: a claiming region's band is FOLDED into the resolved
// `header` (it replaces the section's own), and the tab set is untouched — a claim can never suppress
// resolution, fork the selection, or reach a rail.

function region(id: string, claims: (s: State) => boolean): ContextRegionDef<State> {
  return defineContextRegion<State>({ id, claims, band: () => id });
}

describe("resolveContextTabs — regions", () => {
  test("no claimant: the section's own `header` stands and the tab set is unaffected (the six-section floor)", () => {
    const spec: ContextTabsSpec<State> = { useContextState: () => ({ n: 1 }), tabs: [tab("a"), tab("b")], actions: (s) => s.n, header: () => "own" };
    const withoutRegistry = resolveContextTabs(spec, { n: 1 });
    const withIdleRegion = resolveContextTabs({ ...spec, regions: createContributorRegistry("r", [region("idle", () => false)]) }, { n: 1 });

    expect(withIdleRegion.header).toBe("own");
    expect(withIdleRegion.tabs.map((t) => t.id)).toEqual(withoutRegistry.tabs.map((t) => t.id));
    expect(withIdleRegion.actions).toBe(withoutRegistry.actions);
  });

  test("a claiming region's band REPLACES the section's header AND the resolved tab set is still FULL", () => {
    const spec: ContextTabsSpec<State> = {
      useContextState: () => ({ n: 2 }),
      tabs: [tab("a"), tab("b")],
      header: () => "own",
      regions: createContributorRegistry("r", [region("hud", (s) => s.n >= 2)]),
    };
    const resolved = resolveContextTabs(spec, { n: 2 });

    expect(resolved.header).toBe("hud");
    // The bracket renders these — the resolve must hand it everything, never a subset.
    expect(resolved.tabs.map((t) => t.id)).toEqual(["a", "b"]);
  });

  test("the claim is re-evaluated against state — the same registry does not claim a non-matching state", () => {
    const spec: ContextTabsSpec<State> = {
      useContextState: () => ({ n: 1 }),
      tabs: [tab("a")],
      header: () => "own",
      regions: createContributorRegistry("r", [region("hud", (s) => s.n >= 2)]),
    };
    expect(resolveContextTabs(spec, { n: 1 }).header).toBe("own");
    expect(resolveContextTabs(spec, { n: 2 }).header).toBe("hud");
  });

  test("two claimants at one state: the FIRST in declared order wins, deterministically", () => {
    const spec: ContextTabsSpec<State> = {
      useContextState: () => ({ n: 1 }),
      tabs: [tab("a")],
      regions: createContributorRegistry("r", [region("first", () => true), region("second", () => true)]),
    };
    expect(resolveContextTabs(spec, { n: 1 }).header).toBe("first");
  });

  test("`railLabel` passes through the resolve untouched, and is absent when the spec names none", () => {
    const named: ContextTabsSpec<State> = { useContextState: () => ({ n: 1 }), tabs: [tab("a")], railLabel: "Chat" };
    expect(resolveContextTabs(named, { n: 1 }).railLabel).toBe("Chat");
    const unnamed: ContextTabsSpec<State> = { useContextState: () => ({ n: 1 }), tabs: [tab("a")] };
    expect("railLabel" in resolveContextTabs(unnamed, { n: 1 })).toBe(false);
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

// ── THE CROWN FLAG'S POPULATION (#1629) — the app-shell meta-rail fixture, checked against the LIVE defs ──
//
// The block above pins that `resolveContextTabs` CARRIES `crown` through, defaulted to false. This one pins
// WHO SETS IT: the app-shell story that renders the meta rail declares a crowned set (`_crowned-tabs.ts`),
// and nothing checked it against the definitions, so the next def to gain or lose a crown would re-green the
// fixture silently. It lives HERE — beside `crown`'s own declaration in `lib/registry-contracts.ts` — because
// the `test-layout` mirror is `packages/<pkg>/src/<path>` with a MATCHING extension: a `.test.ts` can only
// mirror a `.ts` source, and every candidate closer to the rail (`context-rail.tsx`, `_ct-stories.tsx`,
// `compose/authed-app.tsx`) is `.tsx`. `crown`'s declaring file is the honest home anyway: this is the
// population of that one field.
//
// THE DEFECT CLASS. #875 F15 re-ordered the meta rail by partitioning on `crown`, its CT went green, and the
// change was a NO-OP: three live cells carry `crown: true`, so the partition could not move anything — the
// story fixture crowned `Game` alone and agreed with the fix rather than with the product. #898 corrected the
// fixture and wrote the durable rule at `_ct-stories.tsx`'s `CTX_META_RAIL_TABS` header ("a fixture's AXIS
// DATA … must be derived from the live definitions or checked against them"); this is the enforcer it lacked.
//
// #900 refused a fixture-DERIVED crown set on the premise that two of the three crowned defs are minted
// inside factories needing runtime deps. THAT RULING SURVIVES — ITS INPUT CHANGED: the deps are only CLOSED
// OVER (`makeIsGameChat` never touches them at construction), so the factories construct in a node process
// with the real singletons, and the third owner (`automationActivityTab`) is a ready module-level def.
//
// WHY IT READS THE DEFS AND NOT THE COMPOSED SECTION: `defineContextTabs` closes its tabs inside a
// `useResolved` hook, so the composed `chats` section can only surrender its crowned set to a RENDER — and
// the CT harness hands chat an EMPTY contributor registry (`ct-data-providers.tsx`), so a browser read would
// see chat's own tabs only and miss two of the three crowns. The three OWNING modules are the authority.
//
// COST: these imports pull the chat/rpg/automation feature graphs into this file (~5s of transform on a cold
// unit lane). That is the price of reading the REAL definitions instead of a second copy of them.

/** Every context tab the three OWNING modules define, in the door's own assembly order
 *  (`compose/authed-app.tsx`: chat's own tabs, then the rpg factory's, then automation's ready def). The
 *  deps are the real singleton shapes the door injects; the factories only close over them. */
function liveContextTabs(): readonly ContextTabDef<ChatContextState>[] {
  const queryClient = createAppQueryClient();
  const trpc = createTrpcProxy(createTrpcClient(), queryClient);
  return [
    // The section seam the chat tabs forward — empty here: no tab's `crown` depends on it, and this pin
    // never calls a `body`.
    ...chatContextTabs(createContributorRegistry("chat-settings-sections", [])),
    ...makeRpgContextTabs({ trpc, queryClient }),
    automationActivityTab,
  ];
}

describe("the meta rail's crowned set", () => {
  test("the live definitions still crown exactly the three tabs the story fixture declares", () => {
    const live = liveContextTabs();
    // A POSITIVE CONTROL on the read itself: an empty or crownless live set would satisfy an equality
    // against an empty fixture, which is the "empty population vs broken probe" failure this pin must not
    // have. The read is only a verdict if it saw the definitions at all.
    expect(live.length).toBeGreaterThan(5);
    const crowned = live.filter((def) => def.crown === true).map((def) => def.id);
    expect(crowned.length).toBeGreaterThan(0);
    // Sorted on both sides: the fixture declares a SET, and the rail's ORDER is the door's assembly order,
    // which is a separate axis with its own pins.
    expect([...crowned].sort()).toEqual([...CT_META_RAIL_CROWNED_IDS].sort());
  });

  test("each crowned id belongs to a tab that still exists and is still crowned by its own owner", () => {
    const byId = new Map(liveContextTabs().map((def) => [def.id, def]));
    expect(CT_META_RAIL_CROWNED_IDS.map((id) => [id, byId.get(id)?.crown ?? "no such tab"])).toEqual(CT_META_RAIL_CROWNED_IDS.map((id) => [id, true]));
  });
});
