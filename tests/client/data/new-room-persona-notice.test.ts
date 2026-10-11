// The new-room persona notice: said only when something other than the default decided who you play.

import { ID_PREFIX, mintTypeId } from "@orb/kit/ids";
import { newRoomPersonaNotice } from "#client/data/new-room-persona-notice.ts";
import { expect, test } from "../../support/fixtures.ts";

const MARA = mintTypeId(ID_PREFIX.persona);
const DEFAULT = mintTypeId(ID_PREFIX.persona);

function room(seat: typeof MARA | null, characters: readonly string[]): Parameters<typeof newRoomPersonaNotice>[0] {
  return {
    viewerActivePersonaId: seat,
    identities: [{ kind: "persona", id: MARA, name: "Mara", description: "", avatarHash: null }],
    participants: characters.map((displayName) => ({ kind: "character", displayName })),
  };
}

test("the default deciding says nothing", () => {
  expect(newRoomPersonaNotice(room(MARA, ["Aria"]), { defaultPersonaId: MARA })).toBeNull();
});

test("a seat other than a set default in a one-character room names the persona and the connected character", () => {
  const notice = newRoomPersonaNotice(room(MARA, ["Aria"]), { defaultPersonaId: DEFAULT });
  expect(notice).toContain("Mara");
  expect(notice).toContain("Aria");
});

test("with no default, the notice names the persona and no character", () => {
  const notice = newRoomPersonaNotice(room(MARA, ["Aria"]), { defaultPersonaId: null });
  expect(notice).toContain("Mara");
  expect(notice).not.toContain("Aria");
});

test("an empty seat, or a group room whose seat differs from the default, says nothing", () => {
  expect(newRoomPersonaNotice(room(null, ["Aria"]), { defaultPersonaId: null })).toBeNull();
  expect(newRoomPersonaNotice(room(MARA, ["Aria", "Kai"]), { defaultPersonaId: DEFAULT })).toBeNull();
});
