// The regex-library BULK-SELECT store (REGX2). What is worth pinning is the store's two RULINGS, not its
// setters: leaving the mode CLEARS the selection (a set that survived an invisible mode would act on rows
// the user can no longer see marked), and presence-in-map IS selection — the external-store discipline the
// windowed `VirtualList` requires, since a row scrolled out of the window unmounts its checkbox.
//
// Driven through the non-hook snapshot (the reactive hooks need a React render — the
// `message-selection-store.test.ts` posture).

import { __readRegexBulkForTest, clearRegexBulkSelection, exitRegexBulkMode, toggleRegexBulkMode, toggleRegexScriptSelected } from "@orb/client/state";
import type { RegexScriptId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { beforeEach, describe } from "vitest";
import { expect, test } from "../../support/fixtures.ts";

const SCRIPT_A = castId<RegexScriptId>("regex_script_bulkaaaaaaaaaa");
const SCRIPT_B = castId<RegexScriptId>("regex_script_bulkbbbbbbbbbb");

describe("regex bulk-select store", () => {
  beforeEach(() => {
    exitRegexBulkMode(); // reset the module singleton between tests (mode off + empty set).
  });

  test("starts off, with nothing selected", () => {
    expect(__readRegexBulkForTest()).toEqual({ active: false, selectedIds: [] });
  });

  test("toggle selects then deselects a script (presence is selection)", () => {
    toggleRegexBulkMode();
    toggleRegexScriptSelected(SCRIPT_A);
    expect(__readRegexBulkForTest().selectedIds).toEqual([SCRIPT_A]);
    toggleRegexScriptSelected(SCRIPT_A);
    expect(__readRegexBulkForTest().selectedIds).toEqual([]);
  });

  test("ids accumulate, and each toggles independently", () => {
    toggleRegexBulkMode();
    toggleRegexScriptSelected(SCRIPT_A);
    toggleRegexScriptSelected(SCRIPT_B);
    expect(__readRegexBulkForTest().selectedIds).toEqual([SCRIPT_A, SCRIPT_B]);
    toggleRegexScriptSelected(SCRIPT_A);
    expect(__readRegexBulkForTest().selectedIds).toEqual([SCRIPT_B]);
  });

  // THE RULING: a selection must never outlive the mode that made it visible.
  test("leaving the mode clears the selection, and re-entering starts empty", () => {
    toggleRegexBulkMode();
    toggleRegexScriptSelected(SCRIPT_A);
    toggleRegexBulkMode();
    expect(__readRegexBulkForTest()).toEqual({ active: false, selectedIds: [] });
    toggleRegexBulkMode();
    expect(__readRegexBulkForTest()).toEqual({ active: true, selectedIds: [] });
  });

  test("the bar's CLEAR empties the set without leaving the mode", () => {
    toggleRegexBulkMode();
    toggleRegexScriptSelected(SCRIPT_A);
    clearRegexBulkSelection();
    expect(__readRegexBulkForTest()).toEqual({ active: true, selectedIds: [] });
  });
});
