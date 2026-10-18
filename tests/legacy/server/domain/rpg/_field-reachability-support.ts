import type { RpgActorOp, RpgActorRef, RpgExtraction, RpgTrackerDef } from "@orb/contracts/rpg";
import { RPG_PROFILE_D20, rpgTrackerDefSchema } from "@orb/contracts/rpg";
import type { CharacterId, ChatId, ChatTurnId, Handle, RpgGameId, UserId } from "@orb/kit/ids";
import { castId, ID_PREFIX, mintTypeId } from "@orb/kit/ids";
import { freshDb } from "@orb/testkit/node/db.ts";
import type { RpgGatherResult } from "#server/domain/rpg/contract/params.ts";
import type { RpgParticipantActor } from "#server/domain/rpg/index.ts";
import { RPG_DELTA_HEADING } from "#server/domain/rpg/substrate/delta.ts";
import type { RpgHarness } from "./_support.ts";
import { expect, participantUser, principal, seedCharacter, seedLiteGame, seedMessage, seedUser, turnConnection } from "./_support.ts";

export { RPG_DELTA_HEADING, RPG_SCENE_OPENS_HEADING } from "#server/domain/rpg/substrate/delta.ts";

// ══════════════════════════════════════════════════════════════════════════════════════════════════════════
// THE HARNESS — one game, real verbs, real turns, the real gather.
// ══════════════════════════════════════════════════════════════════════════════════════════════════════════

export const HOST = principal(castId<Handle>("host"));

/** The absolute state block's heading (`buildLiteReminder`) — the block boundary the probes read against. */
const STATE_HEADING = "# Game state";

/** The CARRIER axis — the three kinds of actor the per-actor planes can hang on. Declared ONCE as a tuple and
 *  derived (the string-union dispatch discipline): the `CARRIERS` record below is mapped over it, so a fourth
 *  kind (full's `npc` ref arm) fails `tsc` here until the matrix runs it too. */
export const ACTOR_CARRIERS = ["user", "character", "npc"] as const;
type CarrierKind = (typeof ACTOR_CARRIERS)[number];

/** One CARRIER of the per-actor planes: a participant human (`user`), a participant character, or a scene-npc.
 *  `targetRef` is what the model writes; `label` is what BOTH read surfaces must name the carrier. */
export interface Carrier {
  readonly kind: CarrierKind;
  readonly label: string;
  readonly targetRef: string;
  readonly participants: readonly RpgParticipantActor[];
  readonly actorRef: RpgActorRef;
  /** An npc must be ON STAGE before a party/inventory write may name it (the R5 ghost guard). */
  readonly onStage: boolean;
}

/** A REAL minted character TypeID: the participant's readable `character_<key>` form is fabricated, and an
 *  `actorRef.characterId` is re-validated at the snapshot WRITE boundary — a fabricated id makes every
 *  character-carrier write silently drop (`onFlushDropped`), which would hide exactly what this suite hunts. */
const CHARACTER_ID: CharacterId = castId<CharacterId>(mintTypeId(ID_PREFIX.character));

export const CARRIERS: Readonly<Record<CarrierKind, Carrier>> = {
  user: {
    kind: "user",
    label: "You",
    targetRef: "You",
    participants: [participantUser(castId<Handle>("host"), "You")],
    actorRef: { kind: "user", userId: castId<UserId>("user_host") },
    onStage: false,
  },
  character: {
    kind: "character",
    label: "Kael",
    targetRef: "Kael",
    participants: [{ actorRef: { kind: "character", characterId: CHARACTER_ID }, name: "Kael" }],
    actorRef: { kind: "character", characterId: CHARACTER_ID },
    onStage: false,
  },
  npc: {
    kind: "npc",
    label: "Mari",
    targetRef: "Mari",
    participants: [],
    actorRef: { kind: "npc", npcKey: "mari" },
    onStage: true,
  },
};

export interface Fixture {
  readonly chatId: ChatId;
  readonly gameId: RpgGameId;
  readonly h: RpgHarness;
  readonly carrier: Carrier;
  /** Drive ONE beat: the model's extraction folded through the real applier onto a fresh assistant slot. */
  readonly beat: (extraction: Partial<RpgExtraction>) => Promise<void>;
  /** A HOST hand edit that stamps NO lock (`lockPaths: []`) — the seed door for fields no tool can write. */
  readonly handEdit: (patch: Record<string, unknown>) => Promise<void>;
  /** The same seed door for the per-ACTOR plane, which is op-shaped (R1 — `editSnapshot` refuses an
   *  `actorState` image). `autoLock:false` for the same reason `handEdit` passes `lockPaths: []`: these probes
   *  seed a value and then let the MODEL move it, so a pin would block the very write under test. */
  readonly handActorOps: (ops: readonly RpgActorOp[]) => Promise<void>;
  /** The reminder the gather would inject on the next turn (the model-facing text, verbatim). */
  readonly reminder: () => Promise<string>;
  /** The ABSOLUTE state block alone (`# Game state` … the next blank line) — what the model is told the world
   *  IS right now, with the delta's transition lines excluded (a field can be absent from the absolutes and
   *  still legitimately appear in a `-Bran leaves` line). */
  readonly stateBlock: () => Promise<string>;
  /** The delta block's line text (everything after the heading), or "" when the block was omitted. */
  readonly delta: () => Promise<string>;
  /** The preset-facing MACRO map the same gather stages (`rpgSceneState`/`rpgCast`/`rpgQuests`/`rpgDelta`). */
  readonly macros: () => Promise<Readonly<Record<string, string>>>;
}

