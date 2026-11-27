// @subject packages/client/src/features/credentials/components/connection-fact-rows.tsx
// The own-server switches and the lines that say what the server needs fit a phone at 200% text in each engine: the switch stays inside
// its row and the screen, and the row's words wrap inside it instead of running past it. And the keyboard keeps its place in each
// engine: Enter on Override moves focus into the editor, Esc leaves it, and a switch keeps focus while its write is pending.

import { appearanceSettingsSchema } from "@orb/contracts/settings/appearance";
import { actionGroupGeometry } from "@orb/testkit/browser/spec";
import { holdServed, routeTrpc, serveCorpusProcedures } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { createServerHarness } from "@orb/testkit/node/composed";
import {
  ANTISLOP_NEEDS,
  CONNECTION_EDITOR_TIER_TITLES,
  factOverrideName,
  factYourValueName,
  SAMPLER_ENVELOPE_NEEDS,
} from "#client/features/credentials/lib/credentials-names.ts";
import type { ConnectionActionGroupsStory } from "./_connection-action-groups-stories.tsx";

const STORY = "tests/client/features/credentials/components/_connection-action-groups-stories/ConnectionActionGroupsStory";
const READS = [
  "sessions.me",
  "settings.getUserSettings",
  "connection.list",
  "connection.listBindings",
  "credentials.list",
  "connection.providersAvailable",
  "connection.catalogModels",
  "connection.get",
  "connection.capabilities",
] as const;
const LABEL = "Own vLLM box";
const PHONE_WIDTH = 390;
const ENVELOPE_ROW = "features.samplerEnvelope";
const ANTISLOP_ROW = "features.antislop";
const DEADLINE_ROW = "features.requestTimeoutMs";
const PHRASE_FORM_ROW = "features.bannedStrings";
const NEEDS_BY_ROW = { [ENVELOPE_ROW]: SAMPLER_ENVELOPE_NEEDS, [ANTISLOP_ROW]: ANTISLOP_NEEDS } as const;
const ROWS = [ENVELOPE_ROW, ANTISLOP_ROW] as const;
const namePrefix = (spelled: string): RegExp => new RegExp(`^${RegExp.escape(spelled.trim())}`, "u");
const nameSuffix = (spelled: string): RegExp => new RegExp(`${RegExp.escape(spelled.trim())}$`, "u");

test.use({ viewport: { width: PHONE_WIDTH, height: 844 }, isMobile: true, hasTouch: true });

test("the own-server switches and what they need fit a phone at 200% text", async ({ mount, page }) => {
  await page.addInitScript(() => {
    document.documentElement.style.fontSize = "200%";
  });
  await using root = await createServerHarness({ startJobs: false, secretBoxKey: Buffer.alloc(32, 17) });
  const caller = await root.internalCallerFor(root.ownerId);
  await caller.connection.create({ providerId: "vllm", credentialId: null, baseUrl: "http://127.0.0.1:8000/v1", model: "own-model", label: LABEL });
  await routeTrpc(page, serveCorpusProcedures(caller, READS));
  await mount<typeof ConnectionActionGroupsStory>(STORY, { width: PHONE_WIDTH, appearance: appearanceSettingsSchema.parse({}) });
  await page.locator('[data-slot="list-row-body"]').filter({ hasText: LABEL }).click();
  await page.getByRole("button", { name: new RegExp(`^${RegExp.escape(CONNECTION_EDITOR_TIER_TITLES.advanced)}`, "u") }).click();

  for (const path of ROWS) {
    const row = page.locator(`[data-fact="${path}"]`);
    const toggle = row.getByRole("switch");
    await expect(toggle).toBeVisible();
    const geometry = await actionGroupGeometry(row, [toggle]);
    expect(geometry.inlineOverflow).toBeLessThanOrEqual(1);
    // The switch is a touch target, and the row's words never run past the row's own box.
    const needs = await row.getByText(NEEDS_BY_ROW[path], { exact: true }).boundingBox();
    expect(needs).not.toBeNull();
    expect((needs?.x ?? Number.POSITIVE_INFINITY) + (needs?.width ?? Number.POSITIVE_INFINITY)).toBeLessThanOrEqual(geometry.host.x + geometry.host.width + 1);
  }
});

// A keyboard user presses Enter on a focused Override and has no pointer to land focus in the editor, so the editor takes it; Esc is
// then delivered to the editor and leaves it. A pending write must not drop the switch's focus either, or Space cannot undo it.
test("Enter on Override moves focus into the editor, Esc leaves it, and a switch keeps focus while its write is pending", async ({ mount, page }) => {
  await using root = await createServerHarness({ startJobs: false, secretBoxKey: Buffer.alloc(32, 17) });
  const caller = await root.internalCallerFor(root.ownerId);
  const vllm = await caller.connection.create({
    providerId: "vllm",
    credentialId: null,
    baseUrl: "http://127.0.0.1:8000/v1",
    model: "own-model",
    label: LABEL,
  });
  const hold = holdServed();
  let held = false;
  await routeTrpc(page, {
    ...serveCorpusProcedures(caller, READS),
    ...serveCorpusProcedures(caller, ["connection.embedSpaceChangePreview"]),
    ...serveCorpusProcedures(caller, ["connection.update"], (): ReturnType<typeof holdServed> | undefined => {
      if (held) {
        return undefined;
      }
      held = true;
      return hold;
    }),
  });
  await mount<typeof ConnectionActionGroupsStory>(STORY, { width: PHONE_WIDTH, appearance: appearanceSettingsSchema.parse({}) });
  await page.locator('[data-slot="list-row-body"]').filter({ hasText: LABEL }).click();
  await page.getByRole("button", { name: new RegExp(`^${RegExp.escape(CONNECTION_EDITOR_TIER_TITLES.advanced)}`, "u") }).click();

  // A number fact: focus lands in the field, and the first Esc from there closes the editor and hands focus back to Override.
  const deadline = page.locator(`[data-fact="${DEADLINE_ROW}"]`);
  const override = deadline.getByRole("button", { name: namePrefix(factOverrideName("")) });
  const field = deadline.getByRole("textbox", { name: nameSuffix(factYourValueName("")) });
  await override.focus();
  await page.keyboard.press("Enter");
  await expect(field).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(field).toHaveCount(0);
  await expect(override).toBeFocused();

  // A select: focus lands on its trigger, and Esc with its list shut closes the editor.
  const form = page.locator(`[data-fact="${PHRASE_FORM_ROW}"]`);
  const formOverride = form.getByRole("button", { name: namePrefix(factOverrideName("")) });
  await formOverride.focus();
  await page.keyboard.press("Enter");
  await expect(form.getByRole("combobox")).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(form.getByRole("combobox")).toHaveCount(0);
  await expect(formOverride).toBeFocused();

  // A switch: Space toggles it, the pending write leaves focus where it was, and Space again undoes it.
  const antislop = page.locator(`[data-fact="${ANTISLOP_ROW}"]`).getByRole("switch");
  await antislop.focus();
  await page.keyboard.press("Space");
  await hold.requested;
  await expect(antislop).toBeFocused();
  hold.release();
  await expect.poll(async () => (await caller.connection.get({ connectionId: vllm.id })).declared?.features?.antislop).toBe(true);
  await expect(antislop).toBeChecked();
  await expect(antislop).toBeFocused();
  await page.keyboard.press("Space");
  await expect.poll(async () => (await caller.connection.get({ connectionId: vllm.id })).declared?.features?.antislop).toBeUndefined();
  await expect(antislop).not.toBeChecked();
  await expect(antislop).toBeFocused();
});
