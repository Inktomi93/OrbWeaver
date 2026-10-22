import type { Principal } from "@orb/contracts/identity";
import type { TagTargetRef, TagTargetType } from "@orb/contracts/tag";
import type { CharacterId, ChatId, TagId } from "@orb/kit/ids";
import type { TagService } from "@orb/server/domain/tag";
import { expectTypeOf, test } from "vitest";

declare const service: TagService;
declare const principal: Principal;
declare const tagId: TagId;
declare const characterId: CharacterId;
declare const chatId: ChatId;
declare const rawId: string;
declare const target: TagTargetRef;

test("tag mutations retain canonical target correlation", async () => {
  expectTypeOf<TagTargetRef["targetType"]>().toEqualTypeOf<TagTargetType>();
  expectTypeOf(service.attachTag({ principal, tagId, ...target })).toEqualTypeOf<Promise<void>>();
  expectTypeOf(service.detachTag({ principal, tagId, ...target })).toEqualTypeOf<Promise<void>>();
  expectTypeOf(service.bulkAttachTag({ principal, tagIds: [tagId], ...target })).toEqualTypeOf<Promise<void>>();
  expectTypeOf(service.attachTag({ principal, tagId, targetType: "character", targetId: characterId })).toEqualTypeOf<Promise<void>>();
  expectTypeOf(service.attachTag({ principal, tagId, targetType: "chat", targetId: chatId })).toEqualTypeOf<Promise<void>>();

  // @ts-expect-error a chat id is not a character target
  await service.attachTag({ principal, tagId, targetType: "character", targetId: chatId });
  // @ts-expect-error detach preserves the same target-kind correlation
  await service.detachTag({ principal, tagId, targetType: "chat", targetId: characterId });
  // @ts-expect-error bulk attachment cannot widen the target kind
  await service.bulkAttachTag({ principal, tagIds: [tagId], targetType: "character", targetId: chatId });
  // @ts-expect-error internal callers carry the parsed entity id, not raw text
  await service.attachTag({ principal, tagId, targetType: "character", targetId: rawId });
});
