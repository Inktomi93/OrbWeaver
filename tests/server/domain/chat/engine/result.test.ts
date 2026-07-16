// engine/result — the two pure TurnOutcome builders. NOT a structural echo of the 3-line bodies (the old
// tautology: assert the builder returns its own literal). Pins the load-bearing DISCRIMINANT CONTRACT the
// engine lifecycle depends on: `committed` and `aborted` are the two mutually-exclusive arms of the
// `aborted` discriminant, a committed outcome NEVER carries an abort reason, an aborted outcome NEVER
// carries messages, and the committed builder passes its rows through UNCOPIED (a future `.slice()`/`.map`
// would silently break the by-reference contract the caller relies on).

import type { MessageView } from "@orb/contracts/chat";
import { describe } from "vitest";
import { abortedOutcome, committedOutcome } from "../../../../../packages/server/src/domain/chat/engine/result";
import { expect, test } from "../../../../support/fixtures";

describe("engine/result — the TurnOutcome discriminant contract", () => {
  test("the two builders are the opposite arms of the `aborted` discriminant", () => {
    expect(committedOutcome([]).aborted).toBe(false);
    expect(abortedOutcome("error").aborted).toBe(true);
  });

  test("a committed outcome clears the abort reason (the discriminant coupling holds)", () => {
    expect(committedOutcome([]).abortReason).toBeUndefined();
  });

  test("an aborted outcome carries NO messages and preserves its reason verbatim", () => {
    const outcome = abortedOutcome("user");
    expect(outcome.messages).toEqual([]);
    expect(outcome.abortReason).toBe("user");
  });

  test("committedOutcome passes the rows through by reference (no defensive copy)", () => {
    const rows: readonly MessageView[] = [];
    expect(committedOutcome(rows).messages).toBe(rows);
  });
});
