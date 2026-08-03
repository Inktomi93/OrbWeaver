// E2E (LOCAL mode) — the MULTI-HUMAN visibility plane driven LIVE with TWO REAL PRINCIPALS at the wire.
// D22 (`memberCardVisibility`) + D16 (`joinHistoryVisibility: from-join`) + the host-gated chat EXPORT +
// D122 (multi-human persona resolution) all had unit/int coverage and NO live two-account drive. This spec
// is that drive: every assertion reads the SERIALIZED wire payload a member's devtools would show, taken as
// the seeded `member` account (a real cookie session), against the same room the HOST reads unclamped.
//
// MODEL-FREE by construction (no `@live` tag): every canon row is planted through `chat.commitMessage` (the
// D56 post-without-generate lever) and every card/persona read is a query. The two `@live` siblings
// (live-member-strip / live-reasoning-strip) own the hidden-span half, which needs a streamed turn.
//
// THE NOISE FILTER (D121-B / Spine-Identity §2e): a member seeing history they were ADMITTED to is the
// DESIGN, not a leak. So each arm here names the host option it is testing — the D22 level, the D16
// per-participant floor, the export host gate — and the permissive/default arm is asserted FIRST, so a green
// clamp arm cannot be a false positive from an empty room or a broken read.
//
// The wire subset shapes are declared LOCALLY (the e2e-support import-free-of-package-trees rule).

import type { CharacterHandle, CharacterId, ChatId, Handle } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { expect, test } from "@playwright/test";
import type { ActorClient } from "./support/actors";
import { addMemberToChat, configureCustomProvider, loginLocal, ownerActor } from "./support/actors";
import { FIXTURE_COVER_MARKER, startFixtureProvider } from "./support/fixture-provider";
import { FIXTURE_PROVIDER_PORT, LOCAL_MEMBER } from "./support/modes";
import { collectChatRoomFrames } from "./support/sse";

const STREAM_TIMEOUT_MS = 20_000;
const REPLY_POLL_TIMEOUT_MS = 60_000;
const REPLY_POLL_INTERVAL_MS = 500;
const PRESENCE_SETTLE_MS = 1500;
const HTTP_BAD_REQUEST = 400;
const NOT_FOUND = 404;
const OK = 200;

// ── Wire subsets ────────────────────────────────────────────────────────────────────────────────────────
interface CreatedCharacter {
  readonly id: CharacterId;
}
interface StartedChat {
  readonly chat: { readonly id: ChatId };
}
interface MessagesPage {
  readonly messages: readonly { readonly id: string; readonly seq: number; readonly role: string; readonly content: string }[];
}
interface MemberCard {
  readonly visibility: string;
  readonly name: string;
  readonly description: string | null;
  readonly personality: string | null;
  readonly scenario: string | null;
  readonly greetings: readonly string[] | null;
  readonly exampleMessages: string | null;
  readonly creatorNotes: string | null;
  readonly lore: readonly string[] | null;
  readonly systemPrompt: string | null;
  readonly postHistoryInstructions: string | null;
}
interface UserRow {
  readonly id: string;
  readonly handle: Handle;
}
interface PersonaRow {
  readonly id: string;
  readonly name: string;
}
/** `chat.previewAssembly`'s return — the host's dry-run BUILD product for the next turn. Read as opaque
 *  bytes here (the whole payload is serialized and searched): the claim under test is "does the member's
 *  persona REACH the shared assembly at all", not which slice it lands in. `peekPrompt` would be the tighter
 *  instrument but is a DOMAIN verb with no tRPC procedure (verified: `chat.peekPrompt` 404s at the wire), so
 *  `previewAssembly` — same `requireHost` gate, same resolved assemble context — is the live door. */
type AssemblyPreview = Readonly<Record<string, unknown>>;

/** The seeded member's `users.id` — read through the owner-only admin surface (the host IS the box owner in
 *  this mode), because `/api/auth/me` deliberately returns handle+role, not the id the D16 write needs. */
async function memberUserId(host: ActorClient): Promise<string> {
  const users = await host.query<readonly UserRow[]>("admin.listUsers", {});
  const row = users.find((u) => u.handle.toLowerCase() === LOCAL_MEMBER.handle);
  expect(row, `the seeded "${LOCAL_MEMBER.handle}" account must exist (global-setup ran the multi-user seed)`).toBeDefined();
  return row?.id ?? "";
}

