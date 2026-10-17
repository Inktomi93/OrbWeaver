// COMPOSED-REAL: the server graph loads in the untimed IMPORT phase, never inside the first test's timeout (#2386 — support/node/composed-real.ts).
// @subject packages/server/src/domain/rpg/tools/rounds/populate.ts
import { FROZEN_AT_MS } from "@orb/testkit/iso/clock.ts";
import "@orb/testkit/node/composed-real.ts";
// entry/compose/rpg — populate-from-character (the real round and its slotted prose) and the host handoff of a gmPresetId.

import { DEFAULT_PROMPT_CONFIG } from "@orb/contracts/preset";
import { characters, presets } from "@orb/db";
import type { ChatResult, ResolveOutcome } from "@orb/inference";
import type { ChatId, Handle, ModelId, PresetId, UserId } from "@orb/kit/ids";
import { castId, ID_PREFIX, mintTypeId } from "@orb/kit/ids";
import { createResolveViewerVisibility } from "@orb/server/domain/chat";
import { makeCapability, makeGenerationCapability } from "@orb/testkit/node/factories/resolved-connection.ts";
import { expect, test } from "@orb/testkit/node/fixtures.ts";
import { eq } from "drizzle-orm";
import { findGameByChat } from "#server/domain/rpg/persistence/games.ts";
import { makeResolved } from "../../../inference/_support.ts";
import { seedCharacter, seedChat, seedMessage, seedParticipant, seedUser } from "../../domain/chat/_support.ts";
import { buildCannedRpgWithText, buildRpg, CANNED_POPULATE, emptySpy, hostPrincipal, seedHostGameChat } from "./_rpg-support.ts";

test("POPULATE (real round): the card's identity + gear land, and the live-play planes it volunteered do NOT", async ({ app, db }) => {
  const { chatId, hostId } = await seedHostGameChat(db, "populate");
  // A real CARD the host owns, with prose the corpus read renders, seated in the room.
  // A REAL minted TypeID: the snapshot write re-validates the volatile `actorRef`, so a fabricated
  // `character_<key>` id would be dropped at the F1 backstop and the gear would silently vanish.
  const characterId = await seedCharacter(db, hostId, "mira", { id: mintTypeId(ID_PREFIX.character) });
  await db.update(characters).set({ description: "A warden of a fallen house, sworn to a dead name." }).where(eq(characters.id, characterId));
  await seedParticipant(db, { chatId, key: "populate_char", characterId, joinSeq: 1 });
  // The room's OPENING line (the first canon slot) — the second half of the corpus.
  await seedMessage(db, chatId, 1, { role: "assistant", content: "You meet Mira at the ford, her cloak heavy with rain." });

  const spy = emptySpy();
  const rpgCompose = buildCannedRpgWithText({ app, db, api: "chat-completions", spy, cannedText: JSON.stringify(CANNED_POPULATE) });
  await rpgCompose.service.createGame({ principal: hostPrincipal(hostId), chatId, mode: "lite" });

  const verdict = await rpgCompose.service.populateFromCharacter({ principal: hostPrincipal(hostId), chatId, actorRef: { kind: "character", characterId } });

  // POPLOUD — the REAL round reports its ending as data: this one filled (the client's success signal).
  expect(verdict).toEqual({ ok: true, populated: true });
  // The round rode the `structured` dispatcher (a non-agent-sdk wire) with the POPULATE grammar: the sheet
  // plane is REQUIRED (the xgrammar lever) and the one target is the whole inventory ref enum.
  expect(spy.summarizeModels).toEqual(["fake-chat-model"]);
  // @orb-waive no-test-fabrication({): baselined when the gate widened to value casts; burn-down item 906.
  const schema = spy.schemas[0] as {
    required?: string[];
    properties: { sheet: { required?: string[] }; inventory: { items: { properties: { targetRef: { enum?: string[] } } } } };
  };
  expect(schema.required).toContain("sheet");
  expect((schema.properties.sheet.required ?? []).toSorted()).toEqual(["level", "title"]);
  expect(schema.properties.inventory.items.properties.targetRef.enum).toEqual(["mira"]);
  // The prompt carried BOTH halves of the corpus — the card prose and the room's opening line.
  expect(spy.userPrompts[0]).toContain("sworn to a dead name");
  expect(spy.userPrompts[0]).toContain("her cloak heavy with rain");

  const view = await rpgCompose.service.getTrackerView({ principal: hostPrincipal(hostId), chatId });
  const actor = view.actors.find((a) => a.name === "mira");
  // The WIRE said `title`; the SHEET stores `className` (the one mapping, at the parse seam).
  expect(actor?.sheet.className).toBe("Warden of House Vane");
  expect(actor?.sheet.level).toBe(3);
  expect(actor?.volatile?.inventory.map((i) => i.name)).toEqual(["Bone key"]);
  expect(actor?.volatile?.wallet).toEqual([{ name: "gold", amount: 20 }]);
  expect(view.quests.map((q) => q.name)).toEqual(["Reach the Vault of Ash"]);
  // …and NOTHING the live-play planes volunteered landed: no scene move, no hp write, no journal beat.
  expect(view.ambient?.location ?? "").toBe("");
  expect(actor?.volatile?.trackerValues["hp"] ?? null).toBeNull();
  expect(await rpgCompose.service.listJournal({ principal: hostPrincipal(hostId), chatId, limit: 50 })).toEqual([]);
});

