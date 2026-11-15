// The executor's author scope on an ephemeral pass: a standing selector reads the room as it is now, so the former
// host's row is a member's after a handoff, and a character's row and a departed human's row hold no standing; a
// script with no scope runs on every row.
// @subject packages/kit/src/regex/index.ts
// @subject packages/kit/src/message-author/index.ts

import type { CharacterId, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import type { ParticipantRole, RoomStanding } from "@orb/kit/message-author";
import type { RegexAuthorScope, RegexRowStamps, RegexScriptInput } from "@orb/kit/regex";
import { executeRegexScripts, messageTargetOf } from "@orb/kit/regex";
import { expect, test } from "@orb/testkit/node";

const ANA = castId<UserId>("user_ana");
const BEN = castId<UserId>("user_ben");
const GONE = castId<UserId>("user_gone");
const NARRATOR = castId<CharacterId>("character_narrator");

function humanRow(authorUserId: UserId): RegexRowStamps {
  return { role: "user", kind: "standard", authorUserId, characterId: null, personaId: null };
}
const CHARACTER_ROW: RegexRowStamps = { role: "assistant", kind: "standard", authorUserId: null, characterId: NARRATOR, personaId: null };

function room(entries: readonly (readonly [UserId, ParticipantRole])[]): RoomStanding {
  return { seatedRoles: Object.fromEntries(entries) };
}

function onDisplay(authors: RegexAuthorScope | undefined, row: RegexRowStamps, seats: RoomStanding): string {
  const script: RegexScriptInput = {
    enabled: true,
    targets: ["USER_INPUT", "AI_OUTPUT"],
    passes: ["display"],
    findRegex: "lamp",
    replaceString: "LAMP",
    ...(authors === undefined ? {} : { authors }),
  };
  return executeRegexScripts({
    text: "lamp",
    scripts: [script],
    call: { pass: "display", target: messageTargetOf(row), row, room: seats, depth: 0 },
    ctx: { char: "", user: "", persona: "", scenario: "", env: {} },
  });
}

const HOST_ONLY: RegexAuthorScope = { include: [{ by: "standing", standing: "host" }], exclude: [] };
const NOT_HOST: RegexAuthorScope = { include: [], exclude: [{ by: "standing", standing: "host" }] };

test("a host-only script follows the host across a handoff", () => {
  const before = room([
    [ANA, "host"],
    [BEN, "member"],
  ]);
  const after = room([
    [ANA, "member"],
    [BEN, "host"],
  ]);

  expect([onDisplay(HOST_ONLY, humanRow(ANA), before), onDisplay(HOST_ONLY, humanRow(ANA), after)]).toEqual(["LAMP", "lamp"]);
  expect(onDisplay(HOST_ONLY, humanRow(BEN), after)).toBe("LAMP");
});

test("a character's row and a departed human's row hold no standing, so a host-only script skips them and a not-host one does not", () => {
  const seats = room([[ANA, "host"]]);

  expect([onDisplay(HOST_ONLY, CHARACTER_ROW, seats), onDisplay(HOST_ONLY, humanRow(GONE), seats)]).toEqual(["lamp", "lamp"]);
  expect([onDisplay(NOT_HOST, CHARACTER_ROW, seats), onDisplay(NOT_HOST, humanRow(GONE), seats), onDisplay(NOT_HOST, humanRow(ANA), seats)]).toEqual([
    "LAMP",
    "LAMP",
    "lamp",
  ]);
});

test("a script with no author scope runs on every row", () => {
  const seats = room([[ANA, "host"]]);

  expect([humanRow(ANA), humanRow(GONE), CHARACTER_ROW].map((row) => onDisplay(undefined, row, seats))).toEqual(["LAMP", "LAMP", "LAMP"]);
});
