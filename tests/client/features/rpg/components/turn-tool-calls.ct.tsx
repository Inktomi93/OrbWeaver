import type { MessageView } from "@orb/contracts/chat";
import type { RpgTurnToolCallsView } from "@orb/contracts/rpg";
import { isRpgEngaged } from "@orb/contracts/rpg";
import { appearanceSettingsSchema } from "@orb/contracts/settings/appearance";
import { routeTrpc, serveCorpusProcedures } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { createCorpusHarness } from "@orb/testkit/node/composed";
import type { RpgTurnFooterStory } from "./_own-key-panels-stories.tsx";

const STORY = "tests/client/features/rpg/components/_own-key-panels-stories/RpgTurnFooterStory";
type Root = Awaited<ReturnType<typeof createCorpusHarness>>;

interface RecordedTurn {
  readonly message: MessageView;
  readonly record: RpgTurnToolCallsView;
  readonly unrecorded: MessageView | undefined;
}

async function recordedTurn(root: Root, partial: boolean): Promise<RecordedTurn> {
  const caller = await root.internalCallerFor(root.ownerId);
  const rooms = (await caller.chat.listChats({ limit: 100 })).items;
  for (const room of rooms) {
    const detail = await caller.chat.getChat({ chatId: room.id });
    if (!isRpgEngaged(detail.rpg)) {
      continue;
    }
    const records = await caller.rpg.listTurnToolCalls({ chatId: room.id });
    const messages = (await caller.chat.listMessages({ chatId: room.id })).messages;
    for (const record of records) {
      const incomplete = record.calls.some((call) => call.verdict === "salvaged" || call.verdict === "dropped");
      const message = messages.find((row) => row.selectedVariantId === record.variantId);
      const unrecorded = messages.find((row) => row.role === "assistant" && !records.some((entry) => entry.variantId === row.selectedVariantId));
      if (record.calls.length > 0 && incomplete === partial && message !== undefined && (partial || unrecorded !== undefined)) {
        return { message, record, unrecorded };
      }
    }
  }
  throw new Error(`The committed corpus has no ${partial ? "partly recorded" : "recorded and unrecorded"} native game turn`);
}

for (const touch of [false, true]) {
  test.describe(touch ? "coarse pointer" : "fine pointer", () => {
    test.use({ viewport: { width: 390, height: 844 }, hasTouch: touch, isMobile: touch });

    test("game actions stay compact, expose partial outcomes and follow the selected variant", async ({ mount, page }) => {
      await using root = await createCorpusHarness();
      const caller = await root.internalCallerFor(root.ownerId);
      await caller.settings.updateUserSettingsSection({ section: "appearance", patch: appearanceSettingsSchema.parse({}) });
      const recorded = await recordedTurn(root, false);
      const partial = await recordedTurn(root, true);
      const rpc = await routeTrpc(page, serveCorpusProcedures(caller, ["sessions.me", "settings.getUserSettings", "chat.getChat", "rpg.listTurnToolCalls"]));
      const component = await mount<typeof RpgTurnFooterStory>(STORY, { message: recorded.message });
      const disclosure = page.locator('[data-slot="turn-tool-calls"]');
      const trigger = disclosure.getByRole("button", { name: `Game actions on this turn — ${recorded.record.calls.length}`, exact: true });
      await expect(trigger).toBeVisible();
      await expect(trigger).toHaveText(String(recorded.record.calls.length));
      await expect(trigger).toHaveAttribute("aria-expanded", "false");
      const geometry = await trigger.evaluate((element) => {
        const box = element.getBoundingClientRect();
        const parent = element.parentElement;
        if (parent === null) {
          throw new Error("Missing disclosure root");
        }
        const probe = document.createElement("span");
        probe.style.width = "var(--size-touch-target)";
        probe.style.position = "absolute";
        element.append(probe);
        const floor = probe.getBoundingClientRect().width;
        probe.remove();
        return {
          width: box.width,
          height: box.height,
          available: parent.getBoundingClientRect().width,
          floor,
          coarse: matchMedia("(pointer: coarse)").matches,
        };
      });
      expect(geometry.coarse).toBe(touch);
      expect(geometry.width).toBeLessThan(geometry.available);
      expect(geometry.floor).toBeGreaterThan(0);
      expect(geometry.height >= geometry.floor).toBe(touch);
      expect(geometry.width).toBeGreaterThanOrEqual(geometry.floor);
      const recordedGlyph = await trigger.locator("svg").first().innerHTML();
      await trigger.press("Enter");
      await expect(trigger).toHaveAttribute("aria-expanded", "true");
      await expect(disclosure.locator('[data-slot="turn-tool-call"]')).toHaveCount(recorded.record.calls.length);
      await trigger.click();
      await expect(trigger).toHaveAttribute("aria-expanded", "false");
      const reads = rpc.count("rpg.listTurnToolCalls");
      if (recorded.unrecorded === undefined) {
        throw new Error("The recorded-turn control needs an unrecorded sibling variant");
      }
      await component.update({ message: recorded.unrecorded });
      await expect(disclosure).toHaveCount(0);
      await component.update({ message: recorded.message });
      await expect(trigger).toBeVisible();
      expect(rpc.count("rpg.listTurnToolCalls")).toBe(reads);
      await component.update({ message: partial.message });
      const warning = disclosure.getByRole("button", { name: `Game actions on this turn — ${partial.record.calls.length} — needs attention`, exact: true });
      await expect(warning).toBeVisible();
      await expect(warning).toHaveText(String(partial.record.calls.length));
      const warningGlyph = warning.locator("svg").first();
      await expect(warningGlyph).toBeVisible();
      expect(await warningGlyph.innerHTML()).not.toEqual(recordedGlyph);
      await warning.press("Enter");
      await expect(disclosure.getByText("partly recorded", { exact: true }).first()).toBeVisible();
      const issue = partial.record.calls.flatMap((call) => call.issues)[0];
      if (issue === undefined) {
        throw new Error("The native partial outcome has no explanation");
      }
      await expect(disclosure.getByText(issue, { exact: true }).first()).toBeVisible();
      await component.unmount();
    });
  });
}