test("POPULATE (real round): a connection with NO structured writer runs no round at all (honest no-op)", async ({ app, db }) => {
  const { chatId, hostId } = await seedHostGameChat(db, "populate-readonly");
  const characterId = await seedCharacter(db, hostId, "vesna", { id: mintTypeId(ID_PREFIX.character) });
  await seedParticipant(db, { chatId, key: "populate_ro_char", characterId, joinSeq: 1 });
  const spy = emptySpy();
  const rpgCompose = buildRpg({
    db,
    now: () => FROZEN_AT_MS,
    rpgChatOps: app.chatRpgOps,
    // #1528 - the member-facing reads' projection verdict, built off the same db (chat's ONE clamp home).
    resolveViewerVisibility: createResolveViewerVisibility({ db }),
    connection: {
      // Tools but NO structured output — the populate round's own capability gate must refuse it.
      resolve: (): Promise<ResolveOutcome> =>
        Promise.resolve({
          resolved: makeResolved({
            api: "chat-completions",
            model: castId<ModelId>("fake-chat-model"),
            capability: makeCapability(
              makeGenerationCapability({ output: { maxTokens: { min: 1, max: 4096 }, structured: false, modalities: ["text"] }, tools: { parallel: true } }),
            ),
          }),
          warnings: [],
        }),
    },
    executor: {
      runChatTurn: (req): Promise<ChatResult> => {
        if (req.posture === "side-gen") {
          spy.summarizeModels.push(req.connection.model);
        } else {
          spy.chatTurns.push({ model: "fake-chat-model", hasResponseFormat: false, hasToolServer: false });
        }
        // @orb-waive no-test-fabrication(unknown): this arm must never fire on this test — a minimal double proves it by staying unused. Ends when this deliberate test boundary can be expressed without a fabricated typed value.
        return Promise.resolve({ reply: "{}", events: [] } as unknown as ChatResult);
      },
    },
    resolveHostPrincipal: (userId) => Promise.resolve(hostPrincipal(userId)),
    resolvePresetOwned: () => Promise.resolve(false),
    copyPresetToUser: () => Promise.resolve(null),
    toolUse: { register: () => undefined },
    // R4 promotion deps — these tests exercise state rounds, never the mint; loud if ever reached.
    character: {
      create: () => Promise.reject(new Error("unused: promotion not exercised")),
      findByHandle: () => Promise.resolve(null),
      findByImportHash: () => Promise.resolve(null),
    },
    chat: { addCharacterToChat: () => Promise.reject(new Error("unused: promotion not exercised")) },
    // D126 — the admin-tier structured-output shape, on its shipped floor (the real root reads it per call off
    // `getEffectiveConfig()`); the strict-arm pin below overrides it.
  });
  await rpgCompose.service.createGame({ principal: hostPrincipal(hostId), chatId, mode: "lite" });

  const verdict = await rpgCompose.service.populateFromCharacter({ principal: hostPrincipal(hostId), chatId, actorRef: { kind: "character", characterId } });

  // POPLOUD — the REAL compose op REFUSES legibly instead of degrading to an empty delta the verb could only
  // read as "this card had nothing to fill". The host reads this sentence; the `rpg.populate.readonly` warn is
  // the log half of the same branch.
  expect(verdict).toEqual({ ok: false, reason: expect.stringContaining("can't write structured state") });
  // NO model call was paid on a wire that could only have produced garbage, and nothing was written.
  expect(spy.summarizeModels).toEqual([]);
  expect(spy.chatTurns).toEqual([]);
  const view = await rpgCompose.service.getTrackerView({ principal: hostPrincipal(hostId), chatId });
  expect(view.actors.find((a) => a.name === "vesna")?.sheet.className).toBe("");
  // …and the panel says so honestly: the born-state button is disabled on this connection.
  const game = await rpgCompose.service.getGame({ principal: hostPrincipal(hostId), chatId });
  expect(game.canPopulate).toBe(false);
});

