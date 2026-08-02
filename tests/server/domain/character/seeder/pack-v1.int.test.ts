// seeder: the v2 card-pack RESEED MIGRATION — an install that already latched `defaultCharactersSeeded`
// under the v1 pack still gets the v2 pack, without ever stomping a card the user touched.
//
// The oracle for "untouched" is an INDEPENDENTLY TRANSCRIBED copy of the shipped v1 Assistant card
// (`V1_ASSISTANT_CONTENT` below, lifted verbatim from `cards.ts` @ dfc32628) — deliberately NOT imported
// from the source fixture, so this suite also catches the source fixture drifting off the real v1 prose (a
// drifted fixture would silently match NOTHING and the migration would become a no-op nobody noticed).
//
// Covers: unedited v1 assistant → re-dressed to Charlotte (prose + presentation + avatar through the SAME
// storeAvatar callback); an edited v1 assistant → untouched (name/prose/look/avatar all survive); the v2
// net-new cards land on the migrated library; a card the pack never shipped (Rev) survives; the version
// stamp makes a re-run a no-op even from a cold seeder instance.

import type { Greeting } from "@orb/contracts/character";
import type { Principal } from "@orb/contracts/identity";
import type { AssetId, CharacterId, UserId } from "@orb/kit/ids";
import type { CharacterService, UpdateCharacterParams } from "@orb/server/domain/character";
import { createCharacterService, createDefaultCharacterSeeder, DEFAULT_CHARACTER_CARDS, WELCOME_ASSISTANT_HANDLE } from "@orb/server/domain/character";
import { describe } from "vitest";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures";
import { makeHarness, principal, seedAsset, seedUser } from "../_support.ts";

/** The v1 Assistant card's authored content, transcribed from `seeder/cards.ts` at commit dfc32628 (the
 *  last v1 pack). This is the migration's edit-detection oracle — see the header note. */
const V1_ASSISTANT_CONTENT = {
  description:
    "{{char}} is the resident assistant of this orbweaver deployment — a calm, capable, slightly dry AI who treats every question as worth answering properly. {{char}} gives direct answers first and caveats second, asks for missing context instead of guessing, and never pads a reply with filler enthusiasm. Equally comfortable drafting prose, debugging an idea, planning a campaign, or just talking through whatever {{user}} is chewing on.",
  personality:
    "Composed, precise, quietly warm. Allergic to corporate cheerfulness. Prefers one good answer over three hedged ones. Admits uncertainty plainly and says so before speculating.",
  scenario: "{{char}} lives on the home screen of {{user}}'s orbweaver instance, ready whenever {{user}} opens the app.",
  greetings: [
    {
      text: "Hey, {{user}}. I'm your Assistant — if you're connected to an API, try asking me something. Drafting, brainstorming, code, worldbuilding, or just thinking out loud: all fair game.\n\nWhen you'd rather be greeted by someone else, open any character's editor and pick **Set / Unset as Welcome Page Assistant** from the More… menu.",
    },
  ] satisfies Greeting[],
  exampleMessages:
    "<START>\n{{user}}: Can you actually help with anything or are you just a landing page?\n{{char}}: Both, technically. The landing page part is decorative; the help part is real. Give me a task — a paragraph to tighten, a plan to poke holes in, a question you've been circling — and I'll show you the difference.",
  creatorNotes:
    "Default welcome assistant seeded by orbweaver on first run. Modeled on SillyTavern's welcome-screen assistant; safe to edit, replace, or delete — it won't come back unless you reset the onboarding flag.",
} as const;

const CHARLOTTE = DEFAULT_CHARACTER_CARDS.find((c) => c.input.handle === WELCOME_ASSISTANT_HANDLE);
const REDRESSED_AVATAR = "asset_charlotte_art" as AssetId;

/** The v1 seeder's own create input for the Assistant, so the test builds the pre-migration row the way the
 *  old pack built it (v1 authored exactly these fields; everything else was schema default). */
function v1AssistantInput(overrides: { readonly description?: string; readonly name?: string } = {}): Parameters<CharacterService["create"]>[0]["input"] {
  return {
    handle: WELCOME_ASSISTANT_HANDLE,
    name: overrides.name ?? "Assistant",
    description: overrides.description ?? V1_ASSISTANT_CONTENT.description,
    personality: V1_ASSISTANT_CONTENT.personality,
    scenario: V1_ASSISTANT_CONTENT.scenario,
    greetings: [...V1_ASSISTANT_CONTENT.greetings],
    exampleMessages: V1_ASSISTANT_CONTENT.exampleMessages,
    systemPrompt: null,
    postHistoryInstructions: null,
    creatorNotes: V1_ASSISTANT_CONTENT.creatorNotes,
    avatarAssetId: null,
  };
}

