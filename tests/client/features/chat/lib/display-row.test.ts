import { createIdSource, ID_PREFIX } from "@orb/kit/ids";
import { createSeededIds, FIXTURE_ID_CURSOR } from "@orb/testkit/iso";
import { expect, test } from "@orb/testkit/node";
import { displayDepthsOf, roomStandingOf } from "#client/features/chat/lib/display-row.ts";

const ids = createSeededIds(FIXTURE_ID_CURSOR);
const users = createIdSource(createSeededIds().next);
const AT_TAIL = { later: false, settling: false } as const;
const SHORT_OF_TAIL = [
  { later: true, settling: false },
  { later: false, settling: true },
] as const;

type Items = Parameters<typeof displayDepthsOf>[0];
type Row = Extract<Items[number], { readonly kind: "message" }>;
type Seat = Parameters<typeof roomStandingOf>[0][number];

function row(role: Row["view"]["role"], excludedFromPrompt = false): Row {
  return { kind: "message", view: { id: ids.typeId(ID_PREFIX.message), role, excludedFromPrompt } };
}

function idOf(item: Row): Row["view"]["id"] {
  return item.view.id;
}

test("depth counts from the newest row and skips system rows and rows hidden from the AI", () => {
  const oldest = row("user");
  const hidden = row("assistant", true);
  const system = row("system");
  const newest = row("assistant");
  const { rows, ghost } = displayDepthsOf([oldest, hidden, system, newest], AT_TAIL);

  expect([rows.get(idOf(newest)), rows.get(idOf(system)), rows.get(idOf(hidden)), rows.get(idOf(oldest))]).toEqual([0, undefined, undefined, 1]);
  expect(ghost).toBeUndefined();
});

test("the live ghost is the newest row at the tail, and a swipe's ghost takes its target's depth", () => {
  const before = row("user");
  const appended = displayDepthsOf([before, { kind: "ghost" }], AT_TAIL);
  expect([appended.ghost, appended.rows.get(idOf(before))]).toEqual([0, 1]);

  const after = row("user");
  const swiped = displayDepthsOf([before, { kind: "ghost" }, after], AT_TAIL);
  expect([swiped.rows.get(idOf(after)), swiped.ghost, swiped.rows.get(idOf(before))]).toEqual([0, 1, 2]);
});

test("pages that stop short of the live tail give their rows no depth, while a tail ghost stays the newest", () => {
  const first = row("user");
  const second = row("assistant");
  for (const edges of SHORT_OF_TAIL) {
    const appended = displayDepthsOf([first, second, { kind: "ghost" }], edges);
    expect([appended.rows.get(idOf(first)), appended.rows.get(idOf(second)), appended.ghost]).toEqual([undefined, undefined, 0]);
    // With no ghost the newest loaded row is not the room's newest, and a swipe's ghost sits above the gap.
    expect(displayDepthsOf([first, second], edges).rows.get(idOf(second))).toBeUndefined();
    expect(displayDepthsOf([first, { kind: "ghost" }, second], edges).ghost).toBeUndefined();
  }
});

test("the room's standing holds each present human seat's role and no seat that left or has no user", () => {
  const host = users.userId();
  const member = users.userId();
  const departed = users.userId();
  const seats: Seat[] = [
    { userId: host, leftSeq: null, role: "host" },
    { userId: member, leftSeq: null, role: "member" },
    { userId: departed, leftSeq: 12, role: "member" },
    { userId: null, leftSeq: null, role: "member" },
  ];

  expect(roomStandingOf(seats).seatedRoles).toEqual({ [host]: "host", [member]: "member" });
});
