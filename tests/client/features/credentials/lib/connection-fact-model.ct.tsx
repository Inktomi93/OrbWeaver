// Cache discounts are owner-configured rates, not inferred invoices. Saving a real zero must preserve
// the required input/output rates, and resetting it must restore absence rather than erase all pricing.
import { expect, test } from "@playwright/experimental-ct-react";
import { expectDisclosureReady } from "../../../../support/browser/disclosure-ready.ts";
import { makeGenerationCapability } from "../../../../support/factories/resolved-connection.ts";
import { routeTrpc } from "../../../../support/node/route-trpc.ts";
import { ALL_AVAILABLE, connectionRow } from "../_connection-fixtures.ts";
import { ConnectionEditorNarrowStory } from "../_ct-stories.tsx";

test("an optional cache price saves known zero and resets without dropping base rates", async ({ mount, page }) => {
  const pricing = { inputPerMTok: 1, outputPerMTok: 2 };
  let row = connectionRow({ id: "user_connection_cteditor0001", declared: { features: { pricing } } });
  const capability = { kind: "generation" as const, generation: makeGenerationCapability() };
  const recorder = await routeTrpc(page, {
    "sessions.me": () => ({ userId: row.ownerId, handle: "owner", globalRole: "owner" }),
    "connection.get": () => row,
    "connection.providersAvailable": () => ALL_AVAILABLE,
    "connection.capabilities": () => ({ capability, baseline: capability, warnings: [], tasks: row.tasks }),
    "connection.catalogModels": () => ({ listed: false, reason: "fixture catalog absent" }),
    "connection.accountCredits": () => ({ total: 10, used: 0 }),
    "connection.embedSpaceChangePreview": () => ({
      reindex: false,
      stored: { cards: 0, memory: 0, documents: 0, images: 0 },
      embedCalls: 0,
      utilityModelSet: true,
    }),
    "connection.update": ({ patch }) => {
      row = { ...row, declared: patch.declared ?? row.declared };
      return row;
    },
    "settings.getAppSettingsWithOverrides": () => ({ resolved: { privateEndpointAllowlist: [] }, overrides: { privateEndpointAllowlist: null } }),
  });
  const component = await mount(<ConnectionEditorNarrowStory />);
  const advanced = component.getByRole("button", { name: "Advanced", exact: false });
  await advanced.click();
  await expectDisclosureReady(advanced);
  const cache = component.locator('[data-fact="features.pricing.cacheReadPerMTok"]');
  await expect(cache).toContainText("not set");
  await cache.getByRole("button", { name: "Override cache read price" }).click();
  await cache.getByRole("textbox", { name: "cache read price — your value" }).fill("0");
  await cache.getByRole("button", { name: "Save your cache read price" }).click();
  await expect(cache).toContainText("$0 per million tokens");
  await expect(cache).toHaveAttribute("data-overridden", "true");
  await expect
    .poll(() => recorder.lastInput("connection.update"))
    .toEqual({
      connectionId: row.id,
      patch: { declared: { features: { pricing: { ...pricing, cacheReadPerMTok: 0 } } } },
    });
  await cache.getByRole("button", { name: "Reset cache read price" }).click();
  await expect(cache).toContainText("not set");
  await expect.poll(() => recorder.lastInput("connection.update")).toEqual({ connectionId: row.id, patch: { declared: { features: { pricing } } } });
});
