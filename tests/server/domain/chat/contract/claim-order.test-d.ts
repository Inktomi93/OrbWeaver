// @subject packages/contracts/src/chat/rpg-ops.ts
// @subject packages/server/src/domain/chat/contract/room-write.ts
// D166: a claim spends the admission a membership gate mints, and a covered room write spends the claim, so a claim
// before the gate and a covered write before the claim fail to compile. `orb/room-token-mint` refuses the casts.
import type { ClaimChatOp, GetMembership, HandoffRekeyActorsOp, RoomAdmission, RoomClaim } from "@orb/contracts/chat";
import type { ChatId } from "@orb/kit/ids";
import { expectTypeOf, test } from "vitest";
import type { ChatContext } from "#server/domain/chat/contract/context.ts";
import type { ClaimExempt } from "#server/domain/chat/contract/room-write.ts";
import type { requireParticipant } from "#server/domain/chat/guard.ts";
import type { commitCanonAppend, retryLostCanonHead } from "#server/domain/chat/persistence/canon-write.ts";
import type { commitHostFencedWrite } from "#server/domain/chat/persistence/host-fenced-write.ts";
import type { insertInvite } from "#server/domain/chat/persistence/invites.ts";
import type { commitRetainedCanonStats } from "#server/domain/chat/persistence/retained-canon.ts";

declare const ctx: ChatContext;
declare const chatId: ChatId;
declare const admission: RoomAdmission;
declare const claim: RoomClaim;
declare const exempt: ClaimExempt;
declare const claimChat: ClaimChatOp;
declare const fenced: typeof commitHostFencedWrite;
declare const append: typeof commitCanonAppend;
declare const retry: typeof retryLostCanonHead;
declare const rekey: HandoffRekeyActorsOp;
declare const retained: typeof commitRetainedCanonStats;
declare const invite: typeof insertInvite;
declare const invitedRow: Parameters<typeof insertInvite>[2];

test("the only admissions are the ones a membership gate returns", () => {
  expectTypeOf<Awaited<ReturnType<typeof requireParticipant>>["admission"]>().toEqualTypeOf<RoomAdmission>();
  expectTypeOf<NonNullable<Awaited<ReturnType<GetMembership>>>["admission"]>().toEqualTypeOf<RoomAdmission>();
  // @ts-expect-error A literal carrying the room is not an admission: the token's private member refuses it.
  const literal: RoomAdmission = { chatId };
  // @ts-expect-error Spreading a real admission drops the private member, so it cannot be retargeted at another room.
  const respread: RoomAdmission = { ...admission, chatId };
  expectTypeOf(literal).toEqualTypeOf(respread);
});

test("a claim takes an admission, never a bare room id or another token", async () => {
  expectTypeOf(await claimChat(admission)).toEqualTypeOf<RoomClaim>();
  // @ts-expect-error A bare ChatId names the room without proving any gate ran: a claim before the gate.
  await claimChat(chatId);
  // @ts-expect-error A claim is not an admission.
  await claimChat(claim);
});

test("a covered room write takes the claim, so it cannot run before the claim", async () => {
  expectTypeOf(retained).parameter(1).toEqualTypeOf<RoomClaim>();
  await retained(ctx, claim, [], { deltas: [], sources: [], contributions: [] });
  // @ts-expect-error A bare ChatId: the write runs with no claim behind it.
  await retained(ctx, chatId, [], { deltas: [], sources: [], contributions: [] });
  // @ts-expect-error An admission proves the gate, not the claim: a write between the gate and the claim.
  await retained(ctx, admission, [], { deltas: [], sources: [], contributions: [] });
  await append(ctx.db, claim, () => ({ statements: [], result: null }));
  // @ts-expect-error The canon append door refuses a bare ChatId.
  await append(ctx.db, chatId, () => ({ statements: [], result: null }));
  await retry(ctx.db, claim, () => Promise.resolve(null));
  // @ts-expect-error The head retry refuses a bare ChatId.
  await retry(ctx.db, chatId, () => Promise.resolve(null));
  await invite(ctx.db, claim, invitedRow);
  // @ts-expect-error The invite row carries no room of its own, so it lands only in the claimed one.
  await invite(ctx.db, claim, { ...invitedRow, chatId });
});

test("a shared door takes the claim or a listed exemption, nothing else", async () => {
  await fenced(ctx, claim, []);
  await fenced(ctx, exempt, []);
  // @ts-expect-error A bare ChatId is neither a claim nor an exemption.
  await fenced(ctx, chatId, []);
  // @ts-expect-error An admission is neither.
  await fenced(ctx, admission, []);
  // @ts-expect-error A literal cannot stand in for an exemption.
  const forged: ClaimExempt = { chatId };
  expectTypeOf(forged).toEqualTypeOf(exempt);
});

test("the handoff re-key spends the accept gate's admission, never a bare room id", async () => {
  await rekey(admission, []);
  // @ts-expect-error rpg cannot mint an admission, so a bare ChatId cannot reach the re-key's claim.
  await rekey(chatId, []);
  expectTypeOf(rekey).parameter(0).toEqualTypeOf<RoomAdmission>();
});
