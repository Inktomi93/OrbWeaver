// A host label that mints an `Object.prototype` member name as its key ("Constructor" → `constructor`) renders as
// an unset value on every rpg panel until the game sets it, then shows and computes its own value: the dice
// ability check, the Status meter, the character attribute cell and the Scene character card. Reads come from a
// real corpus root.
import { UNSET_DATUM } from "@orb/client/features/rpg";
import type { RpgStatProfile } from "@orb/contracts/rpg";
import { RPG_PROFILE_D20, rpgAttributeModifier, rpgNpcSlug, rpgTrackerDefSchema } from "@orb/contracts/rpg";
import type { ChatId, UserId } from "@orb/kit/ids";
import type { TrpcRoutes, TrpcWireOutput } from "@orb/testkit/ct";
import { routeTrpc } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { createCorpusHarness, seedRpgGame } from "@orb/testkit/node/composed";
import type { RpgContextTabStory, RpgDiceComposerStory } from "./_own-key-panels-stories.tsx";

const TAB_STORY = "tests/client/features/rpg/components/_own-key-panels-stories/RpgContextTabStory";
const DICE_STORY = "tests/client/features/rpg/components/_own-key-panels-stories/RpgDiceComposerStory";
/** The key the client mints from the host label: an inherited member of every plain object. */
const INHERITED_KEY = "constructor";
const LABEL = "Constructor";
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
  const viewer = await caller.sessions.me();
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
    reads: async (): Promise<Reads> => {
      const settings = await caller.settings.getUserSettings();
      const detail = await caller.chat.getChat({ chatId });
      const gameView = await caller.rpg.getGame({ chatId });
      const trackerView = await caller.rpg.getTrackerView({ chatId });
      const messages = await caller.chat.listMessages({ chatId });
      const reveal = await caller.rpg.revealHidden({ chatId });
      return {
        tracker: trackerView,
        routes: {
          "sessions.me": () => viewer,
          "settings.getUserSettings": () => settings,
          "chat.getChat": () => detail,
          "chat.listMessages": () => messages,
          "rpg.getGame": () => gameView,
          "rpg.getTrackerView": () => trackerView,
          "rpg.revealHidden": () => reveal,
        },
      };
    },
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
  await page.getByRole("button", { name: "Message tools", exact: true }).click();
  await page.getByRole("menuitem", { name: "Ability check", exact: true }).click();
  const unset = page.getByRole("menuitem", { name: LABEL, exact: false });
  await expect(unset).toHaveText(`${LABEL}Set your score in Status first.`);
  await expect(unset).toBeDisabled();
});

test("a set inherited-name attribute offers its ability check with the profile's modifier", async ({ mount, page }) => {
  await using root = await createCorpusHarness();
  const room = await gameRoom(root);
  await room.setInheritedValues();
  await routeTrpc(page, (await room.reads()).routes);
  await mount<typeof RpgDiceComposerStory>(DICE_STORY, { chatId: room.chatId });
  await page.getByRole("button", { name: "Message tools", exact: true }).click();
  await page.getByRole("menuitem", { name: "Ability check", exact: true }).click();
  const modifier = rpgAttributeModifier(room.profile, SCORE);
  await expect(page.getByRole("menuitem", { name: `${LABEL} (${modifier >= 0 ? "+" : ""}${modifier})`, exact: true })).toBeEnabled();
});

test("Status meters and the character takeover read an unset inherited-name key as unset, then its own values", async ({ mount, page }) => {
  await using root = await createCorpusHarness();
  const room = await gameRoom(root);
  // Every participant's meter on Status carries its name; the one-carrier takeover names its attribute cell and
  // meter bare, in that order.
  const statusMeters = page.getByRole("button", { name: new RegExp(` ${LABEL} value$`, "u") });
  const takeoverValues = page.getByRole("button", { name: `${LABEL} value`, exact: true });
  let reads = await room.reads();
  let seats = participants(reads, root.ownerId);
  await routeTrpc(page, reads.routes);
  const unset = await mount<typeof RpgContextTabStory>(TAB_STORY, { chatId: room.chatId, tab: "rpg.status" });
  await expect(statusMeters).toHaveText(Array.from({ length: seats.count }, () => UNSET_DATUM));
  await page.getByRole("button", { name: `Open ${seats.owner}`, exact: true }).click();
  await expect(takeoverValues).toHaveText([UNSET_DATUM, UNSET_DATUM]);
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
  const npcValue = page.getByRole("button", { name: `${NPC_NAME} ${LABEL} value`, exact: true });
  await routeTrpc(page, (await room.reads()).routes);
  const unset = await mount<typeof RpgContextTabStory>(TAB_STORY, { chatId: room.chatId, tab: "rpg.scene" });
  await page.getByRole("button", { name: "Show known characters", exact: true }).click();
  await expect(npcValue).toHaveText(UNSET_DATUM);
  await unset.unmount();

  await room.setInheritedValues();
  await routeTrpc(page, (await room.reads()).routes);
  await mount<typeof RpgContextTabStory>(TAB_STORY, { chatId: room.chatId, tab: "rpg.scene" });
  await page.getByRole("button", { name: "Show known characters", exact: true }).click();
  await expect(npcValue).toHaveText(String(TRACKER_VALUE));
});
