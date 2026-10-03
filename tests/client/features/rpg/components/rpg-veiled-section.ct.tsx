// CT: the host's Veiled ledger behind RevealGate (rpg-veiled-section.tsx). Each truth is unmounted at rest, so
// a shared screen cannot spoil it, mounts on an explicit Reveal and unmounts on Hide. The rest of the row (the
// character, the public claim, the turn chip) stays visible. Mounted at the context panel's 320px width.

import type { MessageId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { expect, test } from "@playwright/experimental-ct-react";
import { hideActionName, revealActionName } from "../../../../../packages/ui/src/lib/action-names.ts";
import type { TrpcWireOutput } from "../../../../support/node/route-trpc.ts";
import { routeTrpc, trpcError } from "../../../../support/node/route-trpc.ts";
import { RpgVeiledSectionStory } from "../_ct-stories.tsx";

type Reveal = TrpcWireOutput<"rpg.revealHidden">;
type Lie = Reveal["standingLies"][number]["lies"][number];

const KEY_LIE: Lie = {
  character: "Sola",
  type: "lie",
  truth: "she pocketed the key",
  reason: "claims she never touched it",
  messageId: castId<MessageId>("message_ct_veil_t41"),
};
const MAP_LIE: Lie = {
  character: "Sola",
  type: "lie",
  truth: "she burned the map",
  reason: "says the map was lost at sea",
  messageId: castId<MessageId>("message_ct_veil_t42"),
};
const DART_LIE: Lie = { character: "Niko", type: "ofilter", truth: "the dart was poisoned", reason: "", messageId: castId<MessageId>("message_ct_veil_t43") };

function reveal(lies: readonly Lie[]): Reveal {
  const byCharacter = new Map<string, Lie[]>();
  for (const lie of lies) {
    byCharacter.set(lie.character, [...(byCharacter.get(lie.character) ?? []), lie]);
  }
  return { messages: [], standingLies: [...byCharacter.entries()].map(([character, characterLies]) => ({ character, lies: characterLies })) };
}

const SOLA_ONLY = "the truth for Sola";
const SOLA_FIRST = "the truth for Sola, 1 of 2";
const SOLA_SECOND = "the truth for Sola, 2 of 2";
const NIKO = "the truth for Niko";

test("at rest every truth is out of the DOM while the rest of each row shows", async ({ mount, page }) => {
  await routeTrpc(page, { "rpg.revealHidden": () => reveal([KEY_LIE, DART_LIE]) });
  const ledger = await mount(<RpgVeiledSectionStory />);

  await expect(ledger.getByText("Veiled — host only")).toBeVisible();
  await expect(ledger.getByText("claims she never touched it")).toBeVisible();
  await expect(ledger.getByRole("button", { name: revealActionName(SOLA_ONLY) })).toBeVisible();
  await expect(ledger.getByRole("button", { name: revealActionName(NIKO) })).toBeVisible();
  await expect(ledger.getByText("she pocketed the key")).toHaveCount(0);
  await expect(ledger.getByText("the dart was poisoned")).toHaveCount(0);
});

test("a keyboard reveal mounts one truth and moves focus to its Hide; Hide unmounts it and returns the trigger", async ({ mount, page }) => {
  await routeTrpc(page, { "rpg.revealHidden": () => reveal([KEY_LIE, DART_LIE]) });
  const ledger = await mount(<RpgVeiledSectionStory />);

  await ledger.getByRole("button", { name: revealActionName(SOLA_ONLY) }).focus();
  await page.keyboard.press("Enter");

  await expect(ledger.getByText("she pocketed the key")).toBeVisible();
  // Only the gate that was opened mounted its child.
  await expect(ledger.getByText("the dart was poisoned")).toHaveCount(0);
  const hide = ledger.getByRole("button", { name: hideActionName(SOLA_ONLY) });
  await expect(hide).toBeFocused();

  await page.keyboard.press("Enter");
  await expect(ledger.getByText("she pocketed the key")).toHaveCount(0);
  await expect(ledger.getByRole("button", { name: revealActionName(SOLA_ONLY) })).toBeVisible();
});

test("two truths held by one character get distinct names, so neither trigger is ambiguous", async ({ mount, page }) => {
  await routeTrpc(page, { "rpg.revealHidden": () => reveal([KEY_LIE, MAP_LIE]) });
  const ledger = await mount(<RpgVeiledSectionStory />);

  await expect(ledger.getByRole("button", { name: revealActionName(SOLA_FIRST), exact: true })).toHaveCount(1);
  await expect(ledger.getByRole("button", { name: revealActionName(SOLA_SECOND), exact: true })).toHaveCount(1);
});

// The rows are keyed by the lie, so a ledger change keeps a revealed truth open on its own row and adds the new
// one hidden. A positional key would hand the open gate to whichever lie took the old slot.
test("when the ledger changes, the revealed row stays revealed and the new row arrives hidden", async ({ mount, page }) => {
  let reads = 0;
  await routeTrpc(page, { "rpg.revealHidden": () => (reads++ === 0 ? reveal([DART_LIE]) : reveal([KEY_LIE, DART_LIE])) });
  const ledger = await mount(<RpgVeiledSectionStory />);

  await ledger.getByRole("button", { name: revealActionName(NIKO) }).click();
  await expect(ledger.getByText("the dart was poisoned")).toBeVisible();

  await ledger.getByRole("button", { name: "re-read the ledger" }).click();
  await expect(ledger.getByRole("button", { name: revealActionName(SOLA_ONLY) })).toBeVisible();
  await expect(ledger.getByText("the dart was poisoned")).toBeVisible();
  await expect(ledger.getByText("she pocketed the key")).toHaveCount(0);
});

test("a failed ledger read shows its error with a Retry that re-reads", async ({ mount, page }) => {
  let reads = 0;
  const trpc = await routeTrpc(page, { "rpg.revealHidden": () => (reads++ === 0 ? trpcError({ message: "reveal read failed" }) : reveal([KEY_LIE])) });
  const ledger = await mount(<RpgVeiledSectionStory />);

  await expect(ledger.getByText("Couldn't load the veiled ledger.")).toBeVisible();
  await ledger.getByRole("button", { name: "Retry" }).click();
  await expect.poll(() => trpc.count("rpg.revealHidden"), { intervals: [20, 50, 100] }).toBe(2);
  await expect(ledger.getByRole("button", { name: revealActionName(SOLA_ONLY) })).toBeVisible();
  await expect(ledger.getByText("she pocketed the key")).toHaveCount(0);
});

test.describe("on a coarse pointer", () => {
  test.use({ hasTouch: true, viewport: { width: 360, height: 800 } });

  test("both triggers meet the 44px touch floor and the revealed truth wraps inside the 320px row", async ({ mount, page }) => {
    await routeTrpc(page, {
      "rpg.revealHidden": () => reveal([{ ...KEY_LIE, truth: "she pocketed the key to the lower vault before the guards changed shift" }]),
    });
    const ledger = await mount(<RpgVeiledSectionStory />);

    const trigger = ledger.getByRole("button", { name: revealActionName(SOLA_ONLY) });
    await expect.poll(async () => (await trigger.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);

    await trigger.tap();
    const hide = ledger.getByRole("button", { name: hideActionName(SOLA_ONLY) });
    await expect(hide).toBeVisible();
    await expect.poll(async () => (await hide.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);

    const section = ledger.locator('[data-slot="rpg-veiled-section"]');
    await expect.poll(() => section.evaluate((el) => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(0);
  });
});