// ── PROSE-1 POPULATE: the born-state round's own prose is SLOTTED, and its bytes did not move ─────────
// The populate census rows 1-7 — the round's system header, its
// inline IDENTITY clause, the invent-nothing doctrine, and the four user-turn labels — stopped being source
// constants and became `rpg.populate.*` slot rows resolved against the GM PRESET's `promptConfig.prose`.
//
// THE FIXTURES BELOW ARE THE RENDERED BYTES AT `5f7cd8d843`+HEAD-BEFORE-THE-MIGRATION, captured by running
// these two tests against the pre-migration source. They are the graduation bar for this class: a migration
// that changes the SOURCE of the bytes must not change the bytes, and the composed prompt is the only place
// where "the slot resolved" and "the model was told it" are the same fact. Per-slot `.text` comparison would
// have passed while a lost `\n\n` join silently changed every born-state prompt.
const POPULATE_SYSTEM_BYTES = `You are reading a role-play character's CARD and the story's OPENING scene to fill in what that character starts the game with. This runs ONCE, before the character has played: you are establishing their sheet and the gear, coin, and goals they walked in with — not reacting to any beat. Output ONE JSON object.

IDENTITY — sheet.title is this character's TITLE or class as the card presents them ("Warden of House Vane", "hedge-witch"), short and in the card's own voice; sheet.level is their starting level as a whole number — 1 unless the card explicitly establishes a veteran standing.
INVENTORY — inventory: items gained, changed, or lost (add/update/remove) and currency (walletDeltas — named currencies, e.g. gold). Compare every existing item in CURRENT TRACKED STATE with the latest beat: if its description, quantity, or carrying location changed, update it even when Scene or Journal also mentions the change. A beat where anyone buys, takes, pockets, receives, or stows something ALWAYS calls update_inventory with an add — an EMPTY pack is never a reason to skip; first acquisitions are exactly what add exists for. INFER what a character has on them from what the story showed — recording an item the story established (a key pocketed three turns ago) is NOT inventing.
QUESTS — quests: a new or advancing quest (name + action create/update/complete/fail, with objectives). To mark an objective DONE, name its text in completeObjectives — do NOT restate the objective list to report progress. Send objectives only to CHANGE the list itself (adding a newly-revealed step); the lines you repeat keep the progress already recorded against them. Reconcile a quest the story resolved (mark it complete/fail) even if a later beat stopped mentioning it.
Record ONLY what the character card and the opening scene actually establish or plainly imply — the gear they are described carrying, the coin their station implies, the goals their background already gives them. If the card says nothing about a plane, leave it empty. Do NOT invent adventuring loot, quest chains, or a purse the character has no reason to carry.`;

const POPULATE_USER_BYTES = `CHARACTER CARD — bly:
DESCRIPTION:
A ferryman who has never once been paid in coin.

OPENING SCENE (how the story begins):
The ford runs black under a sky that has forgotten the sun.

Write everything for targetRef "bly" — this round fills exactly this one character.`;

/** The EMPTY-CARD / NO-OPENING complement: the fallback sentence stands in for a blank card, and the opening
 *  block is absent entirely rather than rendered with nothing under it. Half the user-turn slots are only
 *  reachable on this arm, which a single maximal fixture cannot cover. */
const POPULATE_USER_BYTES_BARE = `CHARACTER CARD — nix:
(the card carries no written description)

Write everything for targetRef "nix" — this round fills exactly this one character.`;

