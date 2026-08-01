// E2E (LOCAL mode) — the P3 deception REASONING-CHANNEL host-only cut (D110 §3.6), proven END-TO-END through
// the REAL member SSE + durable-replay paths with a REAL member principal. This is the half of §3.6 the
// member-strip spec (live-member-strip.local.spec.ts) documented as domain-only: when a game is
// DECEPTION-ACTIVE, the WHOLE reasoning channel goes host-only — a member's live chat ROOM and its
// durable replay must carry NO reasoning (deltas nulled, `view.reasoning` nulled, `reasoningStreamDone`
// dropped), while the HOST's stream carries it verbatim.
//
// THE DETERMINISTIC INPUT (the legit way, no product backdoor): reasoning is MODEL-GENERATED — there is no
// product surface to plant it (`chat.editReasoning` is deliberately unwired; `reasoningHostOnly` lives only in
// the chat room source). So the deterministic source is a SCRIPTED OpenAI-compatible PROVIDER
// (support/fixture-provider.ts) the app talks to through its REAL `custom_openai` (BYO) backend — the same
// product path a user gets pointing orbweaver at any OpenAI-compatible endpoint. The fixture streams a known
// `reasoning` channel (spelling the lie's truth) + a `<lie>` body span, so a real `chat.send` turn produces
// both hidden-class channels deterministically. This is harness test infra (like a mock IdP), NOT a product
// change.
//
// THE PROOF runs entirely through paths a real member/host use:
//   1. LIVE: the MEMBER attaches their OWN socket's chat room; the host fires the turn; the member's
//      collected stream has ZERO reasoning bytes (no reasoning delta, no `view.reasoning`, and the lie truth is
//      absent everywhere), while the HOST's live stream carries the reasoning channel + the truth.
//   2. REPLAY: the same two viewers replay from `sinceSeq: 0` (the durable log the client seeds on attach)
//      — the member's replay is reasoning-free; the host's carries it. Same verdict, both halves of the stream.
//
// `@live` — it drives a REAL turn (through the fixture, not an 8B) on the local multi-user stack.

import { expect, test } from "@playwright/test";
import { addMemberToChat, configureCustomProvider, loginLocal, ownerActor } from "./support/actors";
import { FIXTURE_COVER_MARKER, FIXTURE_LIE_TRUTH, startFixtureProvider } from "./support/fixture-provider";
import { FIXTURE_PROVIDER_PORT, LOCAL_MEMBER } from "./support/modes";
import type { StreamValue } from "./support/sse";
import { collectChatRoomFrames } from "./support/sse";

const CARD_HANDLE = "e2e-reasoning-strip";
const STREAM_TIMEOUT_MS = 60_000;

interface CreatedCharacter {
  readonly id: string;
}
interface StartedChat {
  readonly chat: { readonly id: string };
}

/** Did any collected stream value carry a reasoning byte — a `reasoning`-kind delta OR a non-null
 *  `view.reasoning`? The member's stream must have NONE on a deception game. */
function hasReasoning(values: readonly StreamValue[]): boolean {
  return values.some((v) => (v.event.delta?.kind === "reasoning" && (v.event.delta.text?.length ?? 0) > 0) || (v.event.view?.reasoning ?? null) !== null);
}

/** The serialized stream — the exact bytes a devtools-open viewer would see. The lie truth must be absent for
 *  the member across the WHOLE payload (body span stripped + reasoning channel withheld). */
function streamBytes(values: readonly StreamValue[]): string {
  return JSON.stringify(values);
}

/** The turn's REPLY committed row (identified by the member-visible cover marker — the greeting doesn't carry
 *  it), or undefined. The stop-collecting signal: the fixture streams reasoning THEN the cover-prose body, so
 *  once the reply commit lands both channels have flowed past this viewer. */
function replyCommit(values: readonly StreamValue[]): StreamValue | undefined {
  return values.find((v) => v.event.type === "messageCommitted" && (v.event.view?.content ?? "").includes(FIXTURE_COVER_MARKER));
}

/** Stop once the turn's reply commit has landed for this viewer (its content carries the cover marker). */
function sawReply(values: readonly StreamValue[]): boolean {
  return replyCommit(values) !== undefined;
}

