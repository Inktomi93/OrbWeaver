import { DEFAULT_GUIDED_ACTIONS, DEFAULT_PROMPT_CONFIG, promptConfigSchema, TEMPLATE_CLUSTERS, TEMPLATE_DEFS, TEMPLATE_KINDS } from "@orb/contracts/preset";
import { PROSE_SLOTS } from "@orb/contracts/prose";
import { expect, test } from "@orb/testkit/node";
import { templateGroups, templateRowById, templateStoredText } from "#client/features/preset/lib/template-rows.ts";

test("every template retains its registry object and resolves the matching form address", () => {
  const rows = templateGroups().flatMap((group) => [...group.rows, ...group.clusters.flatMap((cluster) => cluster.rows)]);
  expect(rows.map((row) => row.def.id).sort()).toEqual(TEMPLATE_DEFS.map((def) => def.id).sort());
  for (const def of TEMPLATE_DEFS) {
    const row = templateRowById(def.id);
    expect(row?.def).toBe(def);
  }
});

test("the canonical template id selects its own guided, format or prose storage without a second address", () => {
  const config = promptConfigSchema.parse({
    ...DEFAULT_PROMPT_CONFIG,
    guidedActions: {
      ...DEFAULT_GUIDED_ACTIONS,
      response: { ...DEFAULT_GUIDED_ACTIONS.response, prompt: "Response slot" },
      swipe: { ...DEFAULT_GUIDED_ACTIONS.swipe, prompt: "Swipe slot" },
    },
    formatStrings: { continueNudge: "Continue slot" },
    prose: { "chat.injection.userNote": { text: "User note slot", baseVersion: PROSE_SLOTS["chat.injection.userNote"].version } },
  });
  expect(templateStoredText(config, "response")).toBe("Response slot");
  expect(templateStoredText(config, "swipe")).toBe("Swipe slot");
  expect(templateStoredText(config, "continueNudge")).toBe("Continue slot");
  expect(templateStoredText(config, "chat.injection.userNote")).toBe("User note slot");
});

test("template groups retain declared order and label each populated cluster", () => {
  const groups = templateGroups();
  const kinds = groups.map((group) => group.kind);
  expect(kinds).toEqual(TEMPLATE_KINDS.filter((kind) => kinds.includes(kind)));
  const extract = groups.find((group) => group.kind === "extract");
  expect(extract?.rows).toEqual([]);
  expect(extract?.clusters.length).toBeGreaterThan(0);
  expect(groups.filter((group) => group.kind !== "extract").flatMap((group) => group.clusters)).toEqual([]);
  for (const group of groups) {
    const clusters = group.clusters.map((cluster) => cluster.id);
    expect(clusters).toEqual(TEMPLATE_CLUSTERS.filter((id) => clusters.includes(id)));
    for (const cluster of group.clusters) {
      expect(cluster.label.trim().length).toBeGreaterThan(0);
      expect(cluster.rows.length).toBeGreaterThan(0);
    }
  }
});

test("template filtering matches visible labels or delivery copy and prunes empty groups and clusters", () => {
  const ids = (filter: string): readonly string[] =>
    templateGroups(filter)
      .flatMap((group) => [...group.rows, ...group.clusters.flatMap((cluster) => cluster.rows)])
      .map((row) => row.def.id);
  const weatherId = "rpg.extract.scene.weather";
  expect(ids("weather")).toContain(weatherId);
  expect(ids("the sky")).toContain(weatherId);
  expect(ids("  WEATHER  ")).toEqual(ids("weather"));
  expect(ids("   ")).toEqual(ids(""));
  expect(templateGroups("zzzz-no-such-template")).toEqual([]);
  for (const group of templateGroups("weather")) {
    expect(group.rows.length + group.clusters.flatMap((cluster) => cluster.rows).length).toBeGreaterThan(0);
    for (const cluster of group.clusters) {
      expect(cluster.rows.length).toBeGreaterThan(0);
    }
  }
});
