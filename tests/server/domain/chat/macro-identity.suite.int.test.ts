// The OBSESSIVE macro/identity parity matrix (Task #79) — the "prove it" for the owner-ruled live
// resolution. Every committed row is resolved through BOTH homes and asserted EQUAL (the parity oracle,
// Chat-Macro-Resolution.md §6): identity is a property of the ROW or the chat ANCHOR, NEVER the reader, so
// "what the AI was told" (server ASSEMBLE) == "what every human sees" (client DISPLAY).
//
//   • SERVER home = the REAL `renderHistoryMacros` (assembly/macros — the `toShapeCanon` adapter), given the
//     real per-chat name PRODUCER + the anchor as `pinnedPersona`, called exactly as `engine/pipeline.ts`'s
//     `toShapeCanon` calls it (assistant rows pass the producer's card name as `speakerCharName`; user rows
//     pass none).
//   • CLIENT home = the REAL client DISPLAY pipeline, end to end: the room context built by the REAL
//     `resolveMessageRenderContext` (features/chat/lib/message-render-context — the `MessageRow` adapter)
//     fed to the REAL `renderMessageForDisplay` (lib/message-render — the kit-atom display pass `MessageRow`
//     runs). No hand-rolled reconstruction: the oracle exercises BOTH real adapters, so a drift in either
//     (e.g. the context builder's anchor/cast derivation vs. what the atom expects) fails the paired assert.
//     Both fns are pure (type-only / `@orb/kit`-only imports — no React), deep-imported here (the module,
//     never the `lib/index.ts` barrel, which drags React). The builder's own units stay pinned in
//     `tests/client/features/chat/lib/message-render-context.test.ts`.
//
// FOUR scenarios (D16 — solo is a cast-of-one group, never an `isGroup` flag): S1 solo 1H+1C · S2 group
// 1H+NC · S3 group MH+NC · S4 group MH+1C. Rulings under proof: A (greeting/AI `{{user}}`/`{{persona}}` →
// anchor), B (a human's `{{char}}` → the cast in multi / the one char in solo). The prompt-config `{{user}}`
// → triggerer wiring is proven at the compose-root seam (a separate test). `[server, client]` is asserted as
// a PAIR against `[ideal, ideal]` — one `expect` proves the ideal AND server == client (the oracle).