test("P3 reasoning host-only: a deception turn's reasoning channel is withheld from the MEMBER's live SSE + replay, delivered to the HOST", {
  tag: "@live",
}, async ({ baseURL }) => {
  test.setTimeout(180_000);
  const origin = baseURL ?? "";
  const host = ownerActor(origin);

  const fixture = await startFixtureProvider(FIXTURE_PROVIDER_PORT);

  // Fresh spec-owned character (idempotent across crashed runs).
  const priorList = await host.query<{ readonly items: readonly { readonly id: string; readonly handle: string }[] }>("character.list", {});
  const prior = priorList.items.find((c) => c.handle === CARD_HANDLE);
  if (prior !== undefined) {
    await host.mutation("character.remove", { characterId: prior.id });
  }
  const character = await host.mutation<CreatedCharacter>("character.create", {
    input: { handle: CARD_HANDLE, name: "Baron", description: "e2e reasoning-strip probe", greetings: [{ text: "Welcome to the keep." }] },
  });

  try {
    // HOST: point the chat role at the scripted fixture (the real custom_openai BYO path), a lite game with
    // deception active, and seat the member.
    await configureCustomProvider(host, fixture.baseUrl, "fixture-model");
    const started = await host.mutation<StartedChat>("chat.startChat", { characterIds: [character.id] });
    const chatId = started.chat.id;
    await host.mutation("rpg.createGame", { chatId, mode: "lite" });
    await host.mutation("rpg.updateConfig", { chatId, patch: { deception: true, hiddenContentReveal: true } });

    const member = await loginLocal(origin, LOCAL_MEMBER.handle, LOCAL_MEMBER.password);
    await addMemberToChat(host, member, chatId, LOCAL_MEMBER.handle);

    // ── LIVE: both viewers subscribe their OWN stream, THEN the host fires a real turn (the fixture streams a
    // reasoning channel + a <lie>). Collect each stream until the assistant reply commits. ──
    const memberLive = collectChatRoomFrames({ baseUrl: origin, headers: member.headers, chatId, until: sawReply, timeoutMs: STREAM_TIMEOUT_MS });
    const hostLive = collectChatRoomFrames({ baseUrl: origin, headers: host.headers, chatId, until: sawReply, timeoutMs: STREAM_TIMEOUT_MS });
    // Give both sockets a beat to go live before the turn (the room's live listener attaches on connect).
    await new Promise((r) => setTimeout(r, 1500));
    await host.mutation("chat.send", { chatId, content: "What happened to the well?", intent: { maxOutputTokens: 64 } });

    const [memberValues, hostValues] = await Promise.all([memberLive, hostLive]);

    // The MEMBER's live stream: NO reasoning channel at all, and the lie truth absent from the whole payload
    // (body span stripped AND reasoning withheld) — the security-critical invariant, at the real wire.
    expect(hasReasoning(memberValues)).toBe(false);
    expect(streamBytes(memberValues)).not.toContain(FIXTURE_LIE_TRUTH);
    // The HOST's live stream: the reasoning channel IS delivered, carrying the truth (the host sees the model's
    // thinking) — proves the withholding is per-VIEWER, not a blanket drop.
    expect(hasReasoning(hostValues)).toBe(true);
    expect(streamBytes(hostValues)).toContain(FIXTURE_LIE_TRUTH);

    // ── REPLAY: the durable log from sinceSeq 0 (the client's draft-promotion seed) — same per-viewer
    // verdict on the replay half. The turn has committed, so a fresh connect replays it. ──
    const memberReplay = await collectChatRoomFrames({
      baseUrl: origin,
      headers: member.headers,
      chatId,
      sinceSeq: 0,
      until: sawReply,
      timeoutMs: STREAM_TIMEOUT_MS,
    });
    const hostReplay = await collectChatRoomFrames({
      baseUrl: origin,
      headers: host.headers,
      chatId,
      sinceSeq: 0,
      until: sawReply,
      timeoutMs: STREAM_TIMEOUT_MS,
    });

    expect(hasReasoning(memberReplay)).toBe(false);
    expect(streamBytes(memberReplay)).not.toContain(FIXTURE_LIE_TRUTH);
    expect(hasReasoning(hostReplay)).toBe(true);
    expect(streamBytes(hostReplay)).toContain(FIXTURE_LIE_TRUTH);

    // Cross-check the at-commit body view: the member's REPLY row exists (they see the turn happened, cover
    // prose intact) but its content is lie-stripped and its reasoning is null — the durable member truth. The
    // HOST's same reply row carries the reasoning verbatim.
    const memberReplyCommit = replyCommit(memberReplay);
    expect(memberReplyCommit).toBeDefined();
    expect(memberReplyCommit?.event.view?.reasoning ?? null).toBeNull();
    expect(memberReplyCommit?.event.view?.content ?? "").toContain(FIXTURE_COVER_MARKER);
    expect(memberReplyCommit?.event.view?.content ?? "").not.toContain(FIXTURE_LIE_TRUTH);

    const hostReplyCommit = replyCommit(hostReplay);
    expect(hostReplyCommit?.event.view?.reasoning ?? "").toContain(FIXTURE_LIE_TRUTH);
  } finally {
    await host.mutation("character.remove", { characterId: character.id });
    await fixture.close();
  }
});