/** Mint a spec-owned character, removing any residue from a crashed prior run (idempotent). */
async function freshCharacter(host: ActorClient, handle: CharacterHandle, input: Record<string, unknown>): Promise<CharacterId> {
  const prior = await host.query<{ readonly items: readonly { readonly id: string; readonly handle: CharacterHandle }[] }>("character.list", {});
  const stale = prior.items.find((c) => c.handle === handle);
  if (stale !== undefined) {
    await host.mutation("character.remove", { characterId: stale.id });
  }
  const created = await host.mutation<CreatedCharacter>("character.create", { input: { handle, ...input } });
  return created.id;
}

/** Re-pin the room's D22 level. The group config is a whole-object write, so the two other required knobs
 *  ride along at their defaults — this helper keeps the four tier arms below to one readable line each. */
async function setCardVisibility(host: ActorClient, chatId: ChatId, level: string): Promise<void> {
  await host.mutation("chat.setGroupConfig", { chatId, config: { output: "per-speaker", policy: "natural", memberCardVisibility: level } });
}

// ══ 1. D22 — memberCardVisibility clamps, driven at every tier as the MEMBER ════════════════════════════

/** The card's single greeting text — named so the `sheet`-tier assertion can compare against it without
 *  indexing back into the literal (`CARD_FIELDS.greetings[0]?.name` is a provably-unnecessary optional
 *  chain on a literal array, which biome rejects). */
const GREETING_TEXT = "She looks up from the chart.";

const CARD_FIELDS = {
  name: "Marisol",
  description: "A cartographer with ink-stained cuffs.",
  personality: "Wry, exacting, secretly sentimental.",
  scenario: "The survey tent at the edge of the salt flats.",
  greetings: [{ text: GREETING_TEXT }],
  exampleMessages: "<START>\nMarisol: Mind the compass.",
  creatorNotes: "Authored for the D22 live clamp drive.",
  systemPrompt: "STEERING-INTERNAL: always answer in clipped surveyor's shorthand.",
  postHistoryInstructions: "POST-HISTORY-INTERNAL: never break the survey framing.",
};

/** The card fields the D22 clamp gates, grouped by the LOWEST level at which each survives — so a new field
 *  or a re-ordered level surfaces as a failing arm rather than as silence. */
const SHEET_TIER = ["description", "personality", "scenario", "greetings", "exampleMessages", "creatorNotes"] as const;
const FULL_TIER = ["systemPrompt", "postHistoryInstructions"] as const;

/** The named fields this card view did NOT null — the assertion reports WHICH field leaked, not just "some". */
function unclampedFields(card: MemberCard, keys: readonly (keyof MemberCard)[]): readonly string[] {
  return keys.filter((k) => card[k] !== null).map(String);
}

