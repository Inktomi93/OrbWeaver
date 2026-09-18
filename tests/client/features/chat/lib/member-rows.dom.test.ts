// Unit: the MEMBERS-panel row PROJECTIONS (features/chat/lib/member-rows) — `ParticipantView[]` + the
// room's cast producer → the rows the panel renders.
//
// THE LOAD-BEARING PIN IS THE HUMAN ROW'S IDENTITY (#162, owner-observed live 2026-08-17 under
// AUTH_MODE=oidc): a human seat renders the PERSONA it is playing, and it renders exactly ONE identity. The
// row used to append ` · ${handle}` as well, and on that install the handle IS the owner's email address —
// `users` has no display-name column at all, so the server's `publics.displayName ?? handle` rule falls back
// to it on EVERY row, and the seat read "owner@example.com · owner@example.com".

import type { ChatIdentity } from "@orb/contracts/chat";
import type { CharacterId, Handle, PersonaId, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import type { MemberRowSources } from "../../../../../packages/client/src/features/chat/lib/member-rows.ts";
import { rowAccessibleName, toCharacterRows, toPersonRows } from "../../../../../packages/client/src/features/chat/lib/member-rows.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { makeParticipant } from "./_support.ts";

const OWNER_ID = castId<UserId>("user_owner");
const OTHER_ID = castId<UserId>("user_other");
const NATE_PERSONA = castId<PersonaId>("persona_nate");
const ALICE_ID = castId<CharacterId>("char_alice");
const BOB_ID = castId<CharacterId>("char_bob");
/** The real shape of an OIDC account: the handle IS the email, and there is no display name behind it, so
 *  the server's `publics.displayName ?? handle` rule hands the client the email in BOTH fields. */
const OIDC_EMAIL = "owner@example.com";

const NATE_CAST: ChatIdentity = { kind: "persona", id: NATE_PERSONA, name: "Alex", description: "", avatarHash: "persona-hash" };

function sourcesOf(over: Partial<MemberRowSources> = {}): MemberRowSources {
  return {
    participants: [],
    identities: [],
    viewerUserId: OWNER_ID,
    pendingHostUserId: null,
    respondingCharacterId: null,
    // UNKNOWN by default (#1039) — the state a surface that never asked produces.
    onlineUserIds: null,
    ...over,
  };
}

/** One human seat as an OIDC install produces it: handle === displayName === the email. */
function oidcSeat(over: Parameters<typeof makeParticipant>[0] = {}): ReturnType<typeof makeParticipant> {
  return makeParticipant({
    id: castId("participant_owner"),
    kind: "human",
    characterId: null,
    userId: OWNER_ID,
    role: "host",
    displayName: OIDC_EMAIL,
    handle: castId<Handle>(OIDC_EMAIL),
    ...over,
  });
}

test("a human seat renders the PERSONA it is playing — the handle appears nowhere on the row", () => {
  const rows = toPersonRows(sourcesOf({ participants: [oidcSeat({ activePersonaId: NATE_PERSONA })], identities: [NATE_CAST] }));

  expect(rows.map((r) => r.displayName)).toEqual(["Alex"]);
  // The whole serialized row, so a future field cannot smuggle the handle back in beside the name — the
  // ` · ${handle}` suffix that produced "email · email" in the owner's own tab is structurally unreachable.
  expect(JSON.stringify(rows)).not.toContain(OIDC_EMAIL);
});

// SCOPED (orchestrator ruling 2026-08-18): a persona-less seat renders the best label actually on the wire,
// which on an OIDC account with no display name IS the email — better than a placeholder for a real person.
// The durable fix is a `users` display-name column populated from the OIDC claims, filed separately. What
// #162 killed is the DUPLICATE: the handle rendered a second time beside the name.
test("a persona-less seat falls back to the wire displayName, and still renders it exactly ONCE", () => {
  const rows = toPersonRows(sourcesOf({ participants: [oidcSeat()] }));

  expect(rows.map((r) => r.displayName)).toEqual([OIDC_EMAIL]);
  expect(JSON.stringify(rows).split(OIDC_EMAIL).length - 1).toBe(1);
});

test("the persona's own portrait wins for the row avatar; the seat's own hash is the fallback", () => {
  const playing = toPersonRows(sourcesOf({ participants: [oidcSeat({ activePersonaId: NATE_PERSONA })], identities: [NATE_CAST] }));
  expect(playing[0]?.avatarHash).toBe("persona-hash");

  const bare = toPersonRows(sourcesOf({ participants: [oidcSeat({ avatarHash: "account-hash" })] }));
  expect(bare[0]?.avatarHash).toBe("account-hash");
});

test("a persona the identities producer does not carry falls back to the wire name, never to a raw id", () => {
  const rows = toPersonRows(sourcesOf({ participants: [oidcSeat({ activePersonaId: NATE_PERSONA })] }));
  expect(rows.map((r) => r.displayName)).toEqual([OIDC_EMAIL]);
  expect(rows.map((r) => r.displayName)).not.toContain(NATE_PERSONA);
});

test("host / viewer / nominee flags come off the seat, and a DEPARTED human is not a member row", () => {
  const departed = oidcSeat({ id: castId("participant_gone"), userId: OTHER_ID, role: "member", leftSeq: 12 });
  const other = oidcSeat({ id: castId("participant_other"), userId: OTHER_ID, role: "member" });
  const rows = toPersonRows(sourcesOf({ participants: [oidcSeat(), other, departed], pendingHostUserId: OTHER_ID }));

  expect(rows.map((r) => [r.key, r.isHost, r.isViewer, r.pendingNominee])).toEqual([
    ["participant_owner", true, true, false],
    ["participant_other", false, false, true],
  ]);
});

test("a human seat with no userId is skipped — every membership action addresses one", () => {
  expect(toPersonRows(sourcesOf({ participants: [oidcSeat({ userId: null })] }))).toEqual([]);
});

test("toCharacterRows projects every character seat in roster order, marking the live speaker", () => {
  const alice = makeParticipant({ id: castId("participant_alice"), characterId: ALICE_ID, displayName: "Alice", disabled: true });
  const bob = makeParticipant({ id: castId("participant_bob"), characterId: BOB_ID, displayName: "Bob", talkativeness: 0.5 });
  const rows = toCharacterRows(sourcesOf({ participants: [oidcSeat(), alice, bob], respondingCharacterId: BOB_ID }));

  expect(rows.map((r) => [r.displayName, r.disabled, r.responding])).toEqual([
    ["Alice", true, false],
    ["Bob", false, true],
  ]);
});

// ── #1039 PRESENCE PROJECTION ────────────────────────────────────────────────────────────────────────
// The security-relevant half of the roster dot is what the client does with an answer it did NOT get. The
// server collapses "offline" and "not disclosable to you" into one answer (an id simply absent from the
// online set), so absence is only ever "not shown as online" — and a read that never resolved must not be
// rendered as an absence at all.

test("presence projects per seat: in the online set ⇒ true, absent from a resolved set ⇒ false", () => {
  const other = oidcSeat({ id: castId("participant_other"), userId: OTHER_ID, role: "member" });
  const rows = toPersonRows(sourcesOf({ participants: [oidcSeat(), other], onlineUserIds: new Set([OWNER_ID]) }));

  expect(rows.map((r) => [r.key, r.online])).toEqual([
    ["participant_owner", true],
    ["participant_other", false],
  ]);
});

test("an UNRESOLVED presence read leaves every seat UNKNOWN — never a roster silently published as offline", () => {
  const other = oidcSeat({ id: castId("participant_other"), userId: OTHER_ID, role: "member" });
  const rows = toPersonRows(sourcesOf({ participants: [oidcSeat(), other], onlineUserIds: null }));

  expect(rows.map((r) => r.online)).toEqual([null, null]);
});

test("an EMPTY resolved set is a real answer (everyone offline), NOT the unknown state", () => {
  const rows = toPersonRows(sourcesOf({ participants: [oidcSeat()], onlineUserIds: new Set<UserId>() }));
  expect(rows.map((r) => r.online)).toEqual([false]);
});

test("the accessible name carries presence as a WORD — and says nothing at all when it is unknown", () => {
  const [unknown] = toPersonRows(sourcesOf({ participants: [oidcSeat({ activePersonaId: NATE_PERSONA })], identities: [NATE_CAST] }));
  const [online] = toPersonRows(
    sourcesOf({ participants: [oidcSeat({ activePersonaId: NATE_PERSONA })], identities: [NATE_CAST], onlineUserIds: new Set([OWNER_ID]) }),
  );
  const [offline] = toPersonRows(
    sourcesOf({ participants: [oidcSeat({ activePersonaId: NATE_PERSONA })], identities: [NATE_CAST], onlineUserIds: new Set<UserId>() }),
  );

  expect(unknown === undefined ? "" : rowAccessibleName(unknown)).toBe("Alex — host, you");
  expect(online === undefined ? "" : rowAccessibleName(online)).toBe("Alex — host, you, online");
  expect(offline === undefined ? "" : rowAccessibleName(offline)).toBe("Alex — host, you, offline");
});
