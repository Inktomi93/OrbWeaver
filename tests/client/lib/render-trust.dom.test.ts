// The plain-content, framed-media and framed-script verdicts, and the held-cards flag. The plain-content verdict over every row it can face: the reason a plain row names and the remedy each viewer gets,
// for a character's own setting, an inherited install default, a seat with no readable card (deleted, or a former
// host's after a handoff), a room with no consenting host, another person's row and an unattributed one. Each subject
// comes from `resolveRowRenderPolicy` over a roster seat parsed by the wire schema, as the transcript builds it.

import type { FramedScriptReason, PlainReason, PlainRemedy } from "@orb/client/lib";
import { resolveFramedMediaVerdict, resolveFramedScriptVerdict, resolvePlainVerdict, resolveRowRenderPolicy } from "@orb/client/lib";
import type { ParticipantView, RenderPolicy, RenderPolicySource } from "@orb/contracts/chat";
import { participantViewSchema, resolveNarratorRenderPolicy, resolveRenderPolicy, TALKATIVENESS_DEFAULT } from "@orb/contracts/chat";
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

// A framed row's withheld external media, over what `resolveRenderPolicy` folds from the install's and the
// character's own media settings: the install binds whenever it forbids, the character only when the install allows.
// Each case states the verdict per viewer; the install's remedy turns on admin standing, the character's on hosting.
const INSTALL_BINDS = {
  reason: "install-media",
  characterNamed: false,
  remedies: { "admin host": "system-trust", "admin member": "system-trust", host: "ask-admin", member: "ask-admin" },
} as const;
const CHARACTER_BINDS = {
  reason: "character-media",
  characterNamed: true,
  remedies: { "admin host": "character-trust", "admin member": "ask-host", host: "character-trust", member: "ask-host" },
} as const;
const FRAMED_MEDIA_CASES = [
  { install: true, character: true, binds: INSTALL_BINDS },
  { install: true, character: null, binds: INSTALL_BINDS },
  { install: false, character: true, binds: CHARACTER_BINDS },
  { install: false, character: false, binds: undefined },
] as const;

/** A character seat at `policy`, as the roster carries it. */
function mediaSeat(characterId: CharacterId, displayName: string, policy: RenderPolicy): ParticipantView {
  return { ...characterSeat(characterId, "trusted", "own"), displayName, renderPolicy: policy };
}

function framedSubject(
  characterId: CharacterId | null,
  seats: readonly ParticipantView[],
  install: boolean,
  viewerIsHost: boolean,
): Parameters<typeof resolveFramedMediaVerdict>[0] {
  return {
    characterId,
    participants: new Map(seats.flatMap((seat) => (seat.characterId === null ? [] : [[seat.characterId, seat] as const]))),
    narrator: resolveNarratorRenderPolicy(seats),
    installForbids: install,
    viewerIsHost,
  };
}

for (const { install, character, binds } of FRAMED_MEDIA_CASES) {
  test(`framed media with the install forbidding ${String(install)} and the character forbidding ${String(character)}`, () => {
    const characterId = mintTypeId(ID_PREFIX.character, ids.next);
    const policy = resolveRenderPolicy(
      { trustHtml: true, forbidExternalMedia: install, allowInteractiveCards: true },
      { trustHtml: true, interactiveHtml: false, forbidExternalMedia: character },
    );
    for (const viewer of VIEWERS) {
      const { viewerIsHost, isAdmin } = viewerStanding(viewer);
      const verdict = resolveFramedMediaVerdict(framedSubject(characterId, [mediaSeat(characterId, CHARACTER_NAME, policy)], install, viewerIsHost), isAdmin);
      const expected =
        binds === undefined
          ? undefined
          : {
              reason: binds.reason,
              remedy: binds.remedies[viewer],
              characterId: binds.characterNamed ? characterId : null,
              characterName: binds.characterNamed ? CHARACTER_NAME : undefined,
            };
      expect(verdict, viewer).toEqual(expected);
    }
  });
}