test("D22: a MEMBER's card read is field-clamped at EVERY memberCardVisibility tier; the HOST always reads full", async ({ baseURL }) => {
  test.setTimeout(120_000);
  const origin = baseURL ?? "";
  const host = ownerActor(origin);
  const characterId = await freshCharacter(host, castId<CharacterHandle>("e2e-d22-card"), CARD_FIELDS);

  try {
    const started = await host.mutation<StartedChat>("chat.startChat", { characterIds: [characterId] });
    const chatId = started.chat.id;
    const member = await loginLocal(origin, castId<Handle>(LOCAL_MEMBER.handle), LOCAL_MEMBER.password);
    await addMemberToChat(host, member, chatId, LOCAL_MEMBER.handle);

    // `name-avatar` — the always-present floor and NOTHING else. Every sheet+ and full-only field is null ON
    // THE WIRE (server-clamped), so the serialized payload cannot carry a byte of the steering internals.
    await setCardVisibility(host, chatId, "name-avatar");
    const nameAvatar = await member.query<MemberCard>("chat.getMemberCard", { chatId, characterId });
    expect(nameAvatar.visibility).toBe("name-avatar");
    expect(nameAvatar.name).toBe(CARD_FIELDS.name);
    expect(unclampedFields(nameAvatar, [...SHEET_TIER, ...FULL_TIER])).toEqual([]);
    expect(JSON.stringify(nameAvatar)).not.toContain(CARD_FIELDS.systemPrompt);
    expect(JSON.stringify(nameAvatar)).not.toContain(CARD_FIELDS.description);

    // `sheet` (the DB/product default) — the presentable identity arrives; the steering internals stay null.
    await setCardVisibility(host, chatId, "sheet");
    const sheet = await member.query<MemberCard>("chat.getMemberCard", { chatId, characterId });
    expect(sheet.visibility).toBe("sheet");
    expect(sheet.description).toBe(CARD_FIELDS.description);
    expect(sheet.personality).toBe(CARD_FIELDS.personality);
    expect(sheet.scenario).toBe(CARD_FIELDS.scenario);
    expect(sheet.greetings).toEqual([GREETING_TEXT]);
    expect(sheet.creatorNotes).toBe(CARD_FIELDS.creatorNotes);
    expect(unclampedFields(sheet, FULL_TIER)).toEqual([]);
    expect(JSON.stringify(sheet)).not.toContain("STEERING-INTERNAL");
    expect(JSON.stringify(sheet)).not.toContain("POST-HISTORY-INTERNAL");

    // `sheet+lore` — the sheet surface plus the rendered world-info; the internals STILL null. (`lore` is
    // null/empty here: the card carries no attached book, and the clamp fabricates nothing it wasn't given.)
    await setCardVisibility(host, chatId, "sheet+lore");
    const withLore = await member.query<MemberCard>("chat.getMemberCard", { chatId, characterId });
    expect(withLore.visibility).toBe("sheet+lore");
    expect(withLore.description).toBe(CARD_FIELDS.description);
    expect(unclampedFields(withLore, FULL_TIER)).toEqual([]);
    expect(JSON.stringify(withLore)).not.toContain("STEERING-INTERNAL");

    // `full` — the host deliberately opened the internals; now, and ONLY now, they cross the wire.
    await setCardVisibility(host, chatId, "full");
    const full = await member.query<MemberCard>("chat.getMemberCard", { chatId, characterId });
    expect(full.visibility).toBe("full");
    expect(full.systemPrompt).toBe(CARD_FIELDS.systemPrompt);
    expect(full.postHistoryInstructions).toBe(CARD_FIELDS.postHistoryInstructions);

    // THE HOST IS NEVER CLAMPED — re-pin the room at the tightest level and the host still resolves `full`
    // (`resolveCardVisibility`), so the clamping above is per-VIEWER, not a room-wide blackout.
    await setCardVisibility(host, chatId, "name-avatar");
    const hostCard = await host.query<MemberCard>("chat.getMemberCard", { chatId, characterId });
    expect(hostCard.visibility).toBe("full");
    expect(hostCard.systemPrompt).toBe(CARD_FIELDS.systemPrompt);
    // …and the member, reading the SAME room state, is back at the floor.
    const clampedAgain = await member.query<MemberCard>("chat.getMemberCard", { chatId, characterId });
    expect(unclampedFields(clampedAgain, [...SHEET_TIER, ...FULL_TIER])).toEqual([]);
  } finally {
    await host.mutation("character.remove", { characterId });
  }
});

// ══ 2. D16 — the `from-join` history floor, on every read path a member has ═════════════════════════════

const GREETING = "SEQ1-GREETING-the lantern is lit";
const PRE_JOIN = "SEQ2-PREJOIN-the vault key is under the third flagstone";
const AT_JOIN = "SEQ3-ATJOIN-we should move at dusk";
const POST_JOIN = "SEQ4-POSTJOIN-the road is clear";
const JOIN_SEQ = 3;

