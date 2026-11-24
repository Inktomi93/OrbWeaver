import type { NotFoundRef } from "@orb/kit/errors";
import { DomainNotFoundError, notFoundIdRef } from "@orb/kit/errors";
import type { CharacterId, ChatId, PersonaId, UserId } from "@orb/kit/ids";
import { expectTypeOf, test } from "vitest";

declare const chatId: ChatId;
declare const userId: UserId;
declare const characterId: CharacterId;
declare const personaId: PersonaId;
declare const entity: readonly ["character", CharacterId] | readonly ["persona", PersonaId];
declare const entityKind: "character" | "persona";
declare const entityId: CharacterId | PersonaId;

test("a not-found ref carries the brand of its kind", () => {
  expectTypeOf<Extract<NotFoundRef, { readonly kind: "chat" }>>().toEqualTypeOf<{ readonly kind: "chat"; readonly id: ChatId }>();
  expectTypeOf<Extract<NotFoundRef, { readonly kind: "user" }>>().toEqualTypeOf<{ readonly kind: "user"; readonly id: UserId }>();
});

test("an id of another kind cannot be thrown under a kind", () => {
  // @ts-expect-error a chat is named by a chat id, never a user id
  const wrongBrand = new DomainNotFoundError({ kind: "chat", id: userId });
  // @ts-expect-error an invite is found by a secret token, so its ref names no id
  const namedInvite = new DomainNotFoundError({ kind: "invite", id: chatId });
  // @ts-expect-error an id kind cannot drop its id
  const missing = new DomainNotFoundError({ kind: "chat" });
  // @ts-expect-error the old two-string call no longer compiles
  const legacy = new DomainNotFoundError("chat", chatId);
  expectTypeOf([wrongBrand, namedInvite, missing, legacy]).toEqualTypeOf<DomainNotFoundError[]>();
});

test("a kind and id held as a tuple of correlated unions keep their pairing", () => {
  expectTypeOf(notFoundIdRef(...entity)).toExtend<NotFoundRef>();
  expectTypeOf(notFoundIdRef("character", characterId)).toExtend<NotFoundRef>();
});

test("a union of kinds does not pair an id with a kind it does not belong to", () => {
  expectTypeOf(notFoundIdRef<"character" | "persona">(...entity)).toExtend<NotFoundRef>();
  // @ts-expect-error a character kind with a persona id is not a pair
  notFoundIdRef("character", personaId);
  // @ts-expect-error naming both kinds still pairs each id with its own kind
  notFoundIdRef<"character" | "persona">("character", personaId);
  // @ts-expect-error two separate unions are not a pair: the kind could be persona while the id is a character's
  notFoundIdRef(entityKind, entityId);
});
