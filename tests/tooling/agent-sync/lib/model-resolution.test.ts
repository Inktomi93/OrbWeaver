import { resolveRoleModels } from "../../../../tooling/src/agent-sync/lib/model-resolution.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

const roleEfforts = { executor: "medium", forge: "medium", "mech-executor": "high" };

test("selects the newest visible stable version numerically within each family", () => {
  const catalog = {
    fetchedAt: "2026-09-30T12:00:00Z",
    models: [
      { slug: "gpt-6.9-sol", visibility: "list", supportedReasoningLevels: [{ effort: "medium" }] },
      { slug: "gpt-6.10-sol", visibility: "list", supportedReasoningLevels: [{ effort: "medium" }] },
      { slug: "gpt-7-sol", visibility: "list", supportedReasoningLevels: [{ effort: "medium" }] },
      { slug: "gpt-8-sol-preview", visibility: "list", supportedReasoningLevels: [{ effort: "medium" }] },
      { slug: "gpt-9-sol", visibility: "hidden", supportedReasoningLevels: [{ effort: "medium" }] },
      { slug: "gpt-6-astra", visibility: "list", supportedReasoningLevels: [{ effort: "medium" }] },
      { slug: "gpt-6-luna", visibility: "list", supportedReasoningLevels: [{ effort: "high" }] },
    ],
  };
  expect(resolveRoleModels(catalog, roleEfforts)).toEqual({ executor: "gpt-7-sol", forge: "gpt-6-astra", "mech-executor": "gpt-6-luna" });
  expect(resolveRoleModels({ ...catalog, models: catalog.models.filter((model) => model.slug !== "gpt-7-sol") }, roleEfforts)["executor"]).toBe("gpt-6.10-sol");
});

test("refuses missing family and unsupported effort on the newest version", () => {
  const catalog = {
    fetchedAt: "2026-09-30T12:00:00Z",
    models: [
      { slug: "gpt-6-sol", visibility: "list", supportedReasoningLevels: [{ effort: "medium" }] },
      { slug: "gpt-7-sol", visibility: "list", supportedReasoningLevels: [{ effort: "low" }] },
      { slug: "gpt-6-astra", visibility: "list", supportedReasoningLevels: [{ effort: "medium" }] },
    ],
  };
  expect(() => resolveRoleModels(catalog, roleEfforts)).toThrow(/gpt-7-sol.*medium/u);
  expect(() => resolveRoleModels({ ...catalog, models: catalog.models.filter((model) => model.slug === "gpt-6-sol") }, roleEfforts)).toThrow(/astra/u);
});