test("D16 from-join: a member's list + durable replay carry NO row below their own joinSeq; the host reads all four", async ({ baseURL }) => {
  test.setTimeout(120_000);
  const origin = baseURL ?? "";
  const host = ownerActor(origin);
  const characterId = await freshCharacter(host, castId<CharacterHandle>("e2e-d16-floor"), {
    name: "Warden",
    description: "e2e history-floor probe",
    greetings: [{ text: GREETING }],
  });

  try {
    const started = await host.mutation<StartedChat>("chat.startChat", { characterIds: [characterId] });
    const chatId = started.chat.id;
    // seq 1 = the greeting; seq 2/3 are planted BEFORE the member is seated (model-free commits).
    await host.mutation("chat.commitMessage", { chatId, content: PRE_JOIN });
    await host.mutation("chat.commitMessage", { chatId, content: AT_JOIN });

    const member = await loginLocal(origin, castId<Handle>(LOCAL_MEMBER.handle), LOCAL_MEMBER.password);
    await addMemberToChat(host, member, chatId, LOCAL_MEMBER.handle);
    // `redeemInvite` stamps joinSeq = the canon head at redeem (seq 3 — the AT_JOIN row).
    await host.mutation("chat.commitMessage", { chatId, content: POST_JOIN });

    // ── The DEFAULT arm FIRST (D121-B): `joinHistoryVisibility` defaults to `full`, so an invited member
    // sees the whole admitted history. That is the DESIGN — and asserting it here means the clamped arm
    // below cannot pass by accident (an empty page, a broken read, a wrong chatId).
    const openPage = await member.query<MessagesPage>("chat.listMessages", { chatId });
    const openWire = JSON.stringify(openPage);
    expect(openWire).toContain(GREETING);
    expect(openWire).toContain(PRE_JOIN);
    expect(openWire).toContain(POST_JOIN);

    // ── THE HOST OPTION UNDER TEST: the per-participant D16 floor.
    const userId = await memberUserId(host);
    await host.mutation("invites.setMemberHistoryVisibility", { chatId, userId, visibility: "from-join" });

    // PATH 1 — `chat.listMessages` (the canon page every message list renders from).
    const clampedPage = await member.query<MessagesPage>("chat.listMessages", { chatId });
    const clampedWire = JSON.stringify(clampedPage);
    expect(clampedWire).not.toContain(GREETING); // seq 1 — below the floor
    expect(clampedWire).not.toContain(PRE_JOIN); // seq 2 — below the floor
    expect(clampedWire).toContain(AT_JOIN); // seq 3 — AT the floor, INCLUSIVE by design
    expect(clampedWire).toContain(POST_JOIN); // seq 4 — above the floor
    expect(Math.min(...clampedPage.messages.map((m) => m.seq))).toBe(JOIN_SEQ);

    // PATH 1b — pagination stays honest: a `beforeSeq` cursor reaching under the floor returns an EMPTY page
    // (the same terminal signal an exhausted backward walk gives), never a fabricated one.
    const underFloor = await member.query<MessagesPage>("chat.listMessages", { chatId, beforeSeq: JOIN_SEQ });
    expect(underFloor.messages).toEqual([]);

    // PATH 2 — the DURABLE REPLAY (`sinceSeq: 0` on the real chat ROOM source: exactly what a member's
    // browser bus seeds itself with on attach). Same verdict, the other half of the stream.
    const memberReplay = await collectChatRoomFrames({
      baseUrl: origin,
      headers: member.headers,
      chatId,
      sinceSeq: 0,
      until: (values) => values.some((v) => JSON.stringify(v).includes(POST_JOIN)),
      timeoutMs: STREAM_TIMEOUT_MS,
    });
    const memberReplayWire = JSON.stringify(memberReplay);
    expect(memberReplayWire).toContain(POST_JOIN); // the replay actually delivered (not an empty timeout)
    expect(memberReplayWire).not.toContain(GREETING);
    expect(memberReplayWire).not.toContain(PRE_JOIN);

    // PATH 3 — the HOST, on the SAME room, on BOTH paths: unclamped (F2 — the host is never floored).
    const hostWire = JSON.stringify(await host.query<MessagesPage>("chat.listMessages", { chatId }));
    expect(hostWire).toContain(GREETING);
    expect(hostWire).toContain(PRE_JOIN);
    expect(hostWire).toContain(POST_JOIN);

    const hostReplay = await collectChatRoomFrames({
      baseUrl: origin,
      headers: host.headers,
      chatId,
      sinceSeq: 0,
      until: (values) => values.some((v) => JSON.stringify(v).includes(POST_JOIN)),
      timeoutMs: STREAM_TIMEOUT_MS,
    });
    expect(JSON.stringify(hostReplay)).toContain(PRE_JOIN);
  } finally {
    await host.mutation("character.remove", { characterId });
  }
});

// ══ 3. The chat EXPORT is host-gated (the download-shaped bypass of every read clamp) ═══════════════════

