// E2E (LOCAL mode) — the MID-SLOT RESUME arm of the §3.6 hidden-span strip (ed2aafc5), with two real
// principals. This is the ONE §3.6 sub-claim the existing live specs cannot reach, and it had never been
// driven end-to-end.
//
// THE DEFECT IT PINS (ed2aafc5, "CONFIRMED LEAK — member-visible, exploitable on demand"): the hidden-span
// scrub is STATEFUL over a slot's whole delta stream — a `<lie …/>` opener is withheld until its `/>`
// arrives. That state used to be allocated PER SUBSCRIPTION (one map in the SSE generator, another thrown
// away inside every `replayChatEvents` call), so any reader that began — or RESUMED — while a span was open
// cold-started mid-tag. The continuation carries no `<`, so a fresh scrubber called all of it safe and
// forwarded the secret's tail. And it was an ORACLE, not a race: the withheld opener makes the member's
// ghost visibly STALL, telling them exactly when to reconnect. The fix moved the state to the PRODUCER
// (`createMemberDeltaStamper`, stamping `ChatBusEvent.memberText` before the durable append), making every
// read seam a stateless field read.
//
// WHY THE SIBLING SPECS DON'T COVER IT: `live-reasoning-strip` replays from `sinceSeq: 0`, i.e. from BEFORE
// the opener — a stateful reader and a per-subscription one behave identically there. The defect only
// exists in the byte window BETWEEN the two chunks of a straddling tag, so this spec resumes from exactly
// that boundary. The fixture provider streams the span in two chunks for this reason
// (support/fixture-provider.ts).
//
// THE INSTRUMENT: the durable chat-ROOM replay at a cursor equal to the seq of the opener's own frame, so
// the member's FIRST delivered delta is the tag's tail. Two belts against a vacuous green —
//   • a DIFFERENTIAL: the HOST resumes from the SAME cursor and MUST receive the tail (so the assertion is
//     "withheld from the member", not "nobody gets anything after that cursor");
//   • a DELIVERY floor: the member MUST receive the post-`/>` prose that rides the SAME chunk as the tail
//     (so "delivered nothing at all" cannot pass as "correctly withheld").
//
// `@live` — it drives a REAL streamed turn (through the scripted fixture, not an 8B).

import { expect, test } from "@playwright/test";
import { addMemberToChat, configureCustomProvider, loginLocal, ownerActor } from "./support/actors";
import {
  FIXTURE_COVER_MARKER,
  FIXTURE_LIE_REASON,
  FIXTURE_LIE_SPAN_OPEN,
  FIXTURE_LIE_TAIL,
  FIXTURE_POST_SPAN_PROSE,
  startFixtureProvider,
} from "./support/fixture-provider";
import { FIXTURE_PROVIDER_PORT, LOCAL_MEMBER } from "./support/modes";
import type { StreamValue } from "./support/sse";
import { collectChatRoomFrames } from "./support/sse";

const CARD_HANDLE = "e2e-span-resume";
const STREAM_TIMEOUT_MS = 60_000;
const PRESENCE_SETTLE_MS = 1500;
/** A distinctive fragment of the opener chunk — used to LOCATE its durable frame in the host's stream. */
const OPENER_MARKER = FIXTURE_LIE_SPAN_OPEN.slice(-24);

interface CreatedCharacter {
  readonly id: string;
}
interface StartedChat {
  readonly chat: { readonly id: string };
}

/** Stop collecting once the turn's reply has COMMITTED for this viewer (its content carries the cover
 *  marker) — by then every delta of the slot has flowed past. */
function sawReply(values: readonly StreamValue[]): boolean {
  return values.some((v) => v.event.type === "messageCommitted" && (v.event.view?.content ?? "").includes(FIXTURE_COVER_MARKER));
}

/** The durable `seq` of the frame carrying the span's OPENER chunk, read off the HOST's stream (the host
 *  sees deltas verbatim, so the raw opener bytes are findable there). Resuming AT this seq puts a reader's
 *  first delta squarely inside the still-open tag. */
function openerSeq(values: readonly StreamValue[]): number | undefined {
  return values.find((v) => v.event.delta?.kind === "text" && (v.event.delta.text ?? "").includes(OPENER_MARKER))?.seq;
}

