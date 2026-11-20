// @subject packages/client/src/features/chat/components/member-row.tsx
// Label in Name on a Members row (UI-Primitives-and-Reuse §13.10, N2): every word the row body shows is a word of its
// accessible name, in each state that prints one, and a responding seat reaches assistive technology as the row's
// description. Axe's `label-content-name-mismatch` is stricter than N2 and still fires on a row that prints a state
// word: it wants the shown words as one run of the name and counts the painted responding mark as a label.
import { ID_PREFIX, mintUserId } from "@orb/kit/ids";
import { auditSurface } from "@orb/testkit/browser/spec";
import { createSeededIds, FIXTURE_ID_CURSOR, FROZEN_AT_MS } from "@orb/testkit/iso";
import { expect, test } from "@playwright/test";
import type { MemberRowNameStory } from "./_member-row-name-stories.tsx";

const STORY = "tests/client/features/chat/components/_member-row-name-stories/MemberRowNameStory";

type Row = Parameters<typeof MemberRowNameStory>[0]["row"];
type CharacterRow = Extract<Row, { readonly kind: "character" }>;
type PersonRow = Extract<Row, { readonly kind: "person" }>;

const ids = createSeededIds(FIXTURE_ID_CURSOR);

function characterSeat(state: Partial<Pick<CharacterRow, "disabled" | "responding">>): CharacterRow {
  return {
    kind: "character",
    key: "member-row-name",
    characterId: ids.typeId(ID_PREFIX.character),
    displayName: "Charlotte",
    disabled: false,
    talkativeness: 0.5,
    avatarHash: null,
    responding: false,
    ...state,
  };
}

function humanSeat(state: Partial<Pick<PersonRow, "isHost" | "isViewer" | "pendingNominee" | "historyVisibility" | "online" | "lastSeenAt">>): PersonRow {
  return {
    kind: "person",
    key: "member-row-name",
    userId: mintUserId(ids.next),
    displayName: "Riley",
    isHost: false,
    isViewer: false,
    avatarHash: null,
    pendingNominee: false,
    historyVisibility: "full",
    online: null,
    lastSeenAt: null,
    ...state,
  };
}

const ROWS = [
  { title: "a character seat at rest", row: (): Row => characterSeat({}), described: false },
  { title: "a character seat that is responding", row: (): Row => characterSeat({ responding: true }), described: true },
  { title: "a muted character seat", row: (): Row => characterSeat({ disabled: true }), described: false },
  { title: "a member seat", row: (): Row => humanSeat({}), described: false },
  { title: "the viewer's own host seat, online", row: (): Row => humanSeat({ isHost: true, isViewer: true, online: true }), described: false },
  {
    title: "a nominated member with limited history",
    row: (): Row => humanSeat({ pendingNominee: true, historyVisibility: "from-join", online: true }),
    described: false,
  },
  { title: "an offline member with a last-seen time", row: (): Row => humanSeat({ online: false, lastSeenAt: FROZEN_AT_MS }), described: false },
] as const;

for (const { title, row, described } of ROWS) {
  test(`${title}: every word the row shows is in its name`, async ({ mount }) => {
    const component = await mount<typeof MemberRowNameStory>(STORY, { row: row() });
    const body = component.locator('[data-slot="member-row"]').getByRole("button");
    await expect(body).toBeVisible();
    // The responding state is a description, which N2 leaves out of the label; it must still be there to announce.
    await expect(body).toHaveAccessibleDescription(described ? /\S/u : "");
    const report = await auditSurface({ name: title, scope: component, state: "loaded", witnesses: [body], checks: ["names"] });
    expect(report.names.filter(({ rule }) => rule === "label-not-in-name")).toEqual([]);
  });
}
