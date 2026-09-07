// CT: the Analytics CONTEXT "Personas" tab — the same two findings as the Models tab beside it
// (side-eye ANALYTICS 2026-08-19, P2c + P1e), which is why they are fixed as one class rather than one row.
import { expect, test } from "@playwright/experimental-ct-react";
import { routeTrpc } from "../../../../support/node/route-trpc.ts";
import { AnalyticsPersonasTabStory } from "../_ct-stories.tsx";

const PERSONAS = [
  { personaId: "persona_ct_one", name: "Wanderer", chatCount: 12, messageCount: 3400, tokensOut: 120_000, lastUsedAt: null },
  { personaId: "persona_ct_two", name: "Archivist", chatCount: 3, messageCount: 210, tokensOut: 8000, lastUsedAt: null },
];

test("the persona breakdown announces as a list of real list items (P2c)", async ({ mount, page }) => {
  await routeTrpc(page, { "stats.personaUsage": () => PERSONAS });
  const component = await mount(<AnalyticsPersonasTabStory />);

  const list = component.getByRole("list", { name: "Personas" });
  await expect(list.getByRole("listitem")).toHaveCount(PERSONAS.length);
  await expect(list.getByRole("listitem").last()).toHaveAttribute("aria-posinset", String(PERSONAS.length));
});

test("the messages-by-persona chart carries its series as text (P1e)", async ({ mount, page }) => {
  await routeTrpc(page, { "stats.personaUsage": () => PERSONAS });
  const component = await mount(<AnalyticsPersonasTabStory />);

  const table = component.getByRole("table", { name: "Messages by persona" });
  await expect(table.getByRole("rowheader").first()).toHaveText("Wanderer");
  await expect(table.getByRole("cell").first()).toHaveText("3.4k");
});