interface PackLatch {
  readonly isSeeded: (p: Principal) => Promise<boolean>;
  readonly markSeeded: (p: Principal, id: CharacterId | null) => Promise<void>;
  readonly readPackVersion: (p: Principal) => Promise<number>;
  readonly markPackVersion: (p: Principal, version: number) => Promise<void>;
  readonly stamps: number[];
}

/** In-memory stand-in for the onboarding latch + the pack-version stamp. `seededAt` pre-loads the store as a
 *  user who ALREADY ran the v1 seed (latch true, version 0 = the pre-stamp cohort). */
function packLatch(seededUsers: readonly UserId[] = []): PackLatch {
  const seeded = new Set<UserId>(seededUsers);
  const versions = new Map<UserId, number>();
  const stamps: number[] = [];
  return {
    stamps,
    isSeeded: (p): Promise<boolean> => Promise.resolve(seeded.has(p.userId)),
    markSeeded: (p): Promise<void> => {
      seeded.add(p.userId);
      return Promise.resolve();
    },
    readPackVersion: (p): Promise<number> => Promise.resolve(versions.get(p.userId) ?? 0),
    markPackVersion: (p, version): Promise<void> => {
      versions.set(p.userId, version);
      stamps.push(version);
      return Promise.resolve();
    },
  };
}

const noopAttach = (): Promise<boolean> => Promise.resolve(true);