test("EXPORT: the chat transcript download 404s for a seated MEMBER and 200s for the HOST", async ({ baseURL }) => {
  test.setTimeout(120_000);
  const origin = baseURL ?? "";
  const host = ownerActor(origin);
  const characterId = await freshCharacter(host, castId<CharacterHandle>("e2e-export-gate"), {
    name: "Ledger",
    description: "e2e export-gate probe",
    greetings: [{ text: GREETING }],
  });

  try {
    const started = await host.mutation<StartedChat>("chat.startChat", { characterIds: [characterId] });
    const chatId = started.chat.id;
    await host.mutation("chat.commitMessage", { chatId, content: PRE_JOIN });

    const member = await loginLocal(origin, castId<Handle>(LOCAL_MEMBER.handle), LOCAL_MEMBER.password);
    await addMemberToChat(host, member, chatId, LOCAL_MEMBER.handle);
    // Seated AND reading the room — so the 404 below is the EXPORT gate biting, not a membership failure.
    expect(JSON.stringify(await member.query<MessagesPage>("chat.listMessages", { chatId }))).toContain(PRE_JOIN);

    // The member's own session cookie on the real download route. `exportChat` returns null for a non-host
    // caller and the registrar maps that to a BODILESS 404 — no transcript bytes, no existence oracle.
    for (const format of ["jsonl", "txt"]) {
      // biome-ignore lint/performance/noAwaitInLoops: two sequential format probes against one live stack — parallelism buys nothing and muddies attribution.
      const refused = await fetch(`${origin}/api/export/chat/${chatId}?format=${format}`, { headers: member.headers });
      expect(refused.status, `member export (${format})`).toBe(NOT_FOUND);
      expect(await refused.text()).toBe("");
    }

    // The HOST downloads the same transcript — proving the 404 is a ROLE gate, not a broken route.
    const allowed = await fetch(`${origin}/api/export/chat/${chatId}?format=jsonl`, { headers: host.headers });
    expect(allowed.status).toBe(OK);
    expect(await allowed.text()).toContain(PRE_JOIN);
  } finally {
    await host.mutation("character.remove", { characterId });
  }
});

// ══ 4. D122 — the multi-human persona plane ═════════════════════════════════════════════════════════════

const MEMBER_PERSONA_NAME = "Zaraine";
const MEMBER_PERSONA_DESCRIPTION = "a wandering cartographer of the salt flats";
const CARD_USER_PROBE = "{{user}} is my brother";

