// The plain-content, framed-media and framed-script verdicts, the one notice's holds over them, the held-cards flag, and
// whose row loads external media.
// The plain-content verdict over every row it can face: the reason a plain row names and the remedy each viewer gets,
// for a character's own setting, an inherited install default, a seat with no readable card (deleted, or a former
// host's after a handoff), a room with no consenting host, another person's row and an unattributed one. A seat no card
// covers is Plain text, which no setting changes. Each subject comes from `resolveRowRenderPolicy` over a roster seat
// parsed by the wire schema, as the transcript builds it. The viewer's own message loads external media under the
// install's switch alone; another member's never does (docs/law/UI-Theming-and-Content.md §12.2).

import type { PlainRemedy, PlainSubject, TrustCause, TrustHold } from "@orb/client/lib";
import { actionHold, mergeTrustHolds, resolveFramedHolds, resolvePlainHolds, resolveRowRenderPolicy } from "@orb/client/lib";
import type { HtmlTrustStep, NarratorRenderPolicy, ParticipantView, RenderPolicy, RenderPolicySource } from "@orb/contracts/chat";
import { participantViewSchema, resolveNarratorRenderPolicy, resolveRenderPolicy, resolveSeatRenderPolicy, TALKATIVENESS_DEFAULT } from "@orb/contracts/chat";
import type { CharacterId } from "@orb/kit/ids";
import { ID_PREFIX, mintTypeId, mintUserId } from "@orb/kit/ids";
import { createSeededIds } from "@orb/testkit/iso";
import { expect, test } from "@orb/testkit/node";

const ids = createSeededIds();

type PlainReason = Exclude<TrustCause, `${string}-scripts` | `${string}-media`>;
type FramedScriptReason = Extract<TrustCause, `${string}-scripts`>;
type FramedHoldReads = Parameters<typeof resolveFramedHolds>[1];

/** The styling hold a plain row owes, read through the row's production door: its reason, remedy and named characters. */
function resolvePlainVerdict(
  subject: PlainSubject,
  isAdmin: boolean,
): { readonly reason: TrustCause; readonly remedy: PlainRemedy; readonly characters: TrustHold["characters"] } {
  const [styling] = resolvePlainHolds(subject, { scripts: false, media: false }, isAdmin);
  if (styling === undefined) {
    throw new Error("a plain row always holds its styling");
  }
  return { reason: styling.cause, remedy: styling.remedy, characters: styling.characters };
}
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
    remedies: { "admin host": "none", "admin member": "none", host: "none", member: "none" },
    named: false,
  },
  "no-host": {
    reason: "no-host",
    remedies: { "admin host": "none", "admin member": "none", host: "none", member: "none" },
    named: false,
  },
} as const satisfies Record<RenderPolicySource, Expected>;

function characterSeat(
  characterId: CharacterId,
  htmlTrust: "untrusted" | "trusted",
  source: RenderPolicySource,
  displayName = CHARACTER_NAME,
): ParticipantView {
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
    displayName,
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
        installForbidsExternalMedia: false,
        viewerIsHost,
      });
      expect(row.cardTier).toBe("tierA");
      if (row.plain === undefined) {
        throw new Error("a tierA row carries its plain subject");
      }
      expect(resolvePlainVerdict(row.plain, isAdmin)).toEqual({
        reason: expected.reason,
        remedy: expected.remedies[viewer],
        characters: expected.named ? [{ characterId, characterName: CHARACTER_NAME }] : [],
      });
    });
  }
}