describe("createDefaultCharacterSeeder — v2 pack reseed migration", () => {
  test("the shipped v1 fixture has not drifted off the real v1 assistant card", async () => {
    const { PRIOR_PACK_CONTENT } = await import("@orb/server/domain/character");
    expect(PRIOR_PACK_CONTENT[WELCOME_ASSISTANT_HANDLE]).toEqual({ name: "Assistant", nickname: null, ...V1_ASSISTANT_CONTENT });
  });

  test("an UNEDITED v1 assistant is re-dressed to the v2 welcome card (prose + presentation + avatar)", async () => {
    const db = await freshDb();
    const svc = createCharacterService(makeHarness(db).ctx);
    const owner = await seedUser(db, { handle: "owner" });
    const actor = principal(owner);
    await seedAsset(db, { id: REDRESSED_AVATAR, ownerId: owner, hash: "hash_charlotte" });

    // The pre-migration library: the v1 pack's Assistant + a v1 card the v2 pack dropped (user data).
    const before = await svc.create({ principal: actor, input: v1AssistantInput() });
    await svc.create({ principal: actor, input: { handle: "rev-card-refinery", name: "Rev", description: "the v1 card-surgeon" } });

    const latch = packLatch([owner]);
    const avatarCalls: string[] = [];
    const seeder = createDefaultCharacterSeeder({
      characters: svc,
      attachCardTag: noopAttach,
      storeAvatar: (_p, handle): Promise<AssetId | null> => {
        avatarCalls.push(handle);
        return Promise.resolve(handle === WELCOME_ASSISTANT_HANDLE ? REDRESSED_AVATAR : null);
      },
      ...latch,
    });

    await seeder.ensureSeeded(actor);

    const detail = await svc.get({ principal: actor, characterId: before.id });
    expect(detail.name).toBe(CHARLOTTE?.input.name);
    expect(detail.description).toBe(CHARLOTTE?.input.description);
    expect(detail.personality).toBe(CHARLOTTE?.input.personality);
    expect(detail.greetings).toEqual(CHARLOTTE?.input.greetings);
    expect(detail.exampleMessages).toBe(CHARLOTTE?.input.exampleMessages);
    expect(detail.creatorNotes).toBe(CHARLOTTE?.input.creatorNotes);
    // Presentation + the avatar, both through the ordinary seeded paths.
    expect(detail.themeOverride).toEqual(CHARLOTTE?.presentation.themeOverride);
    expect(detail.backgroundOverride?.seededId).toBe(`${WELCOME_ASSISTANT_HANDLE}-bg`);
    expect(detail.avatarAssetId).toBe(REDRESSED_AVATAR);
    expect(avatarCalls).toContain(WELCOME_ASSISTANT_HANDLE);

    // The rest of the v2 pack landed, and the dropped v1 card is still the user's.
    const handles = new Set((await svc.list({ principal: actor })).items.map((c) => c.handle));
    for (const card of DEFAULT_CHARACTER_CARDS) {
      expect(handles.has(card.input.handle), `${card.input.handle} present after migration`).toBe(true);
    }
    expect(handles.has("rev-card-refinery"), "the dropped v1 card survives").toBe(true);
    expect(latch.stamps.at(-1)).toBeGreaterThan(0);
  });

  test("an EDITED v1 assistant is left completely untouched (prose, name, look, avatar)", async () => {
    const db = await freshDb();
    const svc = createCharacterService(makeHarness(db).ctx);
    const owner = await seedUser(db, { handle: "owner" });
    const actor = principal(owner);
    await seedAsset(db, { id: REDRESSED_AVATAR, ownerId: owner, hash: "hash_charlotte" });

    const edited = `${V1_ASSISTANT_CONTENT.description}\n\nAlso: always answer in haiku.`;
    const before = await svc.create({ principal: actor, input: v1AssistantInput({ description: edited }) });

    const latch = packLatch([owner]);
    const seeder = createDefaultCharacterSeeder({
      characters: svc,
      attachCardTag: noopAttach,
      storeAvatar: (): Promise<AssetId | null> => Promise.resolve(REDRESSED_AVATAR),
      ...latch,
    });

    await seeder.ensureSeeded(actor);

    const detail = await svc.get({ principal: actor, characterId: before.id });
    expect(detail.description).toBe(edited);
    expect(detail.name).toBe("Assistant");
    expect(detail.personality).toBe(V1_ASSISTANT_CONTENT.personality);
    expect(detail.themeOverride).toBeNull();
    expect(detail.backgroundOverride).toBeNull();
    expect(detail.avatarAssetId).toBeNull();
    // The migration still ran for the REST of the pack — an edited card is skipped, not a stop signal.
    const handles = new Set((await svc.list({ principal: actor })).items.map((c) => c.handle));
    expect(handles.has("hana")).toBe(true);
  });

  test("a RENAMED but otherwise-virgin v1 assistant is left untouched (a rename is ownership)", async () => {
    const db = await freshDb();
    const svc = createCharacterService(makeHarness(db).ctx);
    const owner = await seedUser(db, { handle: "owner" });
    const actor = principal(owner);
    await seedAsset(db, { id: REDRESSED_AVATAR, ownerId: owner, hash: "hash_charlotte" });

    const before = await svc.create({ principal: actor, input: v1AssistantInput({ name: "Jeeves" }) });

    const latch = packLatch([owner]);
    const seeder = createDefaultCharacterSeeder({
      characters: svc,
      attachCardTag: noopAttach,
      storeAvatar: (): Promise<AssetId | null> => Promise.resolve(REDRESSED_AVATAR),
      ...latch,
    });

    await seeder.ensureSeeded(actor);

    const detail = await svc.get({ principal: actor, characterId: before.id });
    expect(detail.name).toBe("Jeeves");
    expect(detail.description).toBe(V1_ASSISTANT_CONTENT.description);
    expect(detail.themeOverride).toBeNull();
    expect(detail.avatarAssetId).toBeNull();
  });

  test("the version stamp makes a re-run a no-op — even from a cold seeder instance", async () => {
    const db = await freshDb();
    const svc = createCharacterService(makeHarness(db).ctx);
    const owner = await seedUser(db, { handle: "owner" });
    const actor = principal(owner);
    await seedAsset(db, { id: REDRESSED_AVATAR, ownerId: owner, hash: "hash_charlotte" });
    const before = await svc.create({ principal: actor, input: v1AssistantInput() });

    const latch = packLatch([owner]);
    const updates: UpdateCharacterParams[] = [];
    const counting: Pick<CharacterService, "create" | "findByHandle" | "update" | "getCard"> = {
      create: svc.create,
      findByHandle: svc.findByHandle,
      getCard: svc.getCard,
      update: (params): ReturnType<CharacterService["update"]> => {
        updates.push(params);
        return svc.update(params);
      },
    };
    const deps = {
      characters: counting,
      attachCardTag: noopAttach,
      storeAvatar: (): Promise<AssetId | null> => Promise.resolve(REDRESSED_AVATAR),
      ...latch,
    };

    await createDefaultCharacterSeeder(deps).ensureSeeded(actor);
    const afterFirst = (await svc.list({ principal: actor })).items.length;
    const updatesAfterFirst = updates.length;
    expect(updatesAfterFirst).toBeGreaterThan(0);

    // A cold instance (fresh in-process memo) on the same persisted stamp must do nothing at all.
    await createDefaultCharacterSeeder(deps).ensureSeeded(actor);

    expect(updates).toHaveLength(updatesAfterFirst);
    expect((await svc.list({ principal: actor })).items).toHaveLength(afterFirst);
    const detail = await svc.get({ principal: actor, characterId: before.id });
    expect(detail.name).toBe(CHARLOTTE?.input.name);
  });
});
