import type { CharacterId, ChatId, MessageId, TypeIdOf, UserId, VerifiedUserId, WorldBookId } from "@orb/kit/ids";
import { brandedId, castId, ID_PREFIX, mintTypeId, typeIdSchema } from "@orb/kit/ids";
import { assertType, expectTypeOf, test } from "vitest";
import { z } from "zod";

// The brands are the 446-importer universal leaf — a collision (e.g. a `Branded`/`TypeIdOf`
// regression that makes two entity ids structurally equal) is a SILENT type hole no runtime
// test can catch. These type-level assertions pin brand distinctness at `tsc` time.

test("distinct entity brands are mutually non-assignable", () => {
  expectTypeOf<ChatId>().not.toEqualTypeOf<MessageId>();
  expectTypeOf<ChatId>().not.toEqualTypeOf<CharacterId>();
  // The non-TypeID brand (UserId) is also distinct from a TypeID brand.
  expectTypeOf<UserId>().not.toEqualTypeOf<ChatId>();
});

test("a branded id is assignable TO string, but a plain string is NOT a brand", () => {
  // Branded<B> = string & {…} → widens to string freely.
  expectTypeOf<ChatId>().toExtend<string>();
  // …but the reverse is blocked: a raw string cannot satisfy the brand.
  expectTypeOf<string>().not.toExtend<ChatId>();
});

// #854 — `VerifiedUserId` is a SUB-brand, not a sibling: `packages/client/src/state/durable-local.ts`
// must accept only the session-verified viewer id at `bindDurableLocalToUser` while every other id it
// handles (the browser-writable `orb:active-user` boot hint) stays a plain `UserId`. That needs BOTH
// directions to hold, and only a type-level pin can see either.
test("VerifiedUserId narrows UserId in ONE direction — a bare UserId can never reach a verified boundary", () => {
  // A verified id IS a user id (it flows freely into every UserId-typed read).
  expectTypeOf<VerifiedUserId>().toExtend<UserId>();
  // ...and the reverse is blocked: this is what makes a client-derived id a compile error at the bind.
  expectTypeOf<UserId>().not.toExtend<VerifiedUserId>();
  // Not the same type, so the narrowing cannot be collapsed away by an alias.
  expectTypeOf<VerifiedUserId>().not.toEqualTypeOf<UserId>();
  // Still a string at the wire (it is the same runtime value — the brand is phantom).
  expectTypeOf<VerifiedUserId>().toExtend<string>();
  expectTypeOf<string>().not.toExtend<VerifiedUserId>();
});

test("castId produces exactly the requested brand", () => {
  const id = castId<ChatId>("chat_x");
  expectTypeOf(id).toEqualTypeOf<ChatId>();
  expectTypeOf(id).not.toEqualTypeOf<MessageId>();
});

test("mintTypeId infers TypeIdOf<prefix> from the ID_PREFIX value", () => {
  const chat = mintTypeId(ID_PREFIX.chat);
  expectTypeOf(chat).toEqualTypeOf<TypeIdOf<"chat">>();
  // ID_PREFIX.chat is the literal "chat", not a widened string.
  expectTypeOf(ID_PREFIX.chat).toEqualTypeOf<"chat">();
});

test("brandedId<T> accepts plain strings and yields the requested brand", () => {
  const schema = brandedId<UserId>();
  const wrapped = z.object({ userId: schema });
  expectTypeOf<z.input<typeof schema>>().toEqualTypeOf<string>();
  expectTypeOf<number>().not.toExtend<z.input<typeof schema>>();
  expectTypeOf<{ readonly wrong: true }>().not.toExtend<z.input<typeof schema>>();
  expectTypeOf<z.infer<typeof schema>>().toEqualTypeOf<UserId>();
  // @orb-waive brand-in-name-position(userId): z.input is the PRE-parse wire shape — it IS string, not the branded output; ends when z.input infers the branded type
  expectTypeOf<z.input<typeof wrapped>>().toEqualTypeOf<{ userId: string }>();
  expectTypeOf<z.infer<typeof wrapped>>().toEqualTypeOf<{ userId: UserId }>();
  expectTypeOf(schema.parse("u")).toEqualTypeOf<UserId>();
  assertType<UserId>(schema.parse("u"));
});

// #641 — `z.ZodType`'s Input generic defaults to `unknown` (zod 4.4.3); a schema built without
// pinning it makes every field typed through `z.input<>` (an authored, pre-parse shape — e.g.
// `AutomationActionInput`) accept ANY value, not just a wrong string. `unknown` is a valid target
// for an assignment of literally anything, so the hole was silent at every construction site.
test("typeIdSchema's z.input is `string` (a validating pre-parse boundary), never `unknown`", () => {
  const schema = typeIdSchema(ID_PREFIX.worldBook);
  // The pre-parse INPUT is the raw wire string — by design NOT yet branded (the transform mints the
  // brand). This is the correctly-narrow input type; `unknown` was the defect, not `WorldBookId`.
  expectTypeOf<z.input<typeof schema>>().toEqualTypeOf<string>();
  // A non-string can no longer satisfy a field typed through this schema's input — this is what a
  // widened `unknown` silently let through pre-fix (a number, an object, anything).
  expectTypeOf<number>().not.toExtend<z.input<typeof schema>>();
  // The OUTPUT (post-parse) side was always correctly branded and stays so — this fix does not
  // touch it. `z.input<>` erasure never reached `z.infer<>`/output reads.
  expectTypeOf<z.infer<typeof schema>>().toEqualTypeOf<WorldBookId>();
  // Assigning a validated brand INTO the input position is fine (a brand widens to string) —
  // the fix narrows what a bare/wrong-shaped value can do, not what a correct one can do.
  expectTypeOf<WorldBookId>().toExtend<z.input<typeof schema>>();
});