test("PROSE-1 POPULATE: the round's system + user prompts are byte-identical to the pre-slot composition", async ({ app, db }) => {
  const { chatId, hostId } = await seedHostGameChat(db, "populate-bytes");
  const characterId = await seedCharacter(db, hostId, "bly", { id: mintTypeId(ID_PREFIX.character) });
  await db.update(characters).set({ description: "A ferryman who has never once been paid in coin." }).where(eq(characters.id, characterId));
  await seedParticipant(db, { chatId, key: "populate_bytes_char", characterId, joinSeq: 1 });
  await seedMessage(db, chatId, 1, { role: "assistant", content: "The ford runs black under a sky that has forgotten the sun." });

  const spy = emptySpy();
  const compose = buildCannedRpgWithText({ app, db, api: "chat-completions", spy, cannedText: "{}" });
  await compose.service.createGame({ principal: hostPrincipal(hostId), chatId, mode: "lite" });

  await compose.service.populateFromCharacter({ principal: hostPrincipal(hostId), chatId, actorRef: { kind: "character", characterId } });

  expect(spy.systemPrompts[0]).toBe(POPULATE_SYSTEM_BYTES);
  expect(spy.userPrompts[0]).toBe(POPULATE_USER_BYTES);
});

test("PROSE-1 POPULATE: a blank card and an empty room render the fallback arm byte-identically", async ({ app, db }) => {
  const { chatId, hostId } = await seedHostGameChat(db, "populate-bytes-bare");
  const characterId = await seedCharacter(db, hostId, "nix", { id: mintTypeId(ID_PREFIX.character) });
  await seedParticipant(db, { chatId, key: "populate_bare_char", characterId, joinSeq: 1 });

  const spy = emptySpy();
  const compose = buildCannedRpgWithText({ app, db, api: "chat-completions", spy, cannedText: "{}" });
  await compose.service.createGame({ principal: hostPrincipal(hostId), chatId, mode: "lite" });

  await compose.service.populateFromCharacter({ principal: hostPrincipal(hostId), chatId, actorRef: { kind: "character", characterId } });

  expect(spy.userPrompts[0]).toBe(POPULATE_USER_BYTES_BARE);
});

test("PROSE-1 POPULATE: a GM-preset override reaches every one of the round's SEVEN slots, tokens and all", async ({ app, db }) => {
  // The half a byte-identity fixture cannot prove: the bytes now have a HOST-EDITABLE source. Driven through
  // the same HOST-DOOR ladder the resync pin uses (the GM-voice preset REDIRECT, then the owner-scoped read),
  // and asserted on the rendered prompts the wire carried — the only place "the host edited it" and "the model
  // was told it" are the same fact. The blank-card slot is exercised by giving the character no description.
  const { chatId, hostId } = await seedHostGameChat(db, "populate-prose-override");
  const principal = hostPrincipal(hostId);
  const characterId = await seedCharacter(db, hostId, "vail", { id: mintTypeId(ID_PREFIX.character) });
  await seedParticipant(db, { chatId, key: "populate_override_char", characterId, joinSeq: 1 });
  await seedMessage(db, chatId, 1, { role: "assistant", content: "Rain on the ferry deck." });

  const presetId = castId<PresetId>("preset_prose_populate");
  await db.insert(presets).values({
    id: presetId,
    ownerId: hostId,
    name: "table voice",
    kind: "user",
    config: {
      ...DEFAULT_PROMPT_CONFIG,
      prose: {
        "rpg.populate.systemHeader": { text: "HOUSE RULE: read the card, fill the sheet.", baseVersion: 1 },
        "rpg.populate.identity": { text: "HOUSE RULE: titles are earned, never claimed.", baseVersion: 1 },
        "rpg.populate.doctrine": { text: "HOUSE RULE: when in doubt, leave it blank.", baseVersion: 1 },
        "rpg.populate.cardBlock": { text: "THE CARD OF {{cardName}} >>\n{{cardBody}}", baseVersion: 1 },
        "rpg.populate.emptyCard": { text: "(this card is blank at our table)", baseVersion: 1 },
        "rpg.populate.openingBlock": { text: "HOW IT STARTS >>\n{{opening}}", baseVersion: 1 },
        "rpg.populate.targetLine": { text: "Fill only {{targetRef}}.", baseVersion: 1 },
      },
    },
    createdAt: FROZEN_AT_MS,
    updatedAt: FROZEN_AT_MS,
  });

  const spy = emptySpy();
  const compose = buildCannedRpgWithText({ app, db, api: "chat-completions", spy, cannedText: "{}" });
  await compose.service.createGame({ principal, chatId, mode: "lite" });
  await compose.service.updateConfig({ principal, chatId, gmPresetId: presetId });

  await compose.service.populateFromCharacter({ principal, chatId, actorRef: { kind: "character", characterId } });

  const system = spy.systemPrompts[0] ?? "";
  expect(system).toContain("HOUSE RULE: read the card, fill the sheet.");
  expect(system).toContain("HOUSE RULE: titles are earned, never claimed.");
  expect(system).toContain("HOUSE RULE: when in doubt, leave it blank.");
  // …and the shipped defaults are GONE, not merely joined (two rungs, never a cascade).
  expect(system).not.toContain("Output ONE JSON object.");
  expect(system).not.toContain("sheet.title is this character's TITLE");
  expect(system).not.toContain("Do NOT invent adventuring loot");
  // The two born-state PLANE fragments still ship their defaults in the same composition — an edit to the
  // round's own framing is surgical, not a fork of the whole prompt.
  expect(system).toContain("INVENTORY — inventory: items gained, changed, or lost");

  // The user turn: every block re-framed, and each PRE-SUBSTITUTION token still carries its per-call value.
  expect(spy.userPrompts[0]).toBe(
    ["THE CARD OF vail >>\n(this card is blank at our table)", "HOW IT STARTS >>\nRain on the ferry deck.", "Fill only vail."].join("\n\n"),
  );
});

