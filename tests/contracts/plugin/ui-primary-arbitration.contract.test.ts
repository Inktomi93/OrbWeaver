// Contract tests for @orb/contracts/plugin/ui — the per-anchor primary button arbitration.

import type { PluginSurfaceSpec } from "@orb/contracts/plugin";
import {
  PLUGIN_ANCHOR_PRIMARY_ALLOWED,
  PLUGIN_BUTTON_VARIANTS,
  PLUGIN_SURFACE_ANCHORS,
  pluginSurfaceSpecSchema,
  resolvePluginPrimaryButton,
} from "@orb/contracts/plugin";
import { expect, test } from "@orb/testkit/node/fixtures.ts";

// ── #818: the per-anchor PRIMARY arbitration (the ruling that replaced the flat clamp) ───────────────────────
// The old law here was "a button cannot be `primary`, full stop", enforced by the zod enum. The owner ruled
// 2026-08-30 that the S1 one-primary law SURVIVES with a changed INPUT: the chat band's attention budget is
// still the host's, but a `page`/`dialog` surface owns its own. So the enum admits it, PARSE stays anchor-blind
// (a spec is registered once and mounted anywhere), and the arbitration is the renderer's.

test("#818: `primary` is a spellable button weight — the enum is the three house weights, nothing more", () => {
  expect(PLUGIN_BUTTON_VARIANTS).toEqual(["neutral", "outline", "primary"]);
  for (const variant of PLUGIN_BUTTON_VARIANTS) {
    expect(pluginSurfaceSpecSchema.safeParse({ kind: "button", actionId: "go", label: "Go", variant }).success).toBe(true);
  }
  // The wall is still a wall: an off-tuple weight is a registration refusal, not a runtime miss.
  expect(pluginSurfaceSpecSchema.safeParse({ kind: "button", actionId: "go", label: "Go", variant: "destructive" }).success).toBe(false);
  // A BADGE still cannot be primary — the ruling moved the CTA line, not the decoration one.
  expect(pluginSurfaceSpecSchema.safeParse({ kind: "badge", label: "New", intent: "primary" }).success).toBe(false);
});

test("#818: PARSE is anchor-blind — TWO primaries in one spec register fine; the anchor rule is a RENDER rule", () => {
  const two: PluginSurfaceSpec = {
    kind: "stack",
    children: [
      { kind: "button", actionId: "summon", label: "Summon", variant: "primary" },
      { kind: "button", actionId: "back", label: "Back", variant: "primary" },
    ],
  };
  // Deliberate: refusing here would make a spec's admissibility depend on an anchor it is mounted at LATER,
  // and would turn a hierarchy mistake into a dead surface instead of a demoted button.
  expect(pluginSurfaceSpecSchema.safeParse(two).success).toBe(true);
});

test("#818: PLUGIN_ANCHOR_PRIMARY_ALLOWED is TOTAL, and only `page`/`dialog` own their attention budget", () => {
  for (const anchor of PLUGIN_SURFACE_ANCHORS) {
    expect(typeof PLUGIN_ANCHOR_PRIMARY_ALLOWED[anchor]).toBe("boolean");
  }
  expect(PLUGIN_ANCHOR_PRIMARY_ALLOWED.page).toBe(true);
  expect(PLUGIN_ANCHOR_PRIMARY_ALLOWED.dialog).toBe(true);
  // Every guest-inside-host-chrome anchor keeps the clamp — the chat band above all (the S1 law's own home).
  expect(PLUGIN_ANCHOR_PRIMARY_ALLOWED["chat-flank"]).toBe(false);
  expect(PLUGIN_ANCHOR_PRIMARY_ALLOWED["chat-settings-section"]).toBe(false);
  expect(PLUGIN_ANCHOR_PRIMARY_ALLOWED.settings).toBe(false);
  expect(PLUGIN_ANCHOR_PRIMARY_ALLOWED["tool-card"]).toBe(false);
  expect(PLUGIN_ANCHOR_PRIMARY_ALLOWED["message-footer"]).toBe(false);
});

test("#818: resolvePluginPrimaryButton grants the FIRST claimant in document order and refuses the rest", () => {
  const first = { kind: "button", actionId: "summon", label: "Summon", variant: "primary" } as const;
  const second = { kind: "button", actionId: "again", label: "Again", variant: "primary" } as const;
  const spec: PluginSurfaceSpec = {
    kind: "stack",
    children: [{ kind: "text", value: "hi" }, first, { kind: "button", actionId: "back", label: "Back" }, second],
  };
  const arbitration = resolvePluginPrimaryButton(spec, "page");
  // IDENTITY, not equality: the renderer compares by reference as it walks, so the grant must be the very node.
  expect(arbitration.granted).toBe(first);
  expect(arbitration.refused).toEqual([second]);
});

test("#818: a REFUSING anchor grants nobody — every claimant is refused, so the chat band keeps the S1 clamp", () => {
  const claim = { kind: "button", actionId: "summon", label: "Summon", variant: "primary" } as const;
  const spec: PluginSurfaceSpec = { kind: "stack", children: [claim] };
  // The chat band, named outright — the anchor the S1 law was minted for, and the one the ruling did NOT move.
  const band = resolvePluginPrimaryButton(spec, "chat-flank");
  expect(band.granted).toBeNull();
  // Refused, never DROPPED: the renderer owes the plugin's author a console line naming what it demoted.
  expect(band.refused).toEqual([claim]);
  // …and the whole anchor set agrees with the record, so a new anchor cannot pick up a grant by accident.
  const outcomes = PLUGIN_SURFACE_ANCHORS.map((anchor) => {
    const arbitration = resolvePluginPrimaryButton(spec, anchor);
    return { anchor, granted: arbitration.granted === claim, refusedCount: arbitration.refused.length };
  });
  expect(outcomes).toEqual(
    PLUGIN_SURFACE_ANCHORS.map((anchor) => ({
      anchor,
      granted: PLUGIN_ANCHOR_PRIMARY_ALLOWED[anchor],
      refusedCount: PLUGIN_ANCHOR_PRIMARY_ALLOWED[anchor] ? 0 : 1,
    })),
  );
});

test("#818: the walk reaches the NON-`children` containers — a masterDetail stage body holds the browse CTA", () => {
  const buried = { kind: "button", actionId: "summon", label: "Summon to your library", variant: "primary" } as const;
  const spec: PluginSurfaceSpec = {
    kind: "masterDetail",
    active: "detail",
    stages: [
      { id: "browse", kind: "browse", body: { kind: "text", value: "results" } },
      { id: "detail", kind: "detail", body: { kind: "stack", children: [buried] } },
    ],
  };
  // The card-atlas shape verbatim (stickler F3): the CTA lives inside a detail stage, under a field that is
  // NOT called `children`. A walk that knew only the three container kinds would hand the primary to nobody.
  expect(resolvePluginPrimaryButton(spec, "page").granted).toBe(buried);
});

test("#818: a spec with NO primary claimant arbitrates to nothing at every anchor", () => {
  const spec: PluginSurfaceSpec = { kind: "button", actionId: "go", label: "Go", variant: "outline" };
  for (const anchor of PLUGIN_SURFACE_ANCHORS) {
    expect(resolvePluginPrimaryButton(spec, anchor)).toEqual({ granted: null, refused: [] });
  }
});
