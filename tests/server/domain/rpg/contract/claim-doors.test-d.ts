// @subject packages/server/src/domain/rpg/snapshot-edit.ts
// @subject packages/server/src/domain/rpg/persistence/sheets.ts
// D166: an rpg room write takes the claim and a hand write takes chat's admission, so neither runs before its claim and
// rpg cannot claim with a room id it named itself.
import type { RoomAdmission, RoomClaim } from "@orb/contracts/chat";
import type { ChatId } from "@orb/kit/ids";
import { expectTypeOf, test } from "vitest";
import type { RpgAuthorized } from "#server/domain/rpg/contract/service.ts";
import type { insertJournalEntry } from "#server/domain/rpg/persistence/journal.ts";
import type { upsertSheet } from "#server/domain/rpg/persistence/sheets.ts";
import type { writeHandState } from "#server/domain/rpg/snapshot-edit.ts";

declare const chatId: ChatId;
declare const authorized: RpgAuthorized;

test("the rpg gate hands on chat's admission, and the hand door spends it", () => {
  expectTypeOf<RpgAuthorized["admission"]>().toEqualTypeOf<RoomAdmission>();
  expectTypeOf<Parameters<typeof writeHandState>[1]>().toEqualTypeOf<Pick<RpgAuthorized, "game" | "admission">>();
  // @ts-expect-error A game with a bare room id in place of the admission cannot reach the hand door's claim.
  const unadmitted: Parameters<typeof writeHandState>[1] = { game: authorized.game, admission: chatId };
  expectTypeOf(unadmitted).toBeObject();
});

test("the rpg persistence doors take the claim", () => {
  expectTypeOf<Parameters<typeof upsertSheet>[1]>().toEqualTypeOf<RoomClaim>();
  expectTypeOf<Parameters<typeof insertJournalEntry>[1]>().toEqualTypeOf<RoomClaim>();
  // @ts-expect-error An admission proves the gate, not the claim.
  expectTypeOf<RoomAdmission>().toExtend<Parameters<typeof upsertSheet>[1]>();
});
