import { DEFAULT_GUIDED_ACTIONS, DEFAULT_PROMPT_CONFIG, promptConfigSchema, TEMPLATE_DEFS } from "@orb/contracts/preset";
import { PROSE_SLOTS } from "@orb/contracts/prose";
import { expect, test } from "@orb/testkit/node/fixtures.ts";
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