test("P3 mid-slot resume: a MEMBER resuming INSIDE an open <lie> tag never receives its tail; the HOST does", { tag: "@live" }, async ({ baseURL }) => {
  test.setTimeout(180_000);
  const origin = baseURL ?? "";
  const host = ownerActor(origin);
  const fixture = await startFixtureProvider(FIXTURE_PROVIDER_PORT);

  const priorList = await host.query<{ readonly items: readonly { readonly id: string; readonly handle: string }[] }>("character.list", {});
  const prior = priorList.items.find((c) => c.handle === CARD_HANDLE);
  if (prior !== undefined) {
    await host.mutation("character.remove", { characterId: prior.id });
  }
  const character = await host.mutation<CreatedCharacter>("character.create", {
    input: { handle: CARD_HANDLE, name: "Baron", description: "e2e mid-slot resume probe", greetings: [{ text: "The hall is cold." }] },
  });

  try {
    await configureCustomProvider(host, fixture.baseUrl, "fixture-model");
    const started = await host.mutation<StartedChat>("chat.startChat", { characterIds: [character.id] });
    const chatId = started.chat.id;
    await host.mutation("rpg.createGame", { chatId, mode: "lite" });
    await host.mutation("rpg.updateConfig", { chatId, patch: { deception: true, hiddenContentReveal: true } });

    const member = await loginLocal(origin, LOCAL_MEMBER.handle, LOCAL_MEMBER.password);
    await addMemberToChat(host, member, chatId, LOCAL_MEMBER.handle);

    // The HOST watches the turn live — their stream carries the raw deltas, which is how we learn the
    // durable seq of the opener chunk (the cursor the member will resume from). The host fires the turn
    // themselves, so no host-presence defer applies.
    const hostLive = collectChatRoomFrames({ baseUrl: origin, headers: host.headers, chatId, until: sawReply, timeoutMs: STREAM_TIMEOUT_MS });
    await new Promise((resolve) => setTimeout(resolve, PRESENCE_SETTLE_MS));
    await host.mutation("chat.send", { chatId, content: "What happened to the well?", intent: { maxOutputTokens: 64 } });
    const hostValues = await hostLive;

    const cursor = openerSeq(hostValues);
    expect(cursor, "the host's stream must carry the span's opener chunk (the fixture streams it split)").toBeDefined();
    const sinceSeq = cursor ?? 0;

    // ── THE RESUME. Both viewers re-attach at the SAME cursor — the boundary between the opener and the
    // tail — so each one's first delivered delta is the tag's continuation. ──
    const memberResume = await collectChatRoomFrames({
      baseUrl: origin,
      headers: member.headers,
      chatId,
      sinceSeq,
      until: sawReply,
      timeoutMs: STREAM_TIMEOUT_MS,
    });
    const hostResume = await collectChatRoomFrames({
      baseUrl: origin,
      headers: host.headers,
      chatId,
      sinceSeq,
      until: sawReply,
      timeoutMs: STREAM_TIMEOUT_MS,
    });

    const memberBytes = JSON.stringify(memberResume);
    const hostBytes = JSON.stringify(hostResume);

    // DELIVERY FLOOR — the member's resume is not empty: the post-`/>` prose rides the SAME chunk as the
    // tail, so receiving it proves the reader got that chunk and withheld only the tag.
    expect(memberBytes, "the member's resumed stream must actually deliver the chunk's visible bytes").toContain(FIXTURE_POST_SPAN_PROSE);

    // THE INVARIANT — no tail, no tag, in the member's whole resumed payload.
    expect(memberBytes).not.toContain(FIXTURE_LIE_TAIL);
    expect(memberBytes).not.toContain(FIXTURE_LIE_REASON);
    expect(memberBytes).not.toContain("<lie");

    // THE DIFFERENTIAL — the HOST resuming from the identical cursor DOES receive the tail, so the member's
    // clean payload is a per-viewer withholding, not "the cursor was past everything".
    expect(hostBytes, "the host resuming from the same cursor must receive the tail (else the cursor proved nothing)").toContain(FIXTURE_LIE_TAIL);
  } finally {
    await host.mutation("character.remove", { characterId: character.id });
    await fixture.close();
  }
});
