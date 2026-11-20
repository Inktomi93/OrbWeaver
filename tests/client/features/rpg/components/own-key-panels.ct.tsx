// A host label that mints an `Object.prototype` member name as its key ("Constructor" → `constructor`) renders as
// an unset value on every rpg panel until the game sets it, then shows and computes its own value: the dice
// ability check, the Status meter, the character attribute cell and the Scene character card. Reads come from a
// real corpus root.

import { MESSAGE_TOOLS_LABEL } from "@orb/client/lib";
import type { RpgStatProfile } from "@orb/contracts/rpg";
import { RPG_PROFILE_D20, rpgAttributeModifier, rpgNpcSlug, rpgTrackerDefSchema } from "@orb/contracts/rpg";
import type { ChatId, UserId } from "@orb/kit/ids";
import { NO_VALUE, NO_VALUE_NAME } from "@orb/kit/strings";
import type { TrpcRoutes, TrpcWireOutput } from "@orb/testkit/ct";
import { routeTrpc, serveCorpusProcedures } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { nameShape } from "@orb/testkit/iso";
import { createCorpusHarness, seedRpgGame } from "@orb/testkit/node/composed";
import type { Locator } from "@playwright/test";
import {
  RPG_ABILITY_CHECK_NAME,
  RPG_HIDE_KNOWN_CHARACTERS_NAME,
  RPG_SCORE_UNSET_HINT,
  RPG_SHOW_KNOWN_CHARACTERS_NAME,
  RPG_STATUS_LINE_LABEL,
} from "#client/features/rpg/lib/rpg-names.ts";
import { trackerFieldName, trackerValueName, trackerValueRestName } from "#client/features/rpg/lib/tracker-names.ts";
import { numberBoundsBetween } from "#ui/primitives/number-field/number-field-names.ts";
import type { RpgContextTabStory, RpgDiceComposerStory } from "./_own-key-panels-stories.tsx";

const TAB_STORY = "tests/client/features/rpg/components/_own-key-panels-stories/RpgContextTabStory";
const DICE_STORY = "tests/client/features/rpg/components/_own-key-panels-stories/RpgDiceComposerStory";
/** The key the client mints from the host label: an inherited member of every plain object. */
const INHERITED_KEY = "constructor";
const LABEL = "Constructor";
const TEXT_TRACKER = "Mood";
const NPC_NAME = "Mira Vale";
const TRACKER_MAX = 10;
const TRACKER_VALUE = 3;
const SCORE = 14;

type Routes = TrpcRoutes<
  "sessions.me" | "settings.getUserSettings" | "chat.getChat" | "chat.listMessages" | "rpg.getGame" | "rpg.getTrackerView" | "rpg.revealHidden"
>;

/** The owner's current reads of the room, as routes for the panel and as the tracker view they serve. */
interface Reads {
  readonly routes: Routes;
  readonly tracker: TrpcWireOutput<"rpg.getTrackerView">;
}

interface GameRoom {
  readonly chatId: ChatId;
  /** The game's stat profile, carrying the `Constructor` attribute. */
  readonly profile: RpgStatProfile;
  readonly reads: () => Promise<Reads>;
  /** Set the owner's `Constructor` score and every actor's `Constructor` reading. */
  readonly setInheritedValues: () => Promise<void>;
}

/** A d20 game in a fresh room whose profile and trackers carry the `Constructor` label, with the owner's sheet
 *  stored for another attribute and an npc on the actor plane. */
