// CT: the composer speak-as dropdown (speak-as-select.tsx, task #29). Drives the production path over
// the stubbed network (routeTrpc) — `chat.getChat` supplies the roster; picking a member fires the real
// `chat.generate` with that `speakerCharacterId`. Proves the D16 size-gate (solo/draft → no control),
// the item list ("Auto" + one per character), and that a pick dispatches generate with the right speaker.
//
// The dropdown POPUP renders through a Base UI Portal, so menu-item assertions use the PAGE locator
// (`page.getByRole`), never `component` — the composer-wand.ct.tsx precedent.

import { expect, test } from "@playwright/experimental-ct-react";
import { routeTrpc } from "../../../../support/ct/route-trpc";
import { SpeakAsSelectStory } from "../_ct-stories";

function character(key: string, name: string, over: Record<string, unknown> = {}): unknown {
  return {
    id: `chat_participant_${key}`,
    kind: "character",
    userId: null,
    characterId: `character_${key}`,
    role: "member",
    displayName: name,
    disabled: false,
    talkativeness: 0.5,
    ...over,
  };
}

function roster(...members: unknown[]): unknown {
  return { participants: members };
}

test("a solo roster (1 character) renders NO speak-as control (the D16 size-gate)", async ({
  mount,
  page,
}) => {
  await routeTrpc(page, { "chat.getChat": () => roster(character("aria", "Aria")) });
  const component = await mount(<SpeakAsSelectStory />);
  await expect(component.getByRole("button", { name: "Speak as a character" })).toHaveCount(0);
});

test("a draft handle renders NO speak-as control (no committed roster yet)", async ({
  mount,
  page,
}) => {
  await routeTrpc(page, {
    "chat.getChat": () => roster(character("aria", "Aria"), character("bryn", "Bryn")),
  });
  const component = await mount(<SpeakAsSelectStory committed={false} />);
  await expect(component.getByRole("button", { name: "Speak as a character" })).toHaveCount(0);
});

test("a 2+ roster opens to Auto + one item per character", async ({ mount, page }) => {
  await routeTrpc(page, {
    "chat.getChat": () => roster(character("aria", "Aria"), character("bryn", "Bryn")),
  });
  const component = await mount(<SpeakAsSelectStory />);

  await component.getByRole("button", { name: "Speak as a character" }).click();

  await expect(page.getByRole("menuitem", { name: "Auto (arbitrate)" })).toBeVisible();
  await expect(page.getByRole("menuitem", { name: "Aria" })).toBeVisible();
  await expect(page.getByRole("menuitem", { name: "Bryn" })).toBeVisible();
});

test("picking a character fires chat.generate with that speakerCharacterId", async ({
  mount,
  page,
}) => {
  const trpc = await routeTrpc(page, {
    "chat.getChat": () => roster(character("aria", "Aria"), character("bryn", "Bryn")),
    "chat.generate": () => ({ messages: [], aborted: false }),
  });
  const component = await mount(<SpeakAsSelectStory />);

  await component.getByRole("button", { name: "Speak as a character" }).click();
  await page.getByRole("menuitem", { name: "Bryn" }).click();

  await expect.poll(() => trpc.count("chat.generate")).toBe(1);
  expect(trpc.lastInput("chat.generate")).toMatchObject({ speakerCharacterId: "character_bryn" });
});

test("picking Auto fires chat.generate with a null speakerCharacterId (arbitration picks)", async ({
  mount,
  page,
}) => {
  const trpc = await routeTrpc(page, {
    "chat.getChat": () => roster(character("aria", "Aria"), character("bryn", "Bryn")),
    "chat.generate": () => ({ messages: [], aborted: false }),
  });
  const component = await mount(<SpeakAsSelectStory />);

  await component.getByRole("button", { name: "Speak as a character" }).click();
  await page.getByRole("menuitem", { name: "Auto (arbitrate)" }).click();

  await expect.poll(() => trpc.count("chat.generate")).toBe(1);
  expect(trpc.lastInput("chat.generate")).toMatchObject({ speakerCharacterId: null });
});
