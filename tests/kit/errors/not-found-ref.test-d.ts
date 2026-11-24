import type { NotFoundRef } from "@orb/kit/errors";
import { DomainNotFoundError, notFoundIdRef } from "@orb/kit/errors";
import type { CharacterId, ChatId, PersonaId, UserId } from "@orb/kit/ids";
import { expectTypeOf, test } from "vitest";

declare const chatId: ChatId;
declare const userId: UserId;
declare const characterId: CharacterId;
declare const personaId: PersonaId;
declare const entity: { readonly kind: "character"; readonly id: CharacterId } | { readonly kind: "persona"; readonly id: PersonaId };

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
  // @ts-expect-error the old two-string form no longer compiles
  const legacy = new DomainNotFoundError("chat", chatId);
  expectTypeOf([wrongBrand, namedInvite, missing, legacy]).toEqualTypeOf<DomainNotFoundError[]>();
});

test("a kind and id held as correlated unions keep their pairing", () => {
  const paired = notFoundIdRef(entity.kind, entity.id);
  expectTypeOf(paired).toExtend<NotFoundRef>();
  // @ts-expect-error a character kind with a persona id is not a pair
  notFoundIdRef("character", personaId);
  expectTypeOf(notFoundIdRef("character", characterId)).toEqualTypeOf<{ readonly kind: "character"; readonly id: CharacterId }>();
});
