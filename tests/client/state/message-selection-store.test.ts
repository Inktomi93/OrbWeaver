// The bulk message-selection store: presence-in-map IS selection, keyed by message
// id — the external-store discipline `@orb/ui/message-list`'s windowed virtualizer requires (an
// off-screen row's checkbox state held in local `useState` would drop on scroll-back, PD-119). Exercised
// through the non-hook `readSelectedMessageIds` snapshot (the reactive hooks need a React render — the
// `message-edit-draft.test.ts` / `chat-stream.test.ts` posture).

import { __resetSelection, enterSelectionMode, exitSelectionMode, readSelectedMessageIds, toggleMessageSelected } from "@orb/client/state";
import type { MessageId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { beforeEach, describe } from "vitest";
import { expect, test } from "../../support/fixtures.ts";

const MSG_A = castId<MessageId>("msg_testselectionaaa");
const MSG_B = castId<MessageId>("msg_testselectionbbb");

describe("message-selection store", () => {
  beforeEach(() => {
    exitSelectionMode(); // reset the module singleton between tests (mode off + empty set).
  });

  test("nothing selected by default — an empty snapshot", () => {
    expect(readSelectedMessageIds()).toEqual([]);
  });

  test("toggle selects then deselects a message (presence is selection)", () => {
    enterSelectionMode();
    toggleMessageSelected(MSG_A);
    expect(readSelectedMessageIds()).toEqual([MSG_A]);
    toggleMessageSelected(MSG_A);
    expect(readSelectedMessageIds()).toEqual([]);
  });

  test("multiple ids accumulate; each toggles independently", () => {
    enterSelectionMode();
    toggleMessageSelected(MSG_A);
    toggleMessageSelected(MSG_B);
    expect(readSelectedMessageIds()).toEqual([MSG_A, MSG_B]);

    toggleMessageSelected(MSG_A); // deselect A only
    expect(readSelectedMessageIds()).toEqual([MSG_B]);
  });

  test("__resetSelection empties the set (without leaving the mode)", () => {
    enterSelectionMode();
    toggleMessageSelected(MSG_A);
    toggleMessageSelected(MSG_B);
    __resetSelection();
    expect(readSelectedMessageIds()).toEqual([]);
  });

  test("entering select mode starts from an empty set (a stale selection never leaks in)", () => {
    enterSelectionMode();
    toggleMessageSelected(MSG_A);
    enterSelectionMode(); // re-enter
    expect(readSelectedMessageIds()).toEqual([]);
  });

  test("exiting select mode clears the selection", () => {
    enterSelectionMode();
    toggleMessageSelected(MSG_A);
    exitSelectionMode();
    expect(readSelectedMessageIds()).toEqual([]);
  });
});
