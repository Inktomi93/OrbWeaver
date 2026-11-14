// @subject packages/client/src/features/preset/components/readout/prompt-readout.tsx
// The Presets readout shows each value whole: a budget row's section name and the connection picker of the active-preset readout wrap between
// their words at the phone's default and enlarged text, and none ends in an ellipsis.
import type { ChatId } from "@orb/kit/ids";
import { enlargedTextGeometry, setRootFontScale } from "@orb/testkit/browser/spec";
import { channelName, routeAuthConfig, routeTrpc, SECTION_PROCEDURES, SHELL_MOUNT_PROCEDURES, serveCorpusProcedures } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { createCorpusHarness } from "@orb/testkit/node/composed";
import { PRESET_CAPABILITY_CONNECTION_NAME, PRESET_READOUT_BUDGET_LABEL } from "#client/features/preset/lib/preset-names.ts";
import type { PresetReadoutStory } from "./_preset-readout-stories.tsx";

const STORY = "tests/client/features/preset/components/_preset-readout-stories/PresetReadoutStory";
const READOUT_READS = [
  ...SECTION_PROCEDURES,
  ...SHELL_MOUNT_PROCEDURES,
  "preset.listUsage",
  "regex.listForPreset",
  "chat.previewAssembly",
  "chat.previewActionTemplates",
  "preset.resolveEffective",
  "connection.resolveChatCapability",
  "connection.providersAvailable",
  "connection.list",
] as const;
const TEXT_SCALES = [1, 3] as const;
const VALUE_CUT = "has its value cut";

test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

for (const scale of TEXT_SCALES) {
  test(`at ${scale * 100}% text no budget row cuts its section name`, async ({ mount, page }) => {
    await using root = await createCorpusHarness();
    const host = await root.internalCallerFor(root.ownerId);
    const preset = await host.preset.create({ name: "Readout witness", kind: "generation" });
    const room = (await host.chat.listChats({ limit: 1 })).items[0];
    if (room === undefined) {
      throw new Error("The corpus has no chat to bind the readout to");
    }
    await routeAuthConfig(page, await (await root.http.request("/api/auth/config")).text());
    await routeTrpc(page, serveCorpusProcedures(host, READOUT_READS));
    const chatId: ChatId = room.id;
    await mount<typeof PresetReadoutStory>(STORY, { presetId: preset.id, view: "prompt", chatId });
    await setRootFontScale(page, channelName("fontScale"), scale);
    const budget = page.getByText(PRESET_READOUT_BUDGET_LABEL, { exact: true });
    await expect(budget).toBeVisible();
    const geometry = await enlargedTextGeometry(page.locator("#root"));
    expect(geometry.findings.filter((finding) => finding.includes(VALUE_CUT))).toEqual([]);
  });

  test(`at ${scale * 100}% text the effective readout's connection picker shows its whole value`, async ({ mount, page }) => {
    await using root = await createCorpusHarness();
    const host = await root.internalCallerFor(root.ownerId);
    const preset = await host.preset.create({ name: "Readout witness", kind: "generation" });
    await routeAuthConfig(page, await (await root.http.request("/api/auth/config")).text());
    await routeTrpc(page, serveCorpusProcedures(host, READOUT_READS));
    await mount<typeof PresetReadoutStory>(STORY, { presetId: preset.id, view: "params", chatId: null });
    await setRootFontScale(page, channelName("fontScale"), scale);
    const picker = page.getByRole("combobox", { name: PRESET_CAPABILITY_CONNECTION_NAME, exact: true });
    await expect(picker).toBeVisible();
    const value = picker.locator('[data-slot="select-value"]');
    const shown = await value.evaluate((node) => ({ whole: node.scrollWidth <= node.clientWidth, overflow: getComputedStyle(node).textOverflow }));
    expect(shown.whole).toBe(true);
    expect(shown.overflow).not.toBe("ellipsis");
  });
}
