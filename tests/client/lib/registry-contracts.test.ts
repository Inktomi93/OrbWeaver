// resolveContextTabs/defineContextTabs (client-architecture-lockdown.md §6b, M3.3) — the pure resolver is
// the M3 correctness core: when-filtering, own-then-contributor declared order, the duplicate-id THROW at
// mint construction, null-state passthrough, and actions binding.

import type { ContextTabDef, ContextTabsSpec } from "@orb/client/lib";
import { createContributorRegistry, defineContextTabs, resolveContextTabs } from "@orb/client/lib";
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

  test("binds actions against the same state", () => {
    const spec: ContextTabsSpec<State> = {
      useContextState: () => ({ n: 5 }),
      tabs: [tab("a")],
      actions: (s) => s.n,
    };
    const resolved = resolveContextTabs(spec, { n: 5 });
    expect(resolved.actions).toBe(5);
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
