// CT: the two admin OPS SECTIONS (Settings → Admin → Model catalog / Card embeddings). They became
// first-class settings-section contributions in SET-SEAMS stage 3, so each now stamps its own anchor and
// owns its own verbs — this pins both, which the pane-surface era never covered.

import { expect, test } from "@playwright/experimental-ct-react";
import { routeTrpc } from "../../../../support/node/route-trpc.ts";
import { AdminOpsSectionsStory } from "../_ct-stories.tsx";

test("each ops section stamps its OWN admin anchor (the ids the nav + search jump to)", async ({ mount, page }) => {
  await routeTrpc(page, {});
  await mount(<AdminOpsSectionsStory />);

  await expect(page.locator("#config-anchor-admin-model-catalog")).toBeVisible();
  await expect(page.locator("#config-anchor-admin-card-embeddings")).toBeVisible();
});

// ONE refresher since the `@orb/inference` cut-over: the agent-sdk daemon list is warmed under each user's
// own `claude-sub` row, so `connection.refreshAgentSdkCatalog` is gone and OpenRouter is the only row with an
// admin-refreshed enriched catalog. The provider id is asserted, not just the call — a refresher that fired
// against the wrong row would satisfy a count-only pin.
test("the catalog refresher fires its admin-gated verb for the OpenRouter row", async ({ mount, page }) => {
  const trpc = await routeTrpc(page, { "connection.refreshCatalog": () => ({ ok: true }) });
  const component = await mount(<AdminOpsSectionsStory />);

  await component.getByRole("button", { name: "Refresh OpenRouter catalog" }).click();
  await expect.poll(() => trpc.count("connection.refreshCatalog"), { intervals: [20, 50, 100] }).toBe(1);
  expect(trpc.lastInput("connection.refreshCatalog")).toEqual({ providerId: "openrouter" });
});

test("the inline card embed is gated on a non-empty id and sends it verbatim", async ({ mount, page }) => {
  const trpc = await routeTrpc(page, { "admin.embedCharacterCard": () => ({ ok: true }) });
  const component = await mount(<AdminOpsSectionsStory />);

  const embed = component.getByRole("button", { name: "Embed card" });
  // No id typed → the affordance that would 400 is disabled, not offered.
  await expect(embed).toBeDisabled();

  await component.getByRole("textbox", { name: "Character id" }).fill("char_ct_1");
  await embed.click();
  await expect.poll(() => trpc.lastInput("admin.embedCharacterCard"), { intervals: [20, 50, 100] }).toEqual({ characterId: "char_ct_1" });
  await expect(component.getByText("Card embedded.")).toBeVisible();
});