test("a narrator row's frame names the present character whose own setting forbids its media, not the first seat", () => {
  const allowing = mintTypeId(ID_PREFIX.character, ids.next);
  const forbidding = mintTypeId(ID_PREFIX.character, ids.next);
  const groupCharacter = mintTypeId(ID_PREFIX.character, ids.next);
  const allowingSeat = mediaSeat(allowing, "Arthur", { htmlTrust: "trusted", forbidExternalMedia: false });
  const seats = [allowingSeat, mediaSeat(forbidding, CHARACTER_NAME, { htmlTrust: "interactive", forbidExternalMedia: true })];
  expect(resolveFramedMediaVerdict(framedSubject(groupCharacter, seats, false, true), false)).toEqual({
    reason: "character-media",
    remedy: "character-trust",
    characterId: forbidding,
    characterName: CHARACTER_NAME,
  });
  // With every seat allowing, the narrator policy loads external media and nothing is withheld.
  const open = [allowingSeat, mediaSeat(forbidding, CHARACTER_NAME, { htmlTrust: "interactive", forbidExternalMedia: false })];
  expect(resolveFramedMediaVerdict(framedSubject(groupCharacter, open, false, true), false)).toBeUndefined();
});

test("framed media no seated character covers stays blocked with no remedy, even on an install that allows it", () => {
  const seated = mintTypeId(ID_PREFIX.character, ids.next);
  const seats = [mediaSeat(seated, CHARACTER_NAME, { htmlTrust: "trusted", forbidExternalMedia: false })];
  // A seatless selector in a room whose roster resolves no narrator policy, and a frame minted with no character.
  for (const subject of [framedSubject(mintTypeId(ID_PREFIX.character, ids.next), [], false, true), framedSubject(null, seats, false, true)]) {
    for (const isAdmin of [true, false]) {
      expect(resolveFramedMediaVerdict(subject, isAdmin)).toEqual({
        reason: "unattributed-media",
        remedy: "none",
        characterId: null,
        characterName: undefined,
      });
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

// A framed row's script posture, over the seat `resolveRenderPolicy` folds from the install ceiling and the character's
// stored pair, and the viewer's own switch. Each case states the verdict per viewer: the install's remedy turns on admin
// standing, the character's on hosting, and the viewer's own switch is every viewer's to change.
type ScriptExpectation = undefined | { readonly reason: FramedScriptReason; readonly named: boolean; readonly remedies: Readonly<Record<Viewer, PlainRemedy>> };
const INSTALL_HOLDS_SCRIPTS = {
  reason: "install-scripts",
  named: false,
  remedies: { "admin host": "system-trust", "admin member": "system-trust", host: "ask-admin", member: "ask-admin" },
} as const;
const CHARACTER_HOLDS_SCRIPTS = {
  reason: "character-scripts",
  named: true,
  remedies: { "admin host": "character-trust", "admin member": "ask-host", host: "character-trust", member: "ask-host" },
} as const;
const VIEWER_HOLDS_SCRIPTS = {
  reason: "viewer-scripts",
  named: false,
  remedies: { "admin host": "own-scripts", "admin member": "own-scripts", host: "own-scripts", member: "own-scripts" },
} as const;
const FRAMED_SCRIPT_CASES: readonly {
  readonly name: string;
  readonly install: boolean;
  readonly stored: { readonly trustHtml: boolean | null; readonly interactiveHtml: boolean | null };
  readonly viewerRuns: boolean;
  readonly expected: ScriptExpectation;
}[] = [
  {
    name: "an Interactive character under a lowered ceiling",
    install: false,
    stored: { trustHtml: true, interactiveHtml: true },
    viewerRuns: true,
    expected: INSTALL_HOLDS_SCRIPTS,
  },
  {
    name: "a lowered ceiling with the viewer's switch off too",
    install: false,
    stored: { trustHtml: true, interactiveHtml: true },
    viewerRuns: false,
    expected: INSTALL_HOLDS_SCRIPTS,
  },
  {
    name: "a Rich HTML character under a raised ceiling",
    install: true,
    stored: { trustHtml: true, interactiveHtml: false },
    viewerRuns: true,
    expected: CHARACTER_HOLDS_SCRIPTS,
  },
  {
    name: "an inheriting character with the viewer's switch off",
    install: true,
    stored: { trustHtml: null, interactiveHtml: null },
    viewerRuns: false,
    expected: VIEWER_HOLDS_SCRIPTS,
  },
  {
    name: "an inheriting character with every consent on",
    install: true,
    stored: { trustHtml: null, interactiveHtml: null },
    viewerRuns: true,
    expected: undefined,
  },
];

function scriptSubject(
  characterId: CharacterId | null,
  seats: readonly ParticipantView[],
  consents: { readonly install: boolean; readonly viewerRuns: boolean },
  viewerIsHost: boolean,
): Parameters<typeof resolveFramedScriptVerdict>[0] {
  return {
    characterId,
    participants: new Map(seats.flatMap((seat) => (seat.characterId === null ? [] : [[seat.characterId, seat] as const]))),
    narrator: resolveNarratorRenderPolicy(seats),
    installAllowsScripts: consents.install,
    viewerRunsScripts: consents.viewerRuns,
    viewerIsHost,
  };
}

for (const { name, install, stored, viewerRuns, expected } of FRAMED_SCRIPT_CASES) {
  test(`framed scripts for ${name}`, () => {
    const characterId = mintTypeId(ID_PREFIX.character, ids.next);
    const policy = resolveRenderPolicy(
      { trustHtml: true, forbidExternalMedia: false, allowInteractiveCards: install },
      { ...stored, forbidExternalMedia: false },
    );
    const seat = { ...mediaSeat(characterId, CHARACTER_NAME, policy), renderSource: stored.trustHtml === null ? "inherited" : "own" } as const;
    for (const viewer of VIEWERS) {
      const { viewerIsHost, isAdmin } = viewerStanding(viewer);
      const verdict = resolveFramedScriptVerdict(scriptSubject(characterId, [seat], { install, viewerRuns }, viewerIsHost), isAdmin);
      expect(verdict, viewer).toEqual(
        expected === undefined
          ? undefined
          : {
              reason: expected.reason,
              remedy: expected.remedies[viewer],
              characterId: expected.named ? characterId : null,
              characterName: expected.named ? CHARACTER_NAME : undefined,
            },
      );
    }
  });
}

test("a narrator row's frame names the seat that binds the narrator step, and a seat with no card names no one", () => {
  const interactive = mintTypeId(ID_PREFIX.character, ids.next);
  const richHtml = mintTypeId(ID_PREFIX.character, ids.next);
  const groupCharacter = mintTypeId(ID_PREFIX.character, ids.next);
  const seats = [
    mediaSeat(interactive, "Arthur", { htmlTrust: "interactive", forbidExternalMedia: false }),
    mediaSeat(richHtml, CHARACTER_NAME, { htmlTrust: "trusted", forbidExternalMedia: false }),
  ];
  expect(resolveFramedScriptVerdict(scriptSubject(groupCharacter, seats, { install: true, viewerRuns: true }, true), false)).toEqual({
    reason: "character-scripts",
    remedy: "character-trust",
    characterId: richHtml,
    characterName: CHARACTER_NAME,
  });
  const noCard = { ...characterSeat(richHtml, "trusted", "no-card"), renderPolicy: { htmlTrust: "trusted", forbidExternalMedia: false } } as const;
  for (const subject of [
    scriptSubject(richHtml, [noCard], { install: true, viewerRuns: true }, true),
    scriptSubject(mintTypeId(ID_PREFIX.character, ids.next), [], { install: true, viewerRuns: true }, true),
  ]) {
    expect(resolveFramedScriptVerdict(subject, true)).toEqual({ reason: "unattributed-scripts", remedy: "none", characterId: null, characterName: undefined });
  }
});

test("a game room with its card wrap off flags every row, carrying whether the viewer hosts, and no other room flags any", () => {
  const characterId = mintTypeId(ID_PREFIX.character, ids.next);
  const viewerUserId = mintUserId(ids.next);
  for (const htmlTrust of ["untrusted", "trusted"] as const) {
    const participants = new Map([[characterId, characterSeat(characterId, htmlTrust, "own")]]);
    const row = { role: "assistant", authorUserId: null, characterId, viewerUserId, participants } as const;
    expect(resolveRowRenderPolicy({ ...row, gameCardsOff: true, viewerIsHost: true }).heldCards, htmlTrust).toEqual({ viewerIsHost: true });
    expect(resolveRowRenderPolicy({ ...row, gameCardsOff: true }).heldCards, htmlTrust).toEqual({ viewerIsHost: false });
    expect(resolveRowRenderPolicy({ ...row, lenientHtmlCards: true, viewerIsHost: true }).heldCards, htmlTrust).toBeUndefined();
  }
});
