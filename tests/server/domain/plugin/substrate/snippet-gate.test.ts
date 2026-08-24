// substrate: snippet-gate — the per-USER concurrent-snippet ceiling (P2-F, the half a request-rate bucket
// cannot express). Pure in-memory counting, no db and no Principal: claim a slot, hold it for the run, release
// it in a `finally`. The verb-level behavior (claimed after the authority gate, released on throw) is pinned in
// `verbs/run-snippet.int.test.ts`; this file owns the counting itself, including the two ways a counter like
// this fails — a leaked slot (locks the member out forever) and a double release (hands a neighbour a free
// slot, the negative-drift class).

import type { UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { PluginSnippetBusyError } from "@orb/server/domain/plugin";
import { describe } from "vitest";
import { createSnippetGate, SNIPPET_CONCURRENCY_PER_USER } from "../../../../../packages/server/src/domain/plugin/substrate/snippet-gate.ts";
import { expect, test } from "../../../../support/fixtures.ts";

const ALICE = castId<UserId>("user_alice0000000000000000000");
const BOB = castId<UserId>("user_bob00000000000000000000");

describe("createSnippetGate", () => {
  test("admits up to the ceiling and refuses the next with the typed CONFLICT", () => {
    const gate = createSnippetGate(2);
    gate.admit(ALICE);
    gate.admit(ALICE);
    expect(() => gate.admit(ALICE)).toThrow(PluginSnippetBusyError);
  });

  test("a released slot is immediately reusable — a ceiling, never a lockout", () => {
    const gate = createSnippetGate(1);
    const release = gate.admit(ALICE);
    expect(() => gate.admit(ALICE)).toThrow(PluginSnippetBusyError);
    release();
    expect(() => gate.admit(ALICE)).not.toThrow();
  });

  test("the count is PER USER — one member's runs never refuse another's", () => {
    const gate = createSnippetGate(1);
    gate.admit(ALICE);
    expect(() => gate.admit(BOB)).not.toThrow();
    expect(() => gate.admit(ALICE)).toThrow(PluginSnippetBusyError);
  });

  test("a DOUBLE release frees exactly one slot, never two (no drift below zero)", () => {
    // The failure this forbids: a caller whose release ran twice would leave the counter one below the truth,
    // silently lending the next caller a slot above the ceiling — the same class the membrane's in-flight
    // counter was repaired for. Idempotence is what makes the `finally` safe to place anywhere.
    const gate = createSnippetGate(2);
    const releaseFirst = gate.admit(ALICE);
    gate.admit(ALICE);
    releaseFirst();
    releaseFirst();
    releaseFirst();
    expect(() => gate.admit(ALICE)).not.toThrow(); // the one genuinely-freed slot
    expect(() => gate.admit(ALICE)).toThrow(PluginSnippetBusyError); // and no more
  });

  test("the production default is the exported constant (a caller-supplied max is a TEST narrowing)", () => {
    const gate = createSnippetGate();
    for (let i = 0; i < SNIPPET_CONCURRENCY_PER_USER; i++) {
      gate.admit(ALICE);
    }
    expect(() => gate.admit(ALICE)).toThrow(PluginSnippetBusyError);
  });
});