async function gameRoom(root: Awaited<ReturnType<typeof createCorpusHarness>>): Promise<GameRoom> {
  const caller = await root.internalCallerFor(root.ownerId);
  const principal = await root.principalFor(root.ownerId);
  const chatId = (await caller.chat.startChat({ characterIds: [], opening: "none" })).chat.id;
  await seedRpgGame(root, { principal, chatId, mode: "lite", ruleset: "d20" });
  const config = await caller.rpg.getConfigView({ chatId });
  const born = config.statProfile;
  const profile = { ...born, attributes: [...born.attributes, { key: INHERITED_KEY, label: LABEL, hint: "" }] };
  const tracker = rpgTrackerDefSchema.parse({ key: INHERITED_KEY, label: LABEL, shape: "meter", write: "delta", subject: "actor", max: TRACKER_MAX });
  await caller.rpg.updateConfig({ chatId, patch: { statProfile: profile, trackers: [...config.trackers, tracker] } });
  const owner = { kind: "user", userId: root.ownerId } as const;
  const other = RPG_PROFILE_D20.attributes[0];
  if (other === undefined) {
    throw new Error("the d20 profile has no attribute");
  }
  await caller.rpg.patchSheet({ chatId, actorRef: owner, patch: { attributes: { [other.key]: born.range.max } } });
  const npc = await caller.rpg.patchActor({
    chatId,
    targetRef: { kind: "npc", npcKey: rpgNpcSlug(NPC_NAME) },
    ops: [{ op: "setIdentityText", field: "name", text: NPC_NAME }],
  });
  if (!npc.ok) {
    throw new Error(`the npc seed was refused: ${npc.reason}`);
  }
  return {
    chatId,
    profile,
    reads: async (): Promise<Reads> => ({
      tracker: await caller.rpg.getTrackerView({ chatId }),
      routes: serveCorpusProcedures(caller, [
        "sessions.me",
        "settings.getUserSettings",
        "chat.getChat",
        "chat.listMessages",
        "rpg.getGame",
        "rpg.getTrackerView",
        "rpg.revealHidden",
      ]),
    }),
    setInheritedValues: async (): Promise<void> => {
      await caller.rpg.patchSheet({ chatId, actorRef: owner, patch: { attributes: { [INHERITED_KEY]: SCORE } } });
      for (const actor of (await caller.rpg.getTrackerView({ chatId })).actors) {
        await caller.rpg.patchActor({ chatId, targetRef: actor.actorRef, ops: [{ op: "setTracker", key: INHERITED_KEY, value: { value: TRACKER_VALUE } }] });
      }
    },
  };
}

/** The Status list's participant count and the owner's name, as the tracker view the panel renders names them. */
function participants(reads: Reads, ownerId: UserId): { readonly count: number; readonly owner: string } {
  const { actors } = reads.tracker;
  const owner = actors.find((actor) => actor.actorRef.kind === "user" && actor.actorRef.userId === ownerId);
  if (owner === undefined) {
    throw new Error("the tracker view has no owner actor");
  }
  return { count: actors.filter((actor) => actor.actorRef.kind !== "npc").length, owner: owner.name };
}

test("the dice ability check for an unset inherited-name attribute is disabled and asks for the score", async ({ mount, page }) => {
  await using root = await createCorpusHarness();
  const room = await gameRoom(root);
  await routeTrpc(page, (await room.reads()).routes);
  await mount<typeof RpgDiceComposerStory>(DICE_STORY, { chatId: room.chatId });
  await page.getByRole("button", { name: MESSAGE_TOOLS_LABEL, exact: true }).click();
  await page.getByRole("menuitem", { name: RPG_ABILITY_CHECK_NAME, exact: true }).click();
  const unset = page.getByRole("menuitem", { name: LABEL, exact: false });
  await expect(unset).toHaveText(`${LABEL}${RPG_SCORE_UNSET_HINT}`);
  await expect(unset).toBeDisabled();
});

test("a set inherited-name attribute offers its ability check with the profile's modifier", async ({ mount, page }) => {
  await using root = await createCorpusHarness();
  const room = await gameRoom(root);
  await room.setInheritedValues();
  await routeTrpc(page, (await room.reads()).routes);
  await mount<typeof RpgDiceComposerStory>(DICE_STORY, { chatId: room.chatId });
  await page.getByRole("button", { name: MESSAGE_TOOLS_LABEL, exact: true }).click();
  await page.getByRole("menuitem", { name: RPG_ABILITY_CHECK_NAME, exact: true }).click();
  const modifier = rpgAttributeModifier(room.profile, SCORE);
  await expect(page.getByRole("menuitem", { name: `${LABEL} (${modifier >= 0 ? "+" : ""}${modifier})`, exact: true })).toBeEnabled();
});

