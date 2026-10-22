import type { useAcceptSuggestion, useRejectSuggestion } from "@orb/client/components";
import type { TagTargetRef } from "@orb/contracts/tag";
import type { CharacterId, ChatId, TagId } from "@orb/kit/ids";
import { expectTypeOf, test } from "vitest";

declare const accept: ReturnType<typeof useAcceptSuggestion>;
declare const reject: ReturnType<typeof useRejectSuggestion>;
declare const tagId: TagId;
declare const characterId: CharacterId;
declare const chatId: ChatId;
declare const target: TagTargetRef;

test("suggestion mutation callbacks preserve branded target correlation before serialization", () => {
  expectTypeOf(accept.mutate({ tagId, ...target })).toEqualTypeOf<void>();
  expectTypeOf(reject.mutate({ tagId, ...target })).toEqualTypeOf<void>();
  expectTypeOf(accept.mutate({ tagId, targetType: "character", targetId: characterId, status: "accepted" })).toEqualTypeOf<void>();

  // @ts-expect-error the wire's raw string input does not erase the client callback's character id
  accept.mutate({ tagId, targetType: "character", targetId: chatId });
  // @ts-expect-error reject preserves the same branded target correlation
  reject.mutate({ tagId, targetType: "chat", targetId: characterId });
});