test("D122 ANCHOR: a HOST-pinned MEMBER-OWNED persona resolves in the room plane (card + assembly), and is not a dead pin", async ({ baseURL }) => {
  test.setTimeout(120_000);
  const origin = baseURL ?? "";
  const host = ownerActor(origin);
  // The card's own description probes CARD-context `{{user}}` — it renders against the room ANCHOR.
  const characterId = await freshCharacter(host, castId<CharacterHandle>("e2e-d122-persona"), {
    name: "Marrow",
    description: CARD_USER_PROBE,
    greetings: [{ text: GREETING }],
  });
  const member = await loginLocal(origin, castId<Handle>(LOCAL_MEMBER.handle), LOCAL_MEMBER.password);
  // The persona is the MEMBER's OWN library entity (owner-sacred — minted under their principal, never the
  // host's). Idempotent across crashed runs.
  const owned = await member.query<readonly PersonaRow[]>("persona.list", {});
  for (const stale of owned.filter((p) => p.name === MEMBER_PERSONA_NAME)) {
    // biome-ignore lint/performance/noAwaitInLoops: sequential cleanup of a normally-empty residue set.
    await member.mutation("persona.remove", { personaId: stale.id });
  }
  const persona = await member.mutation<PersonaRow>("persona.create", {
    input: { name: MEMBER_PERSONA_NAME, description: MEMBER_PERSONA_DESCRIPTION },
  });

  try {
    const started = await host.mutation<StartedChat>("chat.startChat", { characterIds: [characterId] });
    const chatId = started.chat.id;
    await addMemberToChat(host, member, chatId, LOCAL_MEMBER.handle);

    // The MEMBER holds it as their own active persona for this room (the per-participant pointer). On its
    // own this steers the MEMBER's turns; the anchor pin below is what makes it the ROOM's `{{user}}`.
    await member.mutation("persona.setActivePersona", { chatId, personaId: persona.id });

    // BEFORE THE PIN — the anchor is unset, so the room resolves the HOST's own persona: the card's
    // `{{user}}` is NOT the member's. This is the honest baseline that makes the post-pin arm meaningful
    // (and it is exactly what a DEAD pin would look like AFTER the pin, pre-D122).
    const unpinned = await host.query<AssemblyPreview>("chat.previewAssembly", { chatId });
    expect(JSON.stringify(unpinned)).not.toContain(MEMBER_PERSONA_NAME);

    // ── The HOST pins the MEMBER-OWNED persona as the room ANCHOR. Consent is the persona OWNER's present
    // membership, so this pin is legal — and D122's whole point is that it must not be a DEAD pin. ──
    await host.mutation("chat.setChatAnchorPersona", { chatId, personaId: persona.id });

    // The room's SHARED assembly now carries the member-owned persona's name AND its description (owner
    // ruling 2 — the presentation surface enters the shared prompt unconditionally, no toggle). Pre-D122 the
    // resolver read personas under the host's ownership, so a member-owned anchor resolved NULL here.
    const pinnedBytes = JSON.stringify(await host.query<AssemblyPreview>("chat.previewAssembly", { chatId }));
    expect(pinnedBytes).toContain(MEMBER_PERSONA_NAME);
    expect(pinnedBytes).toContain(MEMBER_PERSONA_DESCRIPTION);

    // The member's OWN card read renders card `{{user}}` against that anchor — the display side of the same
    // resolver, read as the member (whose card view is itself D22-clamped at the room's `sheet` default).
    const card = await member.query<MemberCard>("chat.getMemberCard", { chatId, characterId });
    expect(card.description).toBe(`${MEMBER_PERSONA_NAME} is my brother`);
    expect(card.description).not.toBe("User is my brother"); // the pre-D122 kit-floor symptom

    // The HOST's card read resolves the same anchor (the pin is the ROOM's, not per-viewer).
    const hostCard = await host.query<MemberCard>("chat.getMemberCard", { chatId, characterId });
    expect(hostCard.description).toBe(`${MEMBER_PERSONA_NAME} is my brother`);

    // REFUSAL: re-pinning the room anchor is HOST-only — a member cannot clear the host's pin.
    const refused = await member.expectError("chat.setChatAnchorPersona", { chatId, personaId: null }, "mutation");
    expect(refused.status).toBeGreaterThanOrEqual(HTTP_BAD_REQUEST);
  } finally {
    await host.mutation("character.remove", { characterId });
    await member.mutation("persona.remove", { personaId: persona.id });
  }
});

/** Poll the canon (as the host) until the fixture turn's assistant reply has COMMITTED, or give up. The
 *  fixture streams in milliseconds, but `chat.send` returns on ACCEPTANCE — the commit lands over the bus a
 *  beat later, so a bare read races it.
 *
 *  SINGLE-EXIT ON PURPOSE. The obvious `return reply` / trailing `return undefined` shape is caught in a
 *  pincer: biome's `noUselessReturn`/`noUselessUndefined` reject the trailing statement, and dropping it
 *  reds `types:tests-dom` with TS7030 (`noImplicitReturns`, which the root `typecheck:graph` program does
 *  NOT enforce — it only surfaced in the commit hook). One accumulator + one return satisfies both. */
async function pollForReply(host: ActorClient, chatId: ChatId): Promise<MessagesPage["messages"][number] | undefined> {
  const deadline = Date.now() + REPLY_POLL_TIMEOUT_MS;
  let reply: MessagesPage["messages"][number] | undefined;
  while (reply === undefined && Date.now() < deadline) {
    // biome-ignore lint/performance/noAwaitInLoops: a poll loop IS sequential by definition.
    const page = await host.query<MessagesPage>("chat.listMessages", { chatId });
    reply = [...page.messages].reverse().find((m) => m.role === "assistant" && m.content.includes(FIXTURE_COVER_MARKER));
    if (reply === undefined) {
      await new Promise((resolve) => setTimeout(resolve, REPLY_POLL_INTERVAL_MS));
    }
  }
  return reply;
}