test("Status meters and the character takeover read an unset inherited-name key as unset, then its own values", async ({ mount, page }) => {
  await using root = await createCorpusHarness();
  const room = await gameRoom(root);
  // Every participant's meter on Status carries its name; the one-carrier takeover names its attribute cell and
  // meter bare, in that order.
  const statusMeters = page.getByRole("button", { name: nameShape((part) => trackerValueRestName(trackerFieldName(trackerValueName(LABEL), part), part)) });
  const takeoverValues = page.getByRole("button", { name: nameShape((shown) => trackerValueRestName(trackerValueName(LABEL), shown)) });
  let reads = await room.reads();
  let seats = participants(reads, root.ownerId);
  await routeTrpc(page, reads.routes);
  const unset = await mount<typeof RpgContextTabStory>(TAB_STORY, { chatId: room.chatId, tab: "rpg.status" });
  await expect(statusMeters).toHaveText(Array.from({ length: seats.count }, () => NO_VALUE));
  await page.getByRole("button", { name: `Open ${seats.owner}`, exact: true }).click();
  await expect(takeoverValues).toHaveText([NO_VALUE, NO_VALUE]);
  await unset.unmount();

  await room.setInheritedValues();
  reads = await room.reads();
  seats = participants(reads, root.ownerId);
  await routeTrpc(page, reads.routes);
  await mount<typeof RpgContextTabStory>(TAB_STORY, { chatId: room.chatId, tab: "rpg.status" });
  await expect(statusMeters).toHaveText(Array.from({ length: seats.count }, () => String(TRACKER_VALUE)));
  await page.getByRole("button", { name: `Open ${seats.owner}`, exact: true }).click();
  await expect(takeoverValues).toHaveText([String(SCORE), String(TRACKER_VALUE)]);
});

test("the Scene character card reads an unset inherited-name tracker as unset, then its own value", async ({ mount, page }) => {
  await using root = await createCorpusHarness();
  const room = await gameRoom(root);
  const npcValue = page.getByRole("button", { name: nameShape((shown) => trackerValueRestName(trackerFieldName(trackerValueName(LABEL), NPC_NAME), shown)) });
  await routeTrpc(page, (await room.reads()).routes);
  const unset = await mount<typeof RpgContextTabStory>(TAB_STORY, { chatId: room.chatId, tab: "rpg.scene" });
  await page.getByRole("button", { name: RPG_SHOW_KNOWN_CHARACTERS_NAME, exact: true }).click();
  // Open, the disclosure offers the other state's name.
  await expect(page.getByRole("button", { name: RPG_HIDE_KNOWN_CHARACTERS_NAME, exact: true })).toBeVisible();
  await expect(npcValue).toHaveText(NO_VALUE);
  // The mood slot beside it has no value either, and its accessible name says so in words.
  await expect(page.getByRole("button", { name: `${NPC_NAME} mood: ${NO_VALUE_NAME}`, exact: true })).toBeVisible();
  await unset.unmount();

  await room.setInheritedValues();
  await routeTrpc(page, (await room.reads()).routes);
  await mount<typeof RpgContextTabStory>(TAB_STORY, { chatId: room.chatId, tab: "rpg.scene" });
  await page.getByRole("button", { name: RPG_SHOW_KNOWN_CHARACTERS_NAME, exact: true }).click();
  await expect(npcValue).toHaveText(String(TRACKER_VALUE));
});

async function expectStableValueEdit(rest: Locator, cell: Locator, name: string, value: number): Promise<void> {
  const before = await cell.boundingBox();
  const size = await rest.locator('[data-slot="text"]').evaluate((element) => getComputedStyle(element).fontSize);
  expect(before).not.toBeNull();
  await rest.click();
  const field = cell.getByRole("textbox", { name, exact: true });
  await expect(field).toHaveValue(String(value));
  await expect(field).toHaveCSS("font-size", size);
  await expect.poll(async () => (await cell.boundingBox())?.height).toBe(before?.height);
  await field.press("Escape");
  await expect(rest).toBeVisible();
  await expect.poll(async () => (await cell.boundingBox())?.height).toBe(before?.height);
}