// HOST HANDOFF × the GM-voice knob (stickler 2026-08-03 F1) — the COMPOSED-REAL wiring proof for the heal that
// mirrors `resolveForkGmPreset`. `chat.acceptHostHandoff` moves room authority; `rpg_games.gmPresetId` is then
// resolved under the NEW host (`resolvePresetOverride` → the owner-scoped `preset.get`), so a preset the new
// host cannot read is a dead knob: the GM voice silently degrades to their default while `getConfigView` keeps
// serving an unreadable id. Driven through the REAL services graph (chat's verb, rpg's injected op, the real
// `resolvePresetOwned`) — a stubbed seam here would be exactly the [compose-stub-goes-stale] lie.
test("HOST HANDOFF nulls a gmPresetId the new host cannot read, and keeps one they own (composed-real)", async ({ services, db }) => {
  // The chat ids are REAL minted TypeIDs: the notifications `record` this flow delivers (`handoff-nominated` /
  // `handoff-accepted`) re-parses `chatId` through the TypeID schema, which the readable `chat_<key>` seed fails.
  const nominee = await seedUser(db, castId<Handle>("hoffnominee"));
  const seedPreset = async (id: string, ownerId: UserId): Promise<PresetId> => {
    const presetId = castId<PresetId>(id);
    await db
      .insert(presets)
      .values({ id: presetId, ownerId, name: id, kind: "user", config: DEFAULT_PROMPT_CONFIG, createdAt: FROZEN_AT_MS, updatedAt: FROZEN_AT_MS });
    return presetId;
  };
  /** A game room whose GM knob points at `presetOwner`'s preset, with the nominee seated + nominated. */
  const seedHandoffGame = async (key: string, presetOwner: "host" | "nominee"): Promise<{ chatId: ChatId; presetId: PresetId }> => {
    const hostId = await seedUser(db, castId<Handle>(`${key}host`));
    const chatId = await seedChat(db, key, { id: mintTypeId(ID_PREFIX.chat) });
    await seedParticipant(db, { chatId, key: `${key}host`, userId: hostId, role: "host", joinSeq: 0 });
    await seedParticipant(db, { chatId, key: `${key}nominee`, userId: nominee, role: "member", joinSeq: 0 });
    const presetId = await seedPreset(`preset_${key}`, presetOwner === "host" ? hostId : nominee);
    await services.rpg.createGame({ principal: hostPrincipal(hostId), chatId, mode: "lite" });
    await services.rpg.updateConfig({ principal: hostPrincipal(hostId), chatId, gmPresetId: presetId });
    await services.chat.nominateHostHandoff({ principal: hostPrincipal(hostId), chatId, userId: nominee });
    return { chatId, presetId };
  };

  const foreign = await seedHandoffGame("hoffforeign", "host");
  const owned = await seedHandoffGame("hoffowned", "nominee");

  await services.chat.acceptHostHandoff({ principal: hostPrincipal(nominee), chatId: foreign.chatId });
  await services.chat.acceptHostHandoff({ principal: hostPrincipal(nominee), chatId: owned.chatId });

  // The old host's private preset no longer rides the new host's turns — and the knob stops lying.
  expect((await findGameByChat(db, foreign.chatId))?.gmPresetId).toBeNull();
  expect((await services.rpg.getConfigView({ principal: hostPrincipal(nominee), chatId: foreign.chatId })).gmPresetId).toBeNull();
  // A knob the new host CAN read is untouched — the heal is conditional, never a blanket clear.
  expect((await findGameByChat(db, owned.chatId))?.gmPresetId).toBe(owned.presetId);
});
