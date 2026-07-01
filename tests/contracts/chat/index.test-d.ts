import type { ChatBusEvent, InviteView, MessageSlot, MessageView } from "@orb/contracts/chat";
import { expectTypeOf, test } from "vitest";

// Type-level pins for the chat contract (moved out of `.contract.test.ts` per core/Spine-Testing.md §1 — the
// contract lane typechecks under noUnusedLocals, so `type _X = …` aliases belong in the `.test-d.ts` lane).

/** Distributes over each union member M; `K extends keyof M` is `false` for every member unless one
 *  declares K. The union collapses to `false` only when NO member has K — if a member GAINS K the union
 *  widens to `boolean`, so the `false` pin goes red. This is stronger than `not.toHaveProperty`, which
 *  only inspects the union's SHARED keys (a key on one member would slip past it). */
type UnionMemberHasKey<U, K extends PropertyKey> = U extends unknown
  ? K extends keyof U
    ? true
    : false
  : never;

// ── D26: the SLOT carries no content/reasoning/economics; the JOIN view (slot + variant) does ─────────
test("MessageSlot has no content/reasoning/economics key; MessageView carries content (D26)", () => {
  expectTypeOf<UnionMemberHasKey<MessageSlot, "content">>().toEqualTypeOf<false>();
  expectTypeOf<UnionMemberHasKey<MessageSlot, "reasoning">>().toEqualTypeOf<false>();
  // economics ride on the variant, surfaced only through the read model.
  expectTypeOf<UnionMemberHasKey<MessageSlot, "tokensOut">>().toEqualTypeOf<false>();
  // The read model DOES carry content (slot joined with its selected variant).
  expectTypeOf<UnionMemberHasKey<MessageView, "content">>().toEqualTypeOf<true>();
});

// ── BUS-PAYLOAD ALLOWLIST (Part III inv §11): secrets/credentials/caller id are UNREPRESENTABLE ───────
// No `ChatBusEvent` member declares a secret-bearing field, so each check collapses to `false`. If a
// producer added one, the distributed union would widen to `boolean` and the `false` pin would fail `tsc`.
test("ChatBusEvent cannot represent a secret / credential / baseUrl / caller id (D19, allowlist)", () => {
  expectTypeOf<UnionMemberHasKey<ChatBusEvent, "apiKey">>().toEqualTypeOf<false>();
  expectTypeOf<UnionMemberHasKey<ChatBusEvent, "token">>().toEqualTypeOf<false>();
  expectTypeOf<UnionMemberHasKey<ChatBusEvent, "secret">>().toEqualTypeOf<false>();
  expectTypeOf<UnionMemberHasKey<ChatBusEvent, "password">>().toEqualTypeOf<false>();
  expectTypeOf<UnionMemberHasKey<ChatBusEvent, "baseUrl">>().toEqualTypeOf<false>();
  expectTypeOf<UnionMemberHasKey<ChatBusEvent, "credential">>().toEqualTypeOf<false>();
  // No caller id on the public bus — turn attribution lives on the turn path (D19).
  expectTypeOf<UnionMemberHasKey<ChatBusEvent, "callerUserId">>().toEqualTypeOf<false>();
});

// ── InviteView exposes no token (raw or hashed) — a leak would let anyone redeem ──────────────────────
test("InviteView has no token field at the type level (no redeem-token leak)", () => {
  expectTypeOf<UnionMemberHasKey<InviteView, "token">>().toEqualTypeOf<false>();
});
