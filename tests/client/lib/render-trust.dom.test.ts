// The plain-content verdict over every row it can face: the reason a plain row names and the remedy each viewer gets,
// for a character's own setting, an inherited install default, a seat with no readable card (deleted, or a former
// host's after a handoff), a room with no consenting host, another person's row and an unattributed one. Each subject
// comes from `resolveRowRenderPolicy` over a roster seat parsed by the wire schema, as the transcript builds it.

import type { PlainReason, PlainRemedy } from "@orb/client/lib";
import { resolvePlainVerdict, resolveRowRenderPolicy } from "@orb/client/lib";
import type { ParticipantView, RenderPolicySource } from "@orb/contracts/chat";
import { participantViewSchema, TALKATIVENESS_DEFAULT } from "@orb/contracts/chat";
import type { CharacterId } from "@orb/kit/ids";
import { ID_PREFIX, mintTypeId, mintUserId } from "@orb/kit/ids";
import { createSeededIds } from "@orb/testkit/iso";
import { expect, test } from "@orb/testkit/node";

const ids = createSeededIds();
const CHARACTER_NAME = "Charlotte";

const VIEWERS = ["admin host", "admin member", "host", "member"] as const;
type Viewer = (typeof VIEWERS)[number];

interface Expected {
  readonly reason: PlainReason;
  readonly remedies: Readonly<Record<Viewer, PlainRemedy>>;
  /** Whether the verdict names the character, so a control may open its settings. */
  readonly named: boolean;
}

// One row per source the server can stamp on a seat, so a new source fails `tsc` here until it has a row.
const BY_SOURCE = {
  own: {
    reason: "character",
    remedies: { "admin host": "character-trust", "admin member": "ask-host", host: "character-trust", member: "ask-host" },
    named: true,
  },
  inherited: {
    reason: "install",
    remedies: { "admin host": "system-trust", "admin member": "system-trust", host: "character-trust", member: "ask-host" },
    named: true,
  },
  "no-card": {
    reason: "no-card",
    remedies: { "admin host": "system-trust", "admin member": "system-trust", host: "ask-admin", member: "ask-admin" },
    named: false,
  },
  "no-host": {
    reason: "no-host",
    remedies: { "admin host": "system-trust", "admin member": "system-trust", host: "ask-admin", member: "ask-admin" },
    named: false,
  },
} as const satisfies Record<RenderPolicySource, Expected>;

function characterSeat(characterId: CharacterId, htmlTrust: "untrusted" | "trusted", source: RenderPolicySource): ParticipantView {
  return participantViewSchema.parse({
    id: mintTypeId(ID_PREFIX.chatParticipant, ids.next),
    chatId: mintTypeId(ID_PREFIX.chat, ids.next),
    kind: "character",
    userId: null,
    characterId,
    role: "member",
    activePersonaId: null,
    talkativeness: TALKATIVENESS_DEFAULT,
    disabled: false,
    joinedAt: 0,
    joinSeq: 1,
    leftSeq: null,
    joinHistoryVisibility: "full",
    displayName: CHARACTER_NAME,
    handle: null,
    avatarAssetId: null,
    avatarHash: null,
    renderPolicy: { htmlTrust, forbidExternalMedia: true },
    renderSource: source,
  });
}

function viewerStanding(viewer: Viewer): { readonly viewerIsHost: boolean; readonly isAdmin: boolean } {
  return { viewerIsHost: viewer === "host" || viewer === "admin host", isAdmin: viewer.startsWith("admin") };
}

// The production wire enum, so the cases are exactly the sources a seat can carry.
for (const source of participantViewSchema.shape.renderSource.unwrap().options) {
  const expected: Expected = BY_SOURCE[source];
  for (const viewer of VIEWERS) {
    test(`a character row from a seat whose policy is ${source}, seen by the room's ${viewer}`, () => {
      const characterId = mintTypeId(ID_PREFIX.character, ids.next);
      const { viewerIsHost, isAdmin } = viewerStanding(viewer);
      const row = resolveRowRenderPolicy({
        role: "assistant",
        authorUserId: null,
        characterId,
        viewerUserId: mintUserId(ids.next),
        participants: new Map([[characterId, characterSeat(characterId, "untrusted", source)]]),
        viewerIsHost,
      });
      expect(row.cardTier).toBe("tierA");
      if (row.plain === undefined) {
        throw new Error("a tierA row carries its plain subject");
      }
      expect(resolvePlainVerdict(row.plain, isAdmin)).toEqual({
        reason: expected.reason,
        remedy: expected.remedies[viewer],
        characterId: expected.named ? characterId : null,
        characterName: expected.named ? CHARACTER_NAME : undefined,
      });
    });
  }
}

test("a row another person wrote, and a row no seated character covers, offer no remedy to anyone", () => {
  const viewerUserId = mintUserId(ids.next);
  const member = resolveRowRenderPolicy({ role: "user", authorUserId: mintUserId(ids.next), characterId: null, viewerUserId, viewerIsHost: true });
  const unseated = resolveRowRenderPolicy({
    role: "assistant",
    authorUserId: null,
    characterId: mintTypeId(ID_PREFIX.character, ids.next),
    viewerUserId,
    viewerIsHost: true,
  });
  for (const [row, reason] of [
    [member, "member"],
    [unseated, "unattributed"],
  ] as const) {
    if (row.plain === undefined) {
      throw new Error("a tierA row carries its plain subject");
    }
    for (const isAdmin of [true, false]) {
      expect(resolvePlainVerdict(row.plain, isAdmin)).toEqual({ reason, remedy: "none", characterId: null, characterName: undefined });
    }
  }
});

test("a row from a character that renders trusted HTML is not plain and carries no verdict subject", () => {
  const characterId = mintTypeId(ID_PREFIX.character, ids.next);
  const row = resolveRowRenderPolicy({
    role: "assistant",
    authorUserId: null,
    characterId,
    viewerUserId: mintUserId(ids.next),
    participants: new Map([[characterId, characterSeat(characterId, "trusted", "own")]]),
    viewerIsHost: true,
  });
  expect(row.cardTier).toBe("tierB");
  expect(row.plain).toBeUndefined();
});