import type { AssembleContext, AssemblePersona, ParticipantView } from "@orb/contracts/chat";
import { buildCastNameContext } from "@orb/contracts/chat";
import type { Db } from "@orb/db";
import { chats } from "@orb/db";
import type { CharacterId, Handle, PersonaId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import type { RowMacroStamps } from "@orb/kit/macro";
import { DEFAULT_PERSONA_NAME } from "@orb/kit/persona";
import { eq } from "drizzle-orm";
import { resolveMessageRenderContext } from "../../../../packages/client/src/features/chat/lib/message-render-context.ts";
import { renderMessageForDisplay } from "../../../../packages/client/src/lib/message-render.ts";
import { renderHistoryMacros } from "../../../../packages/server/src/domain/chat/assembly/macros.ts";
import { loadChatCastProducer } from "../../../../packages/server/src/domain/chat/persistence/cast.ts";
import { freshDb } from "../../../support/db.ts";
import { expect, test } from "../../../support/fixtures.ts";
import { seedCharacter, seedChat, seedParticipant, seedPersona, seedUser } from "./_support.ts";

/** One row awaiting resolution (the raw stored content + its D26 stamps). */
interface Row {
  readonly role: "assistant" | "user";
  readonly content: string;
  readonly characterId: CharacterId | null;
  readonly personaId: PersonaId | null;
}

/** The seeded room's resolution oracle: `resolve(row)` returns BOTH homes' output for one raw row. */
interface Scene {
  readonly resolve: (row: Row) => Promise<{ server: string; client: string }>;
}

/**
 * Seed a room (N characters, M humans each with an active persona, an optional chat anchor persona) + return
 * the parity oracle. Every persona/character id the room references lands in the real name PRODUCER, so both
 * homes resolve the SAME names the live path would. The oracle resolves each row through the real server
 * adapter and the shared kit atom (client-context-shaped), and the CALLER asserts equality + the ideal.
 */
async function seedScene(
  db: Db,
  spec: {
    readonly key: string;
    /** Character display names, in roster (join) order — the cast. */
    readonly characters: readonly string[];
    /** Humans: their persona key (→ display name `<key>-<key>`) + optional description; seated as active. */
    readonly humans: readonly { readonly personaKey: string; readonly description?: string }[];
    /** The chat anchor persona key (one of `humans`' persona keys), or null (no anchor). */
    readonly anchor: string | null;
    /** Extra persona ids to seed but NOT seat (reattribution / since-switched-stamp cases). */
    readonly extraPersonas?: readonly string[];
  },
): Promise<{
  scene: Scene;
  chars: Record<string, CharacterId>;
  personas: Record<string, PersonaId>;
}> {
  const host = await seedUser(db, castId<Handle>(`${spec.key}_host`));
  const chatId = await seedChat(db, spec.key);
  await seedParticipant(db, { chatId, key: `${spec.key}_h0`, userId: host, role: "host" });

  const chars: Record<string, CharacterId> = {};
  for (const name of spec.characters) {
    // biome-ignore lint/performance/noAwaitInLoops: deterministic fixture seeding — join order is load-bearing.
    const id = await seedCharacter(db, host, `${spec.key}_${name}`);
    chars[name] = id;

    await seedParticipant(db, { chatId, key: `${spec.key}_c_${name}`, characterId: id });
  }

  const personas: Record<string, PersonaId> = {};
  for (const h of spec.humans) {
    // biome-ignore lint/performance/noAwaitInLoops: sequential fixture seeding.
    const pid = await seedPersona(db, host, `${spec.key}_${h.personaKey}`, {
      ...(h.description !== undefined ? { description: h.description } : {}),
    });
    personas[h.personaKey] = pid;

    const hUser = await seedUser(db, castId<Handle>(`${spec.key}_hu_${h.personaKey}`));

    await seedParticipant(db, {
      chatId,
      key: `${spec.key}_hp_${h.personaKey}`,
      userId: hUser,
      activePersonaId: pid,
    });
  }
  for (const extra of spec.extraPersonas ?? []) {
    // biome-ignore lint/performance/noAwaitInLoops: sequential fixture seeding.
    personas[extra] = await seedPersona(db, host, `${spec.key}_${extra}`);
  }

  const anchorPersonaId = spec.anchor === null ? null : (personas[spec.anchor] ?? null);
  await db.update(chats).set({ anchorPersonaId }).where(eq(chats.id, chatId));

  // The cast NAMES are the seeded characters' db names (`seedCharacter` sets name = the key = `<key>_<name>`)
  // — the SAME names the real producer + roster expose. Both homes' `{{char}}`/`{{group}}` join these.
  const castNames = spec.characters.map((n) => `${spec.key}_${n}`);

  // The CLIENT roster the real `resolveMessageRenderContext` reads — it consults ONLY `kind`/`displayName`
  // per entry (to derive the solo `{{char}}` default + the cast join), keyed by CharacterId in join order.
  // Roster (Map insertion) order == `castNames` order → the client cast join matches the server `ctx.cast`
  // join byte-for-byte.
  const participants = new Map<CharacterId, ParticipantView>();
  spec.characters.forEach((shortName, i) => {
    const id = chars[shortName];
    const displayName = castNames[i];
    if (id !== undefined && displayName !== undefined) {
      // FABRICATION-OK: the builder reads only kind/displayName; a full 20+-field ParticipantView would be noise.
      participants.set(id, { kind: "character", displayName } as unknown as ParticipantView);
    }
  });
  const anchorHuman = spec.humans.find((h) => h.personaKey === spec.anchor);
  const anchorPersona: AssemblePersona | null =
    spec.anchor === null
      ? null
      : {
          name: `${spec.key}_${spec.anchor}`,
          description: anchorHuman?.description ?? `${spec.key}_${spec.anchor} description`,
        };

  // The SERVER minimal AssembleContext (FABRICATION-OK double — `renderHistoryMacros`/`charForSpeaker` read
  // only these fields): the cast (roster order), the current speaker, and the anchor as `pinnedPersona`.
  const primary = { name: castNames[0] ?? "Character" };
  // FABRICATION-OK: `renderHistoryMacros`/`charForSpeaker` read ONLY these fields; a full 30+-field AssembleContext would be noise.
  const serverCtx = {
    character: primary,
    cast: castNames.map((name) => ({ name })),
    speaker: { kind: "single", character: primary },
    pinnedPersona: anchorPersona,
    activePersona: anchorPersona,
  } as unknown as AssembleContext;

  const resolve = async (row: Row): Promise<{ server: string; client: string }> => {
    // The cast producer covers every participant id UNION the row's own stamps (a reattributed /
    // since-switched persona resolves to its OWN name even when no participant seats it).
    const producerCast = await loadChatCastProducer(db, {
      participants: [
        ...castNames.map((n) => ({ characterId: chars[n] ?? null, activePersonaId: null })),
        ...Object.values(personas).map((activePersonaId) => ({
          characterId: null,
          activePersonaId,
        })),
      ],
      messages: [{ characterId: row.characterId, personaId: row.personaId }],
    });
    const { characterNamesById, personaNamesById } = buildCastNameContext(producerCast);
    const stamps: RowMacroStamps = { characterId: row.characterId, personaId: row.personaId };

    // SERVER — mirror `toShapeCanon`: an assistant row passes the producer's card name as `speakerCharName`;
    // a user/narrator row passes none (falls to the ctx default inside the adapter).
    const assistantSpeaker = row.characterId === null ? undefined : characterNamesById.get(row.characterId)?.name;
    const server = renderHistoryMacros(row.content, stamps, serverCtx, {
      producer: { characterNamesById, personaNamesById },
      ...(row.role === "assistant" && assistantSpeaker !== undefined ? { speakerCharName: assistantSpeaker } : {}),
    });

    // CLIENT — the REAL DISPLAY pipeline: the room context the real `resolveMessageRenderContext` builds
    // from this room's roster + producer + anchor id (deriving the solo `{{char}}` default, the full cast /
    // ruling B, and the anchor as the null-stamp `{{user}}`/`{{persona}}` fallback / ruling A ITSELF —
    // looked up from `personaNamesById`, not hand-fed), fed to the real `renderMessageForDisplay` with the
    // row's OWN stamps as `MessageRow` passes them. No displayScripts / autoFixMarkdown ⇒ output is the pure
    // `resolveRowMacros` substitution — the same atom server ASSEMBLE calls.
    const clientCtx = resolveMessageRenderContext({
      participants,
      characterNamesById,
      personaNamesById,
      anchorPersonaId,
    });
    const client = renderMessageForDisplay(row.content, clientCtx, row.characterId, row.personaId);

    return { server, client };
  };

  return { scene: { resolve }, chars, personas };
}

// ═══ Axis 1 — `{{user}}` in a HUMAN's own message (row personaId; per-human, viewer-independent) ═══════════

test("S1 solo: a user row's {{user}} resolves to its own stamped persona on both homes", async () => {
  const db = await freshDb();
  const { scene, personas } = await seedScene(db, {
    key: "a1s1",
    characters: ["Aria"],
    humans: [{ personaKey: "mara" }],
    anchor: "mara",
  });
  const out = await scene.resolve({
    role: "user",
    content: "{{user}} waves",
    characterId: null,
    personaId: personas["mara"] ?? null,
  });
  expect([out.server, out.client]).toStrictEqual(["a1s1_mara waves", "a1s1_mara waves"]);
});

test("S3 group MxN: each human's line carries THEIR OWN persona — viewer-independent, per-row", async () => {
  const db = await freshDb();
  const { scene, personas } = await seedScene(db, {
    key: "a1s3",
    characters: ["Aria", "Kai"],
    humans: [{ personaKey: "zara" }, { personaKey: "vex" }],
    anchor: "zara",
  });
  // Zara's own line → Zara; Vex's own line → Vex — NEITHER is the anchor, NEITHER depends on who reads.
  const zara = await scene.resolve({
    role: "user",
    content: "{{user}}: hi",
    characterId: null,
    personaId: personas["zara"] ?? null,
  });
  const vex = await scene.resolve({
    role: "user",
    content: "{{user}}: hey",
    characterId: null,
    personaId: personas["vex"] ?? null,
  });
  expect([zara.server, zara.client]).toStrictEqual(["a1s3_zara: hi", "a1s3_zara: hi"]);
  expect([vex.server, vex.client]).toStrictEqual(["a1s3_vex: hey", "a1s3_vex: hey"]);
});

// ═══ Axis 2 / ruling A — greeting & AI `{{user}}`/`{{persona}}` → the chat ANCHOR (server == client) ═══════
// THE FLIP: against the OLD code this diverged in multi-human (server = `personaIds[0]`, client = the
// VIEWER's own active persona). The ideal below — one anchor for the model and every human — could NOT hold
// before this lane; it does now.

test("S3 group MxN: a greeting (null-persona assistant row) resolves {{user}}/{{persona}} → the ANCHOR", async () => {
  const db = await freshDb();
  const { scene, chars } = await seedScene(db, {
    key: "a2s3",
    characters: ["Aria", "Kai"],
    humans: [{ personaKey: "zara", description: "a stoic guard" }, { personaKey: "vex" }],
    anchor: "zara",
  });
  // Aria's seeded greeting (characterId=Aria, personaId=null): {{char}} = Aria (its own speaker); {{user}} =
  // the anchor Zara; {{persona}} = the anchor's description — identical for the model + every human.
  const out = await scene.resolve({
    role: "assistant",

    content: "{{char}} greets {{user}} ({{persona}})",
    characterId: chars["Aria"] ?? null,
    personaId: null,
  });
  const ideal = "a2s3_Aria greets a2s3_zara (a stoic guard)";
  expect([out.server, out.client]).toStrictEqual([ideal, ideal]);
});

test("S4 group Mx1: an AI line's {{user}} → the anchor, never the reader (server == client)", async () => {
  const db = await freshDb();
  const { scene, chars } = await seedScene(db, {
    key: "a2s4",
    characters: ["Aria"],
    humans: [{ personaKey: "zara" }, { personaKey: "vex" }],
    anchor: "vex",
  });
  const out = await scene.resolve({
    role: "assistant",
    content: "I see you, {{user}}.",
    characterId: chars["Aria"] ?? null,
    personaId: null,
  });
  expect([out.server, out.client]).toStrictEqual(["I see you, a2s4_vex.", "I see you, a2s4_vex."]);
});

test("S1 solo: greeting {{user}} → the one human's persona (anchor == active by construction)", async () => {
  const db = await freshDb();
  const { scene, chars } = await seedScene(db, {
    key: "a2s1",
    characters: ["Aria"],
    humans: [{ personaKey: "mara" }],
    anchor: "mara",
  });
  const out = await scene.resolve({
    role: "assistant",
    content: "Hello {{user}}",
    characterId: chars["Aria"] ?? null,
    personaId: null,
  });
  expect([out.server, out.client]).toStrictEqual(["Hello a2s1_mara", "Hello a2s1_mara"]);
});

// ═══ Axis 3 / ruling B — a HUMAN's `{{char}}` → the CAST (group in multi, the one char in solo) ═══════════
// THE FLIP: against the OLD code this diverged (server = the arbitrary current speaker; client = the
// "Character" floor). Both now resolve to the room's cast.

test("S2 group 1xN: a user's {{char}} → the JOINED cast (== {{group}}), server == client", async () => {
  const db = await freshDb();
  const { scene, personas } = await seedScene(db, {
    key: "bs2",
    characters: ["Aria", "Kai"],
    humans: [{ personaKey: "mara" }],
    anchor: "mara",
  });
  const out = await scene.resolve({
    role: "user",
    content: "{{char}}, gather round",
    characterId: null,
    personaId: personas["mara"] ?? null,
  });
  const ideal = "bs2_Aria, bs2_Kai, gather round";
  expect([out.server, out.client]).toStrictEqual([ideal, ideal]);
});

test("S3 group MxN: a user's {{char}} → the full cast (three characters joined)", async () => {
  const db = await freshDb();
  const { scene, personas } = await seedScene(db, {
    key: "bs3",
    characters: ["Aria", "Kai", "Rue"],
    humans: [{ personaKey: "zara" }, { personaKey: "vex" }],
    anchor: "zara",
  });
  const out = await scene.resolve({
    role: "user",
    content: "hello {{char}}",
    characterId: null,
    personaId: personas["vex"] ?? null,
  });
  const ideal = "hello bs3_Aria, bs3_Kai, bs3_Rue";
  expect([out.server, out.client]).toStrictEqual([ideal, ideal]);
});

test("S1 solo: a user's {{char}} → the ONE character (cast-of-one, no join)", async () => {
  const db = await freshDb();
  const { scene, personas } = await seedScene(db, {
    key: "bs1",
    characters: ["Aria"],
    humans: [{ personaKey: "mara" }],
    anchor: "mara",
  });
  const out = await scene.resolve({
    role: "user",
    content: "{{char}} listens",
    characterId: null,
    personaId: personas["mara"] ?? null,
  });
  expect([out.server, out.client]).toStrictEqual(["bs1_Aria listens", "bs1_Aria listens"]);
});

// ═══ Axis 5 — `{{char}}` for a voiced (assistant) row = its OWN speaker, never the current turn's speaker ═══

test("S2 group: a past Aria line keeps {{char}} = Aria even as Kai is the current speaker", async () => {
  const db = await freshDb();
  const { scene, chars } = await seedScene(db, {
    key: "a5s2",
    characters: ["Aria", "Kai"],
    humans: [{ personaKey: "mara" }],
    anchor: "mara",
  });
  const out = await scene.resolve({
    role: "assistant",
    content: "{{char}} nods",
    characterId: chars["Aria"] ?? null,
    personaId: null,
  });
  expect([out.server, out.client]).toStrictEqual(["a5s2_Aria nods", "a5s2_Aria nods"]);
});

// ═══ SAD paths ═══════════════════════════════════════════════════════════════════════════════════════════

test("SAD null persona + NO anchor → {{user}} floors to the ONE unresolved-persona name on both homes", async () => {
  const db = await freshDb();
  const { scene, chars } = await seedScene(db, {
    key: "sadnp",
    characters: ["Aria"],
    humans: [{ personaKey: "mara" }],
    anchor: null,
  });
  const out = await scene.resolve({
    role: "assistant",
    content: "{{user}} is here",
    characterId: chars["Aria"] ?? null,
    personaId: null,
  });
  // The PARITY is the point and it still holds; only the literal moved. Both homes now floor to the ONE
  // unresolved-persona name (`DEFAULT_PERSONA_NAME`) — before, the SERVER macro layer said "User" and the
  // CLIENT row attribution said "Traveler", and a single measured payload carried both spellings.
  expect([out.server, out.client]).toStrictEqual([`${DEFAULT_PERSONA_NAME} is here`, `${DEFAULT_PERSONA_NAME} is here`]);
});

test("SAD deleted persona (stamped id absent from the store) → the anchor fallback, no id leak", async () => {
  const db = await freshDb();
  const { scene } = await seedScene(db, {
    key: "saddp",
    characters: ["Aria"],
    humans: [{ personaKey: "zara" }, { personaKey: "vex" }],
    anchor: "zara",
  });
  // A user row stamped a persona id later DELETED → the producer LEFT-join misses it → both homes floor to
  // the anchor (never the raw id string).
  const out = await scene.resolve({
    role: "user",
    content: "{{user}} left",
    characterId: null,
    personaId: castId<PersonaId>("persona_ghost"),
  });
  expect([out.server, out.client]).toStrictEqual(["saddp_zara left", "saddp_zara left"]);
});

test("SAD deleted character → the CLIENT display floors {{char}} to 'Character' (not the cast join)", async () => {
  const db = await freshDb();
  const { scene } = await seedScene(db, {
    key: "saddc",
    characters: ["Aria", "Kai"],
    humans: [{ personaKey: "mara" }],
    anchor: "mara",
  });
  // A VOICED row stamped a since-deleted characterId (producer miss) — the atom floors to "Character", NOT
  // the cast join (only a NULL characterId means "the cast"). The server's `charForSpeaker` fallback to the
  // current live speaker is a separate pre-existing `{{char}}` concern outside these rulings; assert the atom
  // floor (the CLIENT/DISPLAY home).
  const out = await scene.resolve({
    role: "assistant",
    content: "{{char}} nods",
    characterId: castId<CharacterId>("character_ghost"),
    personaId: null,
  });
  expect(out.client).toBe("Character nods");
});

test("SAD persona reattribution: re-stamping the row re-resolves {{user}} to the NEW persona", async () => {
  const db = await freshDb();
  const { scene, personas } = await seedScene(db, {
    key: "sadre",
    characters: ["Aria"],
    humans: [{ personaKey: "mara" }],
    anchor: "mara",
    extraPersonas: ["nyx"],
  });
  // Before: stamped Mara → "Mara". After reattribution (a new personaId stamp): → "Nyx", on BOTH homes.
  const before = await scene.resolve({
    role: "user",
    content: "{{user}} waves",
    characterId: null,
    personaId: personas["mara"] ?? null,
  });
  const after = await scene.resolve({
    role: "user",
    content: "{{user}} waves",
    characterId: null,
    personaId: personas["nyx"] ?? null,
  });
  expect([before.server, before.client]).toStrictEqual(["sadre_mara waves", "sadre_mara waves"]);
  expect([after.server, after.client]).toStrictEqual(["sadre_nyx waves", "sadre_nyx waves"]);
});

test("SAD persona-switch mid-chat: a PAST row keeps its send-time stamp (a live switch never relabels it)", async () => {
  const db = await freshDb();
  const { scene, personas } = await seedScene(db, {
    key: "sadsw",
    characters: ["Aria"],
    humans: [{ personaKey: "mara" }],
    anchor: "mara",
    extraPersonas: ["nyx"],
  });
  // The human's active persona later switches to Nyx, but the OLD row still carries its Mara stamp → still
  // resolves to Mara (the stamp is the source of truth; only reattribution rewrites it).
  const out = await scene.resolve({
    role: "user",
    content: "{{user}} spoke",
    characterId: null,
    personaId: personas["mara"] ?? null,
  });
  expect([out.server, out.client]).toStrictEqual(["sadsw_mara spoke", "sadsw_mara spoke"]);
});

test("SAD one human viewing another human's line: it resolves to the AUTHOR, identical for every viewer", async () => {
  const db = await freshDb();
  const { scene, personas } = await seedScene(db, {
    key: "sadvw",
    characters: ["Aria"],
    humans: [{ personaKey: "zara" }, { personaKey: "vex" }],
    anchor: "zara",
  });
  // Vex's line carries Vex's stamp. The client home has NO viewer input at all (ruling A removed it), so it
  // resolves to Vex regardless of who reads — the same string the server (model) sees.
  const out = await scene.resolve({
    role: "user",
    content: "{{user}} whispers",
    characterId: null,
    personaId: personas["vex"] ?? null,
  });
  expect([out.server, out.client]).toStrictEqual(["sadvw_vex whispers", "sadvw_vex whispers"]);
});

test("hostile / typo macro in stored content fails open to the literal token (both homes)", async () => {
  const db = await freshDb();
  const { scene, personas } = await seedScene(db, {
    key: "sadho",
    characters: ["Aria"],
    humans: [{ personaKey: "mara" }],
    anchor: "mara",
  });
  const out = await scene.resolve({
    role: "user",
    content: "{{nope::x}} {{user}}",
    characterId: null,
    personaId: personas["mara"] ?? null,
  });
  expect([out.server, out.client]).toStrictEqual(["{{nope::x}} sadho_mara", "{{nope::x}} sadho_mara"]);
});