// D122 R0/R1's OTHER half: a MEMBER-TRIGGERED turn. The anchor arm above proves the room-plane pin; this
// proves the trigger-plane read — the bytes a member's OWN turn actually shipped. The instrument is the
// STAMPED wire record (`chat.getVariantWire`, host-gated, immutable), not a dry-run preview: `previewAssembly`
// previews the HOST's next turn, so it resolves the HOST's persona by construction and can never observe
// this. `@live` — it needs a real streamed turn (through the scripted fixture provider, not an 8B).
test("D122 TRIGGER: a MEMBER-triggered turn ships THEIR persona in the assembled prompt (the stamped wire record)", { tag: "@live" }, async ({ baseURL }) => {
  test.setTimeout(180_000);
  const origin = baseURL ?? "";
  const host = ownerActor(origin);
  const fixture = await startFixtureProvider(FIXTURE_PROVIDER_PORT);
  const characterId = await freshCharacter(host, castId<CharacterHandle>("e2e-d122-trigger"), {
    name: "Marrow",
    description: "e2e member-triggered persona probe",
    greetings: [{ text: GREETING }],
  });
  const member = await loginLocal(origin, castId<Handle>(LOCAL_MEMBER.handle), LOCAL_MEMBER.password);
  const owned = await member.query<readonly PersonaRow[]>("persona.list", {});
  for (const stale of owned.filter((p) => p.name === MEMBER_PERSONA_NAME)) {
    // biome-ignore lint/performance/noAwaitInLoops: sequential cleanup of a normally-empty residue set.
    await member.mutation("persona.remove", { personaId: stale.id });
  }
  const persona = await member.mutation<PersonaRow>("persona.create", {
    input: { name: MEMBER_PERSONA_NAME, description: MEMBER_PERSONA_DESCRIPTION },
  });

  try {
    await configureCustomProvider(host, fixture.baseUrl, "fixture-model");
    const started = await host.mutation<StartedChat>("chat.startChat", { characterIds: [characterId] });
    const chatId = started.chat.id;
    await addMemberToChat(host, member, chatId, LOCAL_MEMBER.handle);
    await member.mutation("persona.setActivePersona", { chatId, personaId: persona.id });

    // THE HOST MUST BE PRESENT. `deferIfHostOffline` (Part III §5) queues a non-host member's owed AI turn as
    // a durable `pending_turns` row whenever the funding host reads as OFFLINE — so a member send against a
    // socket-less host commits the user row and generates NOTHING. Holding a host chat-room socket open for
    // the turn is what a real co-present host has, and it is the difference between a live turn and a
    // silently deferred one (this cost a run to find).
    const hostSocket = collectChatRoomFrames({
      baseUrl: origin,
      headers: host.headers,
      chatId,
      until: (values) => values.some((v) => JSON.stringify(v).includes(FIXTURE_COVER_MARKER)),
      timeoutMs: REPLY_POLL_TIMEOUT_MS,
    });
    await new Promise((resolve) => setTimeout(resolve, PRESENCE_SETTLE_MS));

    // The MEMBER fires the turn. The anchor is deliberately UNSET, so the only way their persona can reach
    // the prompt is the trigger-plane resolution D122 widened.
    await member.mutation("chat.send", { chatId, content: "What happened to the well?", intent: { maxOutputTokens: 64 } });
    await hostSocket;

    // The reply row + its variant, read as the HOST (the wire record is a host/admin inspector read).
    // `chat.send` resolves when the turn is ACCEPTED, not when it commits (the reply lands over the bus), so
    // poll the canon for the committed row rather than racing it.
    const reply = await pollForReply(host, chatId);
    expect(reply, "the fixture turn's reply must have committed").toBeDefined();
    const variants = await host.query<readonly { readonly variantId: string }[]>("chat.listMessageVariants", { chatId, messageId: reply?.id ?? "" });
    const variantId = variants.at(-1)?.variantId ?? "";
    expect(variantId).not.toBe("");

    // THE PROOF: the prompt STAMPED on that variant — the bytes that went to the model — carries the
    // member's persona name and description. Pre-D122 this read NULL for a non-host trigger and `{{user}}`
    // fell to the kit floor "User".
    const wireBytes = JSON.stringify(await host.query<AssemblyPreview>("chat.getVariantWire", { chatId, variantId }));
    expect(wireBytes).toContain(MEMBER_PERSONA_NAME);
    expect(wireBytes).toContain(MEMBER_PERSONA_DESCRIPTION);
    expect(wireBytes).not.toContain("roleplay with User"); // the pre-D122 kit-floor symptom
  } finally {
    await host.mutation("character.remove", { characterId });
    await member.mutation("persona.remove", { personaId: persona.id });
    await fixture.close();
  }
});
