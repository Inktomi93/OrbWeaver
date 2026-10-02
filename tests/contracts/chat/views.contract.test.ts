import { chatListPageSchema, chatSummarySchema, turnOutcomeSchema, userMacroPicksViewSchema } from "@orb/contracts/chat";
import { ID_PREFIX, mintTypeId } from "@orb/kit/ids";
import { expect, test } from "../../support/fixtures.ts";

test("library rows retain per-viewer data while rejecting root and portrait widening", () => {
  const portrait = { characterId: mintTypeId(ID_PREFIX.character), name: "Aria", avatarHash: null };
  const row = {
    id: mintTypeId(ID_PREFIX.chat),
    title: null,
    starred: false,
    archived: false,
    lastMessageAt: null,
    viewerLastTurnAt: null,
    messageCount: 0,
    lastMessagePreview: null,
    isGame: false,
    gamePaused: true,
    participantNames: ["Aria"],
    participantPortraits: [portrait],
    viewerRole: "member",
    createdAt: 1,
    updatedAt: 1,
  };
  expect(chatSummarySchema.parse(row)).toEqual(row);
  expect(chatSummarySchema.safeParse({ ...row, ownerId: "private" }).success).toBe(false);
  expect(chatSummarySchema.safeParse({ ...row, participantPortraits: [{ ...portrait, privateCard: "private" }] }).success).toBe(false);
  const page = { items: [row], nextCursor: null, totalCount: 15, viewerLastTurnAt: null };
  expect(chatListPageSchema.parse(page)).toEqual(page);
});

test("aborted turns and dynamic macro picks preserve their distinct wire semantics", () => {
  const outcome = { messages: [], aborted: true };
  expect(turnOutcomeSchema.parse(outcome)).toEqual(outcome);
  expect(turnOutcomeSchema.safeParse({ ...outcome, privateTurn: true }).success).toBe(false);
  const picks = { macros: [], values: { customMacro: { customInput: "retained" } } };
  expect(userMacroPicksViewSchema.parse(picks)).toEqual(picks);
  expect(userMacroPicksViewSchema.safeParse({ ...picks, hiddenBody: "private" }).success).toBe(false);
});