test("label and promoted tracker voices keep the editor step and row height", async ({ mount, page }) => {
  await using root = await createCorpusHarness();
  const room = await gameRoom(root);
  await room.setInheritedValues();
  const reads = await room.reads();
  const { owner } = participants(reads, root.ownerId);
  await routeTrpc(page, reads.routes);
  await mount<typeof RpgContextTabStory>(TAB_STORY, { chatId: room.chatId, tab: "rpg.status" });
  const ordinaryName = `${owner} ${LABEL} value`;
  // The rest button's name is the field's name, then what the button shows.
  const ordinary = page.getByRole("button", { name: `${ordinaryName}: ` });
  await expect(ordinary).toHaveText(String(TRACKER_VALUE));
  const ordinaryCell = page
    .locator('[data-slot="meter-row"]')
    .filter({ has: page.getByText(LABEL, { exact: true }) })
    .first();
  await expectStableValueEdit(ordinary, ordinaryCell, ordinaryName, TRACKER_VALUE);
  await page.getByRole("button", { name: `Open ${owner}`, exact: true }).click();
  const promotedName = `${LABEL} value`;
  const promotedCell = page.locator('[data-slot="stat-cell"]').filter({ has: page.getByText(LABEL, { exact: true }) });
  const promoted = promotedCell.getByRole("button", { name: `${promotedName}: ` });
  await expectStableValueEdit(promoted, promotedCell, promotedName, SCORE);
});

test("an attribute tile takes numbers only, steps by one on the arrow keys and states the profile's range", async ({ mount, page }) => {
  await using root = await createCorpusHarness();
  const room = await gameRoom(root);
  await room.setInheritedValues();
  const reads = await room.reads();
  const { owner } = participants(reads, root.ownerId);
  await routeTrpc(page, reads.routes);
  await mount<typeof RpgContextTabStory>(TAB_STORY, { chatId: room.chatId, tab: "rpg.status" });
  await page.getByRole("button", { name: `Open ${owner}`, exact: true }).click();
  const name = `${LABEL} value`;
  const cell = page.locator('[data-slot="stat-cell"]').filter({ has: page.getByText(LABEL, { exact: true }) });
  await cell.getByRole("button", { name: `${name}: ` }).click();
  const field = cell.getByRole("textbox", { name, exact: true });
  await expect(field).toHaveValue(String(SCORE));
  await field.press("ArrowUp");
  await expect(field).toHaveValue(String(SCORE + 1));
  await field.press("ArrowDown");
  await field.press("ArrowDown");
  await expect(field).toHaveValue(String(SCORE - 1));
  await field.fill("");
  await field.pressSequentially("ab");
  await expect(field).toHaveValue("");
  const { min, max } = room.profile.range;
  await expect(field).toHaveAccessibleDescription(numberBoundsBetween(String(min), String(max)));
  await expect(field).toHaveAttribute("placeholder", `${min}–${max}`);
});

test("Status seats a text tracker's value at the end of the room its row leaves, and the status line at its own width", async ({ mount, page }) => {
  await using root = await createCorpusHarness();
  const room = await gameRoom(root);
  const caller = await root.internalCallerFor(root.ownerId);
  const config = await caller.rpg.getConfigView({ chatId: room.chatId });
  const mood = rpgTrackerDefSchema.parse({ key: "mood", label: TEXT_TRACKER, shape: "text", write: "set", subject: "actor" });
  await caller.rpg.updateConfig({ chatId: room.chatId, patch: { trackers: [...config.trackers, mood] } });
  await routeTrpc(page, (await room.reads()).routes);
  await mount<typeof RpgContextTabStory>(TAB_STORY, { chatId: room.chatId, tab: "rpg.status" });
  const value = page
    .getByRole("button", { name: nameShape((part) => trackerValueRestName(trackerFieldName(trackerValueName(TEXT_TRACKER), part), part)) })
    .first();
  const label = page.getByText(TEXT_TRACKER, { exact: true }).first();
  await expect(value).toBeVisible();
  const placed = await value.evaluate((element) => {
    const row = element.closest('[data-slot="tracker-value-rest"]')?.parentElement ?? element.parentElement;
    return { rowEnd: row?.getBoundingClientRect().right, end: element.getBoundingClientRect().right, align: getComputedStyle(element).textAlign };
  });
  expect(placed.end).toBe(placed.rowEnd);
  expect(placed.align).toBe("end");
  expect((await value.boundingBox())?.width).toBeGreaterThan((await label.boundingBox())?.width ?? Number.POSITIVE_INFINITY);
  const status = page.getByRole("button", { name: new RegExp(RegExp.escape(RPG_STATUS_LINE_LABEL), "u") }).first();
  const fit = await status.evaluate((element) => ({
    own: element.getBoundingClientRect().width,
    line: element.parentElement?.getBoundingClientRect().width ?? 0,
  }));
  expect(fit.own).toBeLessThan(fit.line);
});