/** The macro keys the lite feed stages (the full-mode keys are ABSENT by design ⇒ they resolve ""). Declared as
 *  a tuple + derived so a needle can never name a key the feed does not stage. */
export const RPG_MACRO_KEYS = ["rpgSceneState", "rpgCast", "rpgQuests", "rpgDelta"] as const;

/** An empty extraction — every plane present, so a probe spells only what it writes. */
function extraction(over: Partial<RpgExtraction>): RpgExtraction {
  return { party: [], inventory: [], trackers: [], quests: [], journal: [], ...over };
}

/** Open a real lite game in `cheap` delivery (the post-commit round vehicle the harness folds extractions
 *  through), with the carrier's participant status and the probe's tracker defs configured through the real verbs. */
export async function openGame(opts: { carrier: Carrier; trackers?: readonly RpgTrackerDef[]; d20?: boolean }): Promise<Fixture> {
  const db = await freshDb();
  // `rpg_sheets` FKs both actor identities, so a `patchSheet` on either participant carrier needs the real row.
  const ownerId = await seedUser(db, castId<Handle>("host"));
  await seedCharacter(db, ownerId, "kael", { id: CHARACTER_ID });
  const { chatId, gameId, h } = await seedLiteGame(db, { participants: [...opts.carrier.participants] });
  await h.service.updateConfig({
    principal: HOST,
    chatId,
    extractionMode: "cheap",
    patch: {
      ...(opts.trackers !== undefined ? { trackers: [...opts.trackers] } : {}),
      ...(opts.d20 === true ? { statProfile: RPG_PROFILE_D20 } : {}),
    },
  });
  let seq = 0;
  const gather = async (): Promise<RpgGatherResult | null> =>
    h.chatOps.gatherTurnContext({ chatId, pendingUserText: undefined, respondsToLatestUserTurn: false, funderUserId: HOST.userId });
  const reminder = async (): Promise<string> => (await gather())?.injections[0]?.content ?? "";
  return {
    chatId,
    gameId,
    h,
    carrier: opts.carrier,
    beat: async (over: Partial<RpgExtraction>): Promise<void> => {
      seq += 1;
      h.fakes.extractions.push(extraction(over));
      const { messageId, variantId } = await seedMessage(db, chatId, seq, { role: "assistant" });
      await h.chatOps.onTurnCompleted(chatId, messageId, variantId, castId<ChatTurnId>(`chat_turn_${seq}`), turnConnection());
    },
    // BOTH hand doors assert their `HandDoorResult` in the house grammar (`hand-edit-vs-flush.suite`'s
    // `.resolves.toEqual({ ok: true })`): the verbs are ERRORS-AS-DATA, so a refusal RESOLVES and a discarded
    // result makes the whole probe vacuous — the state simply never moved and every downstream expectation
    // reads a world the edit never touched. `toEqual` over `expect(result.ok).toBe(true)` because the refusal
    // arm carries the `reason` sentence, and the diff prints it instead of "expected false to be true".
    handEdit: async (patch: Record<string, unknown>): Promise<void> => {
      await expect(h.service.editSnapshot({ principal: HOST, chatId, patch, lockPaths: [] })).resolves.toEqual({ ok: true });
    },
    handActorOps: async (ops: readonly RpgActorOp[]): Promise<void> => {
      await expect(h.service.patchActor({ principal: HOST, chatId, targetRef: opts.carrier.actorRef, ops, autoLock: false })).resolves.toEqual({ ok: true });
    },
    reminder,
    stateBlock: async (): Promise<string> => {
      const content = await reminder();
      return content.startsWith(STATE_HEADING) ? (content.split("\n\n")[0] ?? "") : "";
    },
    delta: async (): Promise<string> => {
      const content = await reminder();
      const at = content.indexOf(`${RPG_DELTA_HEADING}: `);
      return at === -1 ? "" : (content.slice(at + RPG_DELTA_HEADING.length + 2).split("\n\n")[0] ?? "");
    },
    macros: async (): Promise<Readonly<Record<string, string>>> => (await gather())?.macros ?? {},
  };
}

/** Put a cast carrier on stage (the ghost guard) — a no-op for a participant carrier. */
export function stageCast(carrier: Carrier): Partial<RpgExtraction> {
  return carrier.onStage ? { scene: { presentUpsert: [{ name: carrier.targetRef }] } } : {};
}

/** The OPENING beat a hand-edit probe needs: it puts the carrier on stage AND writes one real plane, so the
 *  flush actually persists a snapshot. A hand edit on a TURNLESS game clones forward onto a fresh narrator
 *  slot instead (a state anchor at a LATER seq than the test's own beats), which would silently invert the
 *  lineage the delta reads — the edit must land IN PLACE on the live uncommitted head. */
export function openingBeat(carrier: Carrier): Partial<RpgExtraction> {
  return { scene: withStage(carrier, { location: "The Ford" }) };
}

/** Merge a cast carrier's on-stage upsert into a scene patch (both arms ride ONE `scene` object). */
function withStage(carrier: Carrier, scene: NonNullable<RpgExtraction["scene"]>): NonNullable<RpgExtraction["scene"]> {
  return carrier.onStage ? { ...scene, presentUpsert: [{ name: carrier.targetRef }, ...(scene.presentUpsert ?? [])] } : scene;
}

export const MANA: RpgTrackerDef = rpgTrackerDefSchema.parse({
  key: "mana",
  label: "Mana",
  shape: "meter",
  write: "delta",
  subject: "actor",
  max: 10,
  hint: "fuels spellcasting",
});
