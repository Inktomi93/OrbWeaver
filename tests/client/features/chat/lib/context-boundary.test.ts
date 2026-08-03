// Unit: the "last-in-context" boundary resolver (features/chat/lib/context-boundary, Phase 4b §B.5.2).
// Pins the current-state rule: the MOST RECENT ASSISTANT generation's `contextBoundaryMessageId` is
// authoritative — `null` included ("everything fit this turn"), skipping user/system rows and never
// walking past a truthful null into a stale older stamp (the resurrection bug, retro-workboard.md §6).

import type { MessageId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { resolveContextBoundaryMessageId } from "../../../../../packages/client/src/features/chat/lib/context-boundary";
import { expect, test } from "../../../../support/fixtures";
import { makeMessageView } from "../fixtures";

test("returns null for an empty transcript", () => {
  expect(resolveContextBoundaryMessageId([])).toBeNull();
});

test("returns null when no message has ever recorded a boundary (nothing dropped yet)", () => {
  const messages = [
    makeMessageView({ id: castId<MessageId>("msg_1"), contextBoundaryMessageId: null }),
    makeMessageView({ id: castId<MessageId>("msg_2"), contextBoundaryMessageId: null }),
  ];
  expect(resolveContextBoundaryMessageId(messages)).toBeNull();
});

test("returns the boundary from the MOST RECENT stamped message, not an earlier one", () => {
  const messages = [
    makeMessageView({
      id: castId<MessageId>("msg_1"),
      contextBoundaryMessageId: castId<MessageId>("msg_0"),
    }),
    makeMessageView({
      id: castId<MessageId>("msg_2"),
      contextBoundaryMessageId: castId<MessageId>("msg_1"),
    }),
  ];
  expect(resolveContextBoundaryMessageId(messages)).toBe(castId<MessageId>("msg_1"));
});

test("skips a trailing user row and reads the newest assistant stamp", () => {
  const messages = [
    makeMessageView({
      id: castId<MessageId>("msg_1"),
      contextBoundaryMessageId: castId<MessageId>("msg_0"),
    }),
    makeMessageView({
      id: castId<MessageId>("msg_2"),
      contextBoundaryMessageId: castId<MessageId>("msg_1"),
    }),
    // A trailing user message the NEXT generation hasn't fit-passed yet — carries no boundary answer.
    makeMessageView({
      id: castId<MessageId>("msg_3"),
      role: "user",
      contextBoundaryMessageId: null,
    }),
  ];
  expect(resolveContextBoundaryMessageId(messages)).toBe(castId<MessageId>("msg_1"));
});

// Regression (retro-workboard.md §6 — stale-resurrection): an older turn once trimmed (stamped a real
// boundary) but the NEWEST assistant generation's history fit entirely (null = "everything fit this
// turn", authoritative). The newest assistant null must win — no divider — never resurrect the stale
// older stamp.
// D124 retired the rpg state-anchor slot — an EMPTY-body assistant row a host `resyncFromStory`/`editSnapshot`
// appended, which was not a generation and carried no fit-pass stamp. Reading its null as the truthful
// "everything fit this turn" suppressed the divider on every chat with an rpg panel the moment the host
// resynced (live 2026-07-31). The row class no longer exists, so this resolver is a plain last-assistant walk
// and there is nothing to walk past.

test("newest assistant null beats a stale older stamp — no divider (stale-resurrection)", () => {
  const messages = [
    makeMessageView({
      id: castId<MessageId>("msg_1"),
      contextBoundaryMessageId: castId<MessageId>("msg_0"),
    }),
    // A more recent assistant turn whose history fit entirely (nothing dropped) — authoritative null.
    makeMessageView({ id: castId<MessageId>("msg_2"), contextBoundaryMessageId: null }),
  ];
  expect(resolveContextBoundaryMessageId(messages)).toBeNull();
});