test("a row another person wrote, and a row no seated character covers, offer no remedy to anyone", () => {
  const viewerUserId = mintUserId(ids.next);
  const member = resolveRowRenderPolicy({
    role: "user",
    authorUserId: mintUserId(ids.next),
    characterId: null,
    viewerUserId,
    installForbidsExternalMedia: false,
    viewerIsHost: true,
  });
  const unseated = resolveRowRenderPolicy({
    role: "assistant",
    authorUserId: null,
    characterId: mintTypeId(ID_PREFIX.character, ids.next),
    viewerUserId,
    installForbidsExternalMedia: false,
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
      expect(resolvePlainVerdict(row.plain, isAdmin)).toEqual({ reason, remedy: "none", characters: [] });
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

function framedSubject(characterId: CharacterId | null, seats: readonly ParticipantView[], install: boolean, viewerIsHost: boolean): FramedSubject {
  return {
    characterId,
    reads: {
      participants: new Map(seats.flatMap((seat) => (seat.characterId === null ? [] : [[seat.characterId, seat] as const]))),
      narrator: resolveNarratorRenderPolicy(seats),
      installForbids: install,
      viewerRunsScripts: true,
      viewerIsHost,
    },
  };
}

/** A frame's selector and the reads its holds are named from. */
interface FramedSubject {
  readonly characterId: CharacterId | null;
  readonly reads: FramedHoldReads;
}

// The server granted the frame neither kind, so each kind its markup asks for is held and the verdict names the holder.
const UNGRANTED = { externalMedia: false, interactive: false } as const;

/** The hold a frame whose markup names internet media owes, read through the row's production door. */
function framedMediaHold({ characterId, reads }: FramedSubject, isAdmin: boolean): TrustHold | undefined {
  const holds = resolveFramedHolds({ characterId, carriedFrom: [], granted: UNGRANTED, needsScripts: false, needsMedia: true }, reads, isAdmin);
  return holds[0];
}

/** The hold a frame whose markup needs scripts owes, read through the row's production door. */
function framedScriptHold({ characterId, reads }: FramedSubject, isAdmin: boolean): TrustHold | undefined {
  const holds = resolveFramedHolds({ characterId, carriedFrom: [], granted: UNGRANTED, needsScripts: true, needsMedia: false }, reads, isAdmin);
  return holds[0];
}

for (const { install, character, binds } of FRAMED_MEDIA_CASES) {
  test(`framed media with the install forbidding ${String(install)} and the character forbidding ${String(character)}`, () => {
    const characterId = mintTypeId(ID_PREFIX.character, ids.next);
    const policy = resolveRenderPolicy(
      { defaultHtmlStep: "interactive", forbidExternalMedia: install },
      { trustHtml: true, interactiveHtml: false, forbidExternalMedia: character },
    );
    for (const viewer of VIEWERS) {
      const { viewerIsHost, isAdmin } = viewerStanding(viewer);
      const verdict = framedMediaHold(framedSubject(characterId, [mediaSeat(characterId, CHARACTER_NAME, policy)], install, viewerIsHost), isAdmin);
      const expected =
        binds === undefined
          ? undefined
          : {
              kind: "media",
              cause: binds.reason,
              remedy: binds.remedies[viewer],
              characters: binds.characterNamed ? [{ characterId, characterName: CHARACTER_NAME }] : [],
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
  expect(framedMediaHold(framedSubject(groupCharacter, seats, false, true), false)).toEqual({
    kind: "media",
    cause: "character-media",
    remedy: "character-trust",
    characters: [{ characterId: forbidding, characterName: CHARACTER_NAME }],
  });
  // With every seat allowing, the narrator policy loads external media and nothing is withheld.
  const open = [allowingSeat, mediaSeat(forbidding, CHARACTER_NAME, { htmlTrust: "interactive", forbidExternalMedia: false })];
  expect(framedMediaHold(framedSubject(groupCharacter, open, false, true), false)).toBeUndefined();
});

test("framed media no seated character covers stays blocked with no remedy, even on an install that allows it", () => {
  const seated = mintTypeId(ID_PREFIX.character, ids.next);
  const seats = [mediaSeat(seated, CHARACTER_NAME, { htmlTrust: "trusted", forbidExternalMedia: false })];
  // A seatless selector in a room whose roster resolves no narrator policy, and a frame minted with no character.
  for (const subject of [framedSubject(mintTypeId(ID_PREFIX.character, ids.next), [], false, true), framedSubject(null, seats, false, true)]) {
    for (const isAdmin of [true, false]) {
      expect(framedMediaHold(subject, isAdmin)).toEqual({ kind: "media", cause: "unattributed-media", remedy: "none", characters: [] });
    }
  }
});

test("a narrator row held by two characters at one step names both, in roster order, and the host's remedy reaches each", () => {
  const aria = mintTypeId(ID_PREFIX.character, ids.next);
  const kai = mintTypeId(ID_PREFIX.character, ids.next);
  const participants = new Map([
    [aria, characterSeat(aria, "untrusted", "own", "Aria")],
    [kai, characterSeat(kai, "untrusted", "own", "Kai")],
  ]);
  const narrator: NarratorRenderPolicy = {
    renderPolicy: { htmlTrust: "untrusted", forbidExternalMedia: true },
    renderSource: "own",
    characterIds: [aria, kai],
  };
  const row = resolveRowRenderPolicy({
    role: "assistant",
    authorUserId: null,
    characterId: mintTypeId(ID_PREFIX.character, ids.next),
    viewerUserId: mintUserId(ids.next),
    participants,
    kind: "narrator",
    narrator,
    installForbidsExternalMedia: false,
    viewerIsHost: true,
  });
  if (row.plain === undefined) {
    throw new Error("a tierA row carries its plain subject");
  }
  expect(resolvePlainVerdict(row.plain, false)).toEqual({
    reason: "character",
    remedy: "character-trust",
    characters: [
      { characterId: aria, characterName: "Aria" },
      { characterId: kai, characterName: "Kai" },
    ],
  });
});

test("a narrator row with no character id renders at the floor, as its card frame does, while one with an id takes the room's policy", () => {
  const aria = mintTypeId(ID_PREFIX.character, ids.next);
  const narrator: NarratorRenderPolicy = { renderPolicy: { htmlTrust: "trusted", forbidExternalMedia: true }, renderSource: "own", characterIds: [aria] };
  const narratorRow = (characterId: CharacterId | null): ReturnType<typeof resolveRowRenderPolicy> =>
    resolveRowRenderPolicy({
      role: "assistant",
      authorUserId: null,
      characterId,
      viewerUserId: mintUserId(ids.next),
      participants: new Map([[aria, characterSeat(aria, "trusted", "own")]]),
      kind: "narrator",
      narrator,
      installForbidsExternalMedia: false,
      viewerIsHost: true,
    });
  expect(narratorRow(mintTypeId(ID_PREFIX.character, ids.next)).cardTier).toBe("tierB");
  const unbound = narratorRow(null);
  expect(unbound.cardTier).toBe("tierA");
  expect(unbound.plain === undefined ? undefined : resolvePlainVerdict(unbound.plain, true)).toEqual({
    reason: "unattributed",
    remedy: "none",
    characters: [],
  });
});

test("a row from a character that renders trusted HTML is not plain and carries no verdict subject", () => {
  const characterId = mintTypeId(ID_PREFIX.character, ids.next);
  const row = resolveRowRenderPolicy({
    role: "assistant",
    authorUserId: null,
    characterId,
    viewerUserId: mintUserId(ids.next),
    participants: new Map([[characterId, characterSeat(characterId, "trusted", "own")]]),
    installForbidsExternalMedia: false,
    viewerIsHost: true,
  });
  expect(row.cardTier).toBe("tierB");
  expect(row.plain).toBeUndefined();
});

// A framed row's script posture, over the seat `resolveRenderPolicy` folds from the install's default step and the
// character's stored pair, and the viewer's own switch. Each case states the verdict per viewer: a character's own step
// is the host's to change, the default an inheriting character takes is the admin's (or the host's, by giving the
// character its own step), and the viewer's own switch is every viewer's to change.
type ScriptExpectation = undefined | { readonly reason: FramedScriptReason; readonly named: boolean; readonly remedies: Readonly<Record<Viewer, PlainRemedy>> };
const DEFAULT_HOLDS_SCRIPTS = {
  reason: "install-scripts",
  named: true,
  remedies: { "admin host": "system-trust", "admin member": "system-trust", host: "character-trust", member: "ask-host" },
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
  readonly defaultStep: HtmlTrustStep;
  readonly stored: { readonly trustHtml: boolean | null; readonly interactiveHtml: boolean | null };
  readonly viewerRuns: boolean;
  readonly expected: ScriptExpectation;
}[] = [
  {
    name: "an Interactive character under a Rich HTML default",
    defaultStep: "trusted",
    stored: { trustHtml: true, interactiveHtml: true },
    viewerRuns: true,
    expected: undefined,
  },
  {
    name: "an Interactive character under a Plain text default with the viewer's switch off",
    defaultStep: "untrusted",
    stored: { trustHtml: true, interactiveHtml: true },
    viewerRuns: false,
    expected: VIEWER_HOLDS_SCRIPTS,
  },
  {
    name: "an inheriting character under a Rich HTML default",
    defaultStep: "trusted",
    stored: { trustHtml: null, interactiveHtml: null },
    viewerRuns: true,
    expected: DEFAULT_HOLDS_SCRIPTS,
  },
  {
    name: "an inheriting character under a Rich HTML default with the viewer's switch off too",
    defaultStep: "trusted",
    stored: { trustHtml: null, interactiveHtml: null },
    viewerRuns: false,
    expected: DEFAULT_HOLDS_SCRIPTS,
  },
  {
    name: "a Rich HTML character under an Interactive default",
    defaultStep: "interactive",
    stored: { trustHtml: true, interactiveHtml: false },
    viewerRuns: true,
    expected: CHARACTER_HOLDS_SCRIPTS,
  },
  {
    name: "an inheriting character with the viewer's switch off",
    defaultStep: "interactive",
    stored: { trustHtml: null, interactiveHtml: null },
    viewerRuns: false,
    expected: VIEWER_HOLDS_SCRIPTS,
  },
  {
    name: "an inheriting character with every consent on",
    defaultStep: "interactive",
    stored: { trustHtml: null, interactiveHtml: null },
    viewerRuns: true,
    expected: undefined,
  },
];

function scriptSubject(characterId: CharacterId | null, seats: readonly ParticipantView[], viewerRuns: boolean, viewerIsHost: boolean): FramedSubject {
  return {
    characterId,
    reads: {
      participants: new Map(seats.flatMap((seat) => (seat.characterId === null ? [] : [[seat.characterId, seat] as const]))),
      narrator: resolveNarratorRenderPolicy(seats),
      installForbids: false,
      viewerRunsScripts: viewerRuns,
      viewerIsHost,
    },
  };
}

for (const { name, defaultStep, stored, viewerRuns, expected } of FRAMED_SCRIPT_CASES) {
  test(`framed scripts for ${name}`, () => {
    const characterId = mintTypeId(ID_PREFIX.character, ids.next);
    const { renderPolicy, renderSource } = resolveSeatRenderPolicy(
      { defaultHtmlStep: defaultStep, forbidExternalMedia: false },
      { ...stored, forbidExternalMedia: false },
    );
    const seat = { ...mediaSeat(characterId, CHARACTER_NAME, renderPolicy), renderSource } as const;
    for (const viewer of VIEWERS) {
      const { viewerIsHost, isAdmin } = viewerStanding(viewer);
      const verdict = framedScriptHold(scriptSubject(characterId, [seat], viewerRuns, viewerIsHost), isAdmin);
      expect(verdict, viewer).toEqual(
        expected === undefined
          ? undefined
          : {
              kind: "scripts",
              cause: expected.reason,
              remedy: expected.remedies[viewer],
              characters: expected.named ? [{ characterId, characterName: CHARACTER_NAME }] : [],
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
  expect(framedScriptHold(scriptSubject(groupCharacter, seats, true, true), false)).toEqual({
    kind: "scripts",
    cause: "character-scripts",
    remedy: "character-trust",
    characters: [{ characterId: richHtml, characterName: CHARACTER_NAME }],
  });
  const noCard = { ...characterSeat(richHtml, "trusted", "no-card"), renderPolicy: { htmlTrust: "trusted", forbidExternalMedia: false } } as const;
  for (const subject of [scriptSubject(richHtml, [noCard], true, true), scriptSubject(mintTypeId(ID_PREFIX.character, ids.next), [], true, true)]) {
    expect(framedScriptHold(subject, true)).toEqual({ kind: "scripts", cause: "unattributed-scripts", remedy: "none", characters: [] });
  }
});

test("a game room with its card wrap off flags every row, carrying whether the viewer hosts, and no other room flags any", () => {
  const characterId = mintTypeId(ID_PREFIX.character, ids.next);
  const viewerUserId = mintUserId(ids.next);
  for (const htmlTrust of ["untrusted", "trusted"] as const) {
    const participants = new Map([[characterId, characterSeat(characterId, htmlTrust, "own")]]);
    const row = { role: "assistant", authorUserId: null, characterId, viewerUserId, participants, installForbidsExternalMedia: false } as const;
    expect(resolveRowRenderPolicy({ ...row, gameCardsOff: true, viewerIsHost: true }).heldCards, htmlTrust).toEqual({ viewerIsHost: true });
    expect(resolveRowRenderPolicy({ ...row, gameCardsOff: true }).heldCards, htmlTrust).toEqual({ viewerIsHost: false });
    expect(resolveRowRenderPolicy({ ...row, lenientHtmlCards: true, viewerIsHost: true }).heldCards, htmlTrust).toBeUndefined();
  }
});

// Whose row loads external media, by the install's switch: the viewer's own message follows it alone, another member's
// never loads, and a character's follows its resolved policy under the same install switch.
const ROW_MEDIA = {
  "the viewer's own message": { writer: "viewer", forbids: false, installAllows: true, installForbids: false },
  "another member's message": { writer: "member", forbids: false, installAllows: false, installForbids: false },
  "a character that allows media": { writer: "character", forbids: false, installAllows: true, installForbids: false },
  "a character that forbids media": { writer: "character", forbids: true, installAllows: false, installForbids: false },
} as const satisfies Record<
  string,
  { readonly writer: "viewer" | "member" | "character"; readonly forbids: boolean; readonly installAllows: boolean; readonly installForbids: boolean }
>;

test.for(Object.entries(ROW_MEDIA))("%s loads external media only as its row's rule says", ([, expected]) => {
  const { writer, forbids } = expected;
  const viewerUserId = mintUserId(ids.next);
  const characterId = mintTypeId(ID_PREFIX.character, ids.next);
  const human = writer !== "character";
  for (const installForbidsExternalMedia of [false, true]) {
    // The roster's policy already folds the install's switch in, as the server resolves it.
    const policy = { htmlTrust: "trusted", forbidExternalMedia: forbids || installForbidsExternalMedia } as const;
    const row = resolveRowRenderPolicy({
      role: human ? "user" : "assistant",
      authorUserId: { viewer: viewerUserId, member: mintUserId(ids.next), character: null }[writer],
      characterId: human ? null : characterId,
      viewerUserId,
      participants: new Map([[characterId, { ...characterSeat(characterId, "trusted", "own"), renderPolicy: policy }]]),
      installForbidsExternalMedia,
    });
    expect(row.allowExternal, String(installForbidsExternalMedia)).toBe(installForbidsExternalMedia ? expected.installForbids : expected.installAllows);
  }
});

// A plain row lists every kind its content holds back: its scripts share its styling's step, and its internet media is
// held by the install or by the character that forbids it, each with its own remedy.
test("a plain row's holds list its styling, the scripts and media its content asks for, and who holds each", () => {
  const characterId = mintTypeId(ID_PREFIX.character, ids.next);
  const plainRow = (installForbids: boolean, characterForbids: boolean): ReturnType<typeof resolveRowRenderPolicy> =>
    resolveRowRenderPolicy({
      role: "assistant",
      authorUserId: null,
      characterId,
      viewerUserId: mintUserId(ids.next),
      participants: new Map([
        [
          characterId,
          {
            ...characterSeat(characterId, "untrusted", "own"),
            renderPolicy: { htmlTrust: "untrusted", forbidExternalMedia: characterForbids || installForbids },
          },
        ],
      ]),
      installForbidsExternalMedia: installForbids,
      viewerIsHost: true,
    });
  const named = [{ characterId, characterName: CHARACTER_NAME }];
  const styling = { cause: "character", remedy: "character-trust", characters: named } as const;
  const subject = (row: ReturnType<typeof resolveRowRenderPolicy>): NonNullable<typeof row.plain> => {
    if (row.plain === undefined) {
      throw new Error("a tierA row carries its plain subject");
    }
    return row.plain;
  };
  // Styling alone: the content asks for nothing else.
  expect(resolvePlainHolds(subject(plainRow(false, false)), { scripts: false, media: false }, false)).toEqual([{ kind: "styling", ...styling }]);
  // Scripts and media that would load: scripts share the styling's cause, media is not held.
  expect(resolvePlainHolds(subject(plainRow(false, false)), { scripts: true, media: true }, false)).toEqual([
    { kind: "styling", ...styling },
    { kind: "scripts", ...styling },
  ]);
  // The character forbids its media: the host is sent to the same character.
  expect(resolvePlainHolds(subject(plainRow(false, true)), { scripts: false, media: true }, false)).toEqual([
    { kind: "styling", ...styling },
    { kind: "media", cause: "character-media", remedy: "character-trust", characters: named },
  ]);
  // The install forbids media: only an admin can change it.
  for (const [isAdmin, remedy] of [
    [true, "system-trust"],
    [false, "ask-admin"],
  ] as const) {
    expect(resolvePlainHolds(subject(plainRow(true, false)), { scripts: true, media: true }, isAdmin)).toEqual([
      { kind: "styling", ...styling },
      { kind: "scripts", ...styling },
      { kind: "media", cause: "install-media", remedy, characters: [] },
    ]);
  }
});

test("a framed document's holds come from its grant, and the roster only names the holder", () => {
  const characterId = mintTypeId(ID_PREFIX.character, ids.next);
  const seat = mediaSeat(characterId, CHARACTER_NAME, { htmlTrust: "trusted", forbidExternalMedia: true });
  const reads = { participants: new Map([[characterId, seat]]), narrator: undefined, installForbids: false, viewerRunsScripts: true, viewerIsHost: true };
  const frame = { characterId, carriedFrom: [], needsScripts: true, needsMedia: true } as const;
  const named = [{ characterId, characterName: CHARACTER_NAME }];
  expect(resolveFramedHolds({ ...frame, granted: { externalMedia: false, interactive: false } }, reads, false)).toEqual([
    { kind: "scripts", cause: "character-scripts", remedy: "character-trust", characters: named },
    { kind: "media", cause: "character-media", remedy: "character-trust", characters: named },
  ]);
  // A granted kind is not held, whatever the roster reads.
  expect(resolveFramedHolds({ ...frame, granted: { externalMedia: true, interactive: true } }, reads, false)).toEqual([]);
  // Markup that asks for neither holds nothing back.
  expect(resolveFramedHolds({ ...frame, needsScripts: false, needsMedia: false, granted: { externalMedia: false, interactive: false } }, reads, false)).toEqual(
    [],
  );
});

test("a narrator frame held by two characters at one step names both for its scripts", () => {
  const aria = mintTypeId(ID_PREFIX.character, ids.next);
  const kai = mintTypeId(ID_PREFIX.character, ids.next);
  const seats = [
    mediaSeat(aria, "Aria", { htmlTrust: "trusted", forbidExternalMedia: false }),
    mediaSeat(kai, "Kai", { htmlTrust: "trusted", forbidExternalMedia: false }),
  ];
  expect(framedScriptHold(scriptSubject(mintTypeId(ID_PREFIX.character, ids.next), seats, true, true), false)).toEqual({
    kind: "scripts",
    cause: "character-scripts",
    remedy: "character-trust",
    characters: [
      { characterId: aria, characterName: "Aria" },
      { characterId: kai, characterName: "Kai" },
    ],
  });
});

test("a row's holds merge once each in kind order, and the one action is the first the viewer can change", () => {
  const characterId = mintTypeId(ID_PREFIX.character, ids.next);
  const characters = [{ characterId, characterName: CHARACTER_NAME }];
  const media = { kind: "media", cause: "install-media", remedy: "ask-admin", characters: [] } as const;
  const scripts = { kind: "scripts", cause: "character-scripts", remedy: "character-trust", characters } as const;
  const viewerScripts = { kind: "scripts", cause: "viewer-scripts", remedy: "own-scripts", characters: [] } as const;
  const merged = mergeTrustHolds([media, scripts, media, scripts, viewerScripts]);
  expect(merged).toEqual([scripts, viewerScripts, media]);
  expect(actionHold(merged)).toBe(scripts);
  // A viewer who can change nothing gets no action; a character remedy with no character to open is no action either.
  expect(actionHold([media])).toBeUndefined();
  expect(actionHold([{ ...scripts, characters: [] }, viewerScripts])).toBe(viewerScripts);
});
