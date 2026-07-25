import type { ChatBusEvent, ChatContentPart, InviteView, MessageSlot, MessageView } from "@orb/contracts/chat";
import { expectTypeOf, test } from "vitest";

// Type-level pins for the chat contract (moved out of `.contract.test.ts` per core/Spine-Testing.md §1 — the
// contract lane typechecks under noUnusedLocals, so `type _X = …` aliases belong in the `.test-d.ts` lane).

/** Distributes over each union member M; `K extends keyof M` is `false` for every member unless one
 *  declares K. The union collapses to `false` only when NO member has K — if a member GAINS K the union
 *  widens to `boolean`, so the `false` pin goes red. This is stronger than `not.toHaveProperty`, which
 *  only inspects the union's SHARED keys (a key on one member would slip past it). */
type UnionMemberHasKey<U, K extends PropertyKey> = U extends unknown ? (K extends keyof U ? true : false) : never;

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

// ── D16 POSITIVE ANCHOR ALLOWLIST: the bus vocabulary is CLOSED, and canon bytes always carry an anchor ─
// The deny-list above is keyed on secret NAMES, so it cannot see a NEW content-bearing member (`{ type:
// "noteAdded"; chatId; note: string }` passes every check up there). These three pins are the POSITIVE
// complement — they enumerate what a member MAY declare, so a new member is RED by default:
//
//  1. KEY VOCABULARY — the union of every member's keys is exactly this closed set. A member declaring any
//     other key widens the union and fails here, forcing a deliberate, reviewed vocabulary extension.
//  2. RAW-STRING KEYS — the only key on the whole bus whose value is unconstrained `string` (free text) is
//     `turnStarted.model`. Branded ids (`ChatId`) and enum literals (`ChatWarningCode`) do NOT satisfy
//     `string extends T`, so this axis is independent of (1): renaming a free-text field to an
//     already-allowlisted key still fails.
//  3. STRUCTURED CARRIERS — the only non-scalar, non-id-array payloads are `view` (a `MessageView`, anchored
//     by its own `seq`) and `delta` (raw streamed tokens, anchored by the SIBLING `slotSeq` the one emit
//     site stamps). This is the set `substrate/auth/clamp.ts::canonAnchorSeq` inspects, so a member that
//     carries canon bytes inherits `isBelowHistoryFloor` instead of riding through it: to ship content you
//     must use `view`/`delta`, and both are anchored — the clamp then covers you automatically.
//
// Together: a content-bearing member cannot land without either an anchor or a visible edit to these pins.

/** Distributes over each member; the union of every key any member declares. */
type BusMemberKeys<U> = U extends unknown ? keyof U : never;

/** Keys whose value type is the RAW, unconstrained `string` — the only shape that can carry free text.
 *  A branded id (`string & {…}`) and a string-literal union do NOT satisfy `string extends T`. */
type RawStringKeys<U> = U extends unknown ? { [K in keyof U]-?: string extends U[K] ? K : never }[keyof U] : never;

/** Keys whose value is a STRUCTURED payload — excluding scalars, branded ids (string-assignable), and
 *  id ARRAYS (the ratified activity plane: `messageIds`/`entryIds` name rows, they don't carry bytes). */
type StructuredKeys<U> = U extends unknown
  ? {
      [K in keyof U]-?: NonNullable<U[K]> extends string | number | boolean | readonly unknown[] ? never : NonNullable<U[K]> extends object ? K : never;
    }[keyof U]
  : never;

test("ChatBusEvent's key vocabulary is CLOSED (a new member's free-text field is RED — D16 anchor allowlist)", () => {
  expectTypeOf<BusMemberKeys<ChatBusEvent>>().toEqualTypeOf<
    | "type"
    | "chatId"
    // delta: raw tokens + their canon anchor
    | "slotSeq"
    | "delta"
    // canon mutations: the id plane + the anchored view carrier
    | "messageId"
    | "messageIds"
    | "view"
    // turn lifecycle (scalars + enum literals + ids)
    | "intent"
    | "api"
    | "source"
    | "model"
    | "speakerCharacterId"
    | "targetMessageId"
    | "reason"
    | "automationDepth"
    | "code"
    // world-info activation + attachment (embedded WiBusEvent)
    | "entryIds"
    | "surface"
    | "bookId"
    | "entryId"
    | "scope"
    // persona switch
    | "from"
    | "to"
  >();
});

test("the ONLY free-text (raw `string`) field on the chat bus is turnStarted.model (D16 anchor allowlist)", () => {
  expectTypeOf<RawStringKeys<ChatBusEvent>>().toEqualTypeOf<"model">();
});

test("the ONLY structured canon carriers are `view` + `delta`, and both are seq-anchored (D16 anchor allowlist)", () => {
  expectTypeOf<StructuredKeys<ChatBusEvent>>().toEqualTypeOf<"view" | "delta">();
  // `view` is anchored by its OWN seq; `delta` by the sibling `slotSeq` — the two carriers canonAnchorSeq reads.
  expectTypeOf<MessageView["seq"]>().toEqualTypeOf<number>();
  expectTypeOf<UnionMemberHasKey<Extract<ChatBusEvent, { delta: unknown }>, "slotSeq">>().toEqualTypeOf<true>();
});

// ── InviteView exposes no token (raw or hashed) — a leak would let anyone redeem ──────────────────────
test("InviteView has no token field at the type level (no redeem-token leak)", () => {
  expectTypeOf<UnionMemberHasKey<InviteView, "token">>().toEqualTypeOf<false>();
});

// ── ChatContentPart — the D48 exhaustive-member pin (tool-use-design/02 §1) ───────────────────────────
// A translator maps parts by `type`; this pin makes ADDING a member a visible red HERE (update the
// literal union below + audit every translator's dispatch — the D45 image-parts landing discipline).
test("ChatContentPart is exactly text|image|tool-call|tool-result; tool parts carry the wire join", () => {
  expectTypeOf<ChatContentPart["type"]>().toEqualTypeOf<"text" | "image" | "tool-call" | "tool-result">();
  // The exchange join: both tool members carry toolCallId; neither leaks a parsed-arguments object.
  expectTypeOf<Extract<ChatContentPart, { type: "tool-call" }>["arguments"]>().toEqualTypeOf<string>();
  expectTypeOf<Extract<ChatContentPart, { type: "tool-result" }>["content"]>().toEqualTypeOf<string>();
});
