// E2E (LOCAL mode) — the P3 hidden-content MEMBER-STRIP proven at the WIRE with a REAL member principal
// (D110 §3.6). This is the ONE security-critical invariant the #26 capstone could NOT reach: its harness is
// single-user, so the only principal is the HOST and there is no member view to read a stripped payload from
// (`live-parity-plus-capstone.spec.ts:20` names the gap). This spec closes it — the multi-mode harness boots
// AUTH_MODE=local with a seeded member, and the actor clients drive TWO live principals: the HOST (owner via
// the 127.0.0.1 fallback seam) and a MEMBER (the seeded `member` account, logged in).
//
// THE INVARIANT (§3.6): a game with deception active emits `<lie truth="…"/>`; members NEVER receive the
// hidden bytes — server-STRIPPED, not client-hidden (a client hide would leak the truth in the member's
// network payload). Proven here:
//   1. MEMBER-STRIP: the member's `chat.listMessages` payload has the truth string + the `<lie` tag ABSENT
//      (server-stripped per-viewer) — asserted over the SERIALIZED wire response, the exact devtools surface
//      a client-only hide would leak.
//   2. HOST REVEAL: the HOST sees the truth via `rpg.revealHidden` (the reveal eye) AND reads the raw stored
//      body verbatim through their OWN `chat.listMessages` (the host reads hidden; a member never would).
//
// DETERMINISM: the lie is PLANTED in a real canon row via `chat.editMessage` (an 8B emits `<lie>` unreliably;
// the seam under test is the SERVER STRIP / HOST REVEAL, not the model's grammar compliance) — the capstone's
// posture. `@live`-gated (rides the seeded-member local stack + the WIRE_CAPTURE/engine pins).
//
// SCOPE BOUNDARY (reasoning host-only, §3.6): the deception-active REASONING-channel host-only cut has NO
// deterministic WIRE door — `chat.editReasoning` is a DOMAIN verb but not a tRPC procedure (verified: a call
// 404s), and `reasoningHostOnly` is consumed only INSIDE the chat ROOM source on the multiplexed socket (not a query),
// as is the durable `replayChatEvents` replay. So the reasoning-channel projection AND the SSE/replay body
// strip stay exhaustively DOMAIN-proven (`packages/server/src/domain/chat/substrate/member-visibility.ts` +
// `tests/server/domain/chat/verbs/read.int.test.ts`), not faked at E2E. This spec proves the security-critical
// BODY strip end-to-end with a real member + the deception-active GATE — the layer the capstone could not reach.

import type { CharacterHandle } from "@orb/kit/ids";
import { expect, test } from "@playwright/test";
import { addMemberToChat, loginLocal, ownerActor } from "./support/actors";
import { LOCAL_MEMBER } from "./support/modes";

const LIE_TRUTH = "he is the smuggler the guards seek";
const LIE_TAG = `<lie character="Thornwick" type="identity" truth="${LIE_TRUTH}" reason="to keep the party from turning him in"/>`;
const CARD_HANDLE = "e2e-member-strip";

// Wire subset shapes (declared locally — the e2e-support import-free-of-package-trees rule).
interface CreatedCharacter {
  readonly id: string;
}
interface StartedChat {
  readonly chat: { readonly id: string };
}
interface MessagesPage {
  readonly messages: readonly { readonly id: string; readonly role: string; readonly content: string }[];
}
interface ConfigView {
  readonly deception: boolean;
}
interface RevealView {
  readonly standingLies: readonly { readonly character: string; readonly lies: readonly { readonly truth: string }[] }[];
}

test("P3 member-strip: a MEMBER's wire payload is byte-clean of the planted lie; the HOST reveals it", { tag: "@live" }, async ({ baseURL }) => {
  test.setTimeout(120_000);
  const origin = baseURL ?? "";
  const host = ownerActor(origin);

  // Fresh spec-owned character (idempotent across crashed runs — remove any prior, then re-mint chatless).
  const priorList = await host.query<{ readonly items: readonly { readonly id: string; readonly handle: CharacterHandle }[] }>("character.list", {});
  const prior = priorList.items.find((c) => c.handle === CARD_HANDLE);
  if (prior !== undefined) {
    await host.mutation("character.remove", { characterId: prior.id });
  }
  const character = await host.mutation<CreatedCharacter>("character.create", {
    input: { handle: CARD_HANDLE, name: "Thornwick", description: "e2e member-strip probe", greetings: [{ text: "The lantern gutters." }] },
  });

  try {
    // HOST: a lite game with deception active + a planted lie in the greeting canon row.
    const started = await host.mutation<StartedChat>("chat.startChat", { characterIds: [character.id] });
    const chatId = started.chat.id;
    await host.mutation("rpg.createGame", { chatId, mode: "lite" });
    await host.mutation("rpg.updateConfig", { chatId, patch: { deception: true, hiddenContentReveal: true } });
    expect((await host.query<ConfigView>("rpg.getConfigView", { chatId })).deception).toBe(true);

    const canon = await host.query<MessagesPage>("chat.listMessages", { chatId });
    const greeting = canon.messages.find((m) => m.role === "assistant");
    expect(greeting).toBeDefined();
    const greetingId = greeting?.id ?? "";
    await host.mutation("chat.editMessage", { chatId, messageId: greetingId, content: `"Just a traveller," he says. ${LIE_TAG}` });

    // MEMBER: log in + join the chat (createInvite → redeemInvite).
    const member = await loginLocal(origin, LOCAL_MEMBER.handle, LOCAL_MEMBER.password);
    await addMemberToChat(host, member, chatId, LOCAL_MEMBER.handle);

    // ── ASSERTION 1 (MEMBER-STRIP): the member's serialized listMessages payload carries ZERO hidden bytes.
    const memberPage = await member.query<MessagesPage>("chat.listMessages", { chatId });
    const memberWire = JSON.stringify(memberPage);
    expect(memberWire).not.toContain(LIE_TRUTH); // the truth is server-stripped, not client-hidden
    expect(memberWire).not.toContain("<lie"); // the whole hidden span is gone, tag and all
    // The member DOES see the surrounding prose (only the hidden span is stripped, not the row).
    const memberGreeting = memberPage.messages.find((m) => m.id === greetingId);
    expect(memberGreeting?.content).toContain("Just a traveller");

    // ── ASSERTION 2 (HOST REVEAL): the host sees the truth via the reveal eye + reads the raw body verbatim.
    const reveal = await host.query<RevealView>("rpg.revealHidden", { chatId });
    const thornwickLies = reveal.standingLies.find((g) => g.character === "Thornwick");
    expect(thornwickLies?.lies.some((l) => l.truth === LIE_TRUTH)).toBe(true);

    const hostPage = await host.query<MessagesPage>("chat.listMessages", { chatId });
    expect(hostPage.messages.find((m) => m.id === greetingId)?.content).toContain(LIE_TRUTH);
  } finally {
    await host.mutation("character.remove", { characterId: character.id });
  }
});
