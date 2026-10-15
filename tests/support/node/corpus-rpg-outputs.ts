// Hand-result suppliers execute the real game/actor graph; no snapshot or successful verdict is synthesized.
import { createCharacterSchema } from "@orb/contracts/character";
import { rpgNpcSlug } from "@orb/contracts/rpg";
import type { ServerTestHarness } from "./server.ts";

type Caller = Awaited<ReturnType<ServerTestHarness["internalCallerFor"]>>;
interface CorpusRpgOutputs {
  readonly room: Awaited<ReturnType<Caller["chat"]["startChat"]>>;
  readonly created: Awaited<ReturnType<Caller["rpg"]["createGame"]>>;
  readonly born: Awaited<ReturnType<Caller["rpg"]["getGame"]>>;
  readonly missing: Awaited<ReturnType<Caller["rpg"]["promoteActor"]>>;
  readonly patched: Awaited<ReturnType<Caller["rpg"]["patchActor"]>>;
  readonly beforePromotion: Awaited<ReturnType<Caller["rpg"]["getTrackerView"]>>;
  readonly promoted: Awaited<ReturnType<Caller["rpg"]["promoteActor"]>>;
  readonly afterPromotion: Awaited<ReturnType<Caller["rpg"]["getTrackerView"]>>;
  readonly promotedRoom: Awaited<ReturnType<Caller["chat"]["getChat"]>>;
  readonly dismissed: Awaited<ReturnType<Caller["rpg"]["dismissActor"]>>;
  readonly afterDismissal: Awaited<ReturnType<Caller["rpg"]["getTrackerView"]>>;
  readonly dice: Awaited<ReturnType<Caller["rpg"]["rollDice"]>>;
  readonly reveal: Awaited<ReturnType<Caller["rpg"]["revealHidden"]>>;
  readonly withheld: Awaited<ReturnType<Caller["rpg"]["revealHidden"]>>;
  readonly config: Awaited<ReturnType<Caller["rpg"]["getConfigView"]>>;
  readonly checkpointId: Awaited<ReturnType<Caller["rpg"]["createCheckpoint"]>>;
  readonly checkpoints: Awaited<ReturnType<Caller["rpg"]["listCheckpoints"]>>;
  readonly resync: Awaited<ReturnType<Caller["rpg"]["resyncFromStory"]>>;
  readonly populate: Awaited<ReturnType<Caller["rpg"]["populateFromCharacter"]>>;
}

export const RPG_OUTPUT_SECRET = "orbital-game-truth";
const nameMax = createCharacterSchema.shape.name.maxLength;
if (nameMax === null) {
  throw new Error("native character input has no card-name bound for the promotion capture");
}
export const RPG_OUTPUT_NAME_MAX = nameMax;
export const RPG_OUTPUT_NAME = "A".repeat(RPG_OUTPUT_NAME_MAX + 1);

/** Preserve promotion/refusal, dice and host-only reveal outputs from actual player-authored canon. */
export async function seedCorpusRpgOutputs(root: ServerTestHarness): Promise<CorpusRpgOutputs> {
  const caller = await root.internalCallerFor(root.ownerId);
  const character = await caller.character.create({
    input: createCharacterSchema.parse({
      handle: "corpus-rpg-output",
      name: "Reveal witness",
      description: "A keeper preserves the orbital ledger.",
      greetings: [{ text: `The loom is quiet. <lie character="Reveal witness" type="secret" truth="${RPG_OUTPUT_SECRET}" reason="Protect the ledger"/>` }],
    }),
  });
  const room = await caller.chat.startChat({ characterIds: [character.id], opening: "first-message" });
  const chatId = room.chat.id;
  const scope = { chatId };
  const created = await caller.rpg.createGame({ ...scope, mode: "lite" });
  const born = await caller.rpg.getGame(scope);
  const targetRef = { kind: "npc", npcKey: rpgNpcSlug(RPG_OUTPUT_NAME) } as const;
  const missing = await caller.rpg.promoteActor({ ...scope, targetRef });
  const patched = await caller.rpg.patchActor({
    ...scope,
    targetRef,
    ops: [
      { op: "setIdentityText", field: "name", text: RPG_OUTPUT_NAME },
      { op: "addItem", item: { name: "Loom shuttle" } },
    ],
  });
  const beforePromotion = await caller.rpg.getTrackerView(scope);
  const promoted = await caller.rpg.promoteActor({ ...scope, targetRef });
  const afterPromotion = await caller.rpg.getTrackerView(scope);
  const promotedRoom = await caller.chat.getChat(scope);
  const promotedActor = afterPromotion.actors.find((actor) => actor.actorRef.kind === "character" && actor.actorRef.characterId !== character.id);
  if (promotedActor === undefined) {
    throw new Error("native promotion returned no new character actor");
  }
  const dismissed = await caller.rpg.dismissActor({ ...scope, targetRef: promotedActor.actorRef });
  const afterDismissal = await caller.rpg.getTrackerView(scope);
  const dice = await caller.rpg.rollDice({ ...scope, notation: "2d6+3" });
  const reveal = await caller.rpg.revealHidden(scope);
  await caller.rpg.updateConfig({ ...scope, patch: { hiddenContentReveal: false } });
  const withheld = await caller.rpg.revealHidden(scope);
  const config = await caller.rpg.getConfigView(scope);
  const checkpointId = await caller.rpg.createCheckpoint({ ...scope, label: "Promoted witness" });
  const checkpoints = await caller.rpg.listCheckpoints(scope);
  const resync = await caller.rpg.resyncFromStory(scope);
  const populate = await caller.rpg.populateFromCharacter({ ...scope, actorRef: { kind: "character", characterId: character.id } });
  return {
    room,
    created,
    born,
    missing,
    patched,
    beforePromotion,
    promoted,
    afterPromotion,
    promotedRoom,
    dismissed,
    afterDismissal,
    dice,
    reveal,
    withheld,
    config,
    checkpointId,
    checkpoints,
    resync,
    populate,
  };
}
