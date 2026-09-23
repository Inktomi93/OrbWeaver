// The prompt-cache prefix invariant across two calls of one chat: every block call N marked, and every block
// above it, reappears byte for byte and ends at the same place in call N+1. Each case builds both calls
// through the real SHAPE and resolves the marked rows with the runner's own depth counter, so a squash that
// moves a cached block reds here.

import type { ChatInjection } from "@orb/contracts/chat";
import type { RoleHandling } from "@orb/contracts/inference";
import { rowIndexAtCacheDepth } from "@orb/inference";
import type { CharacterId, MessageId } from "@orb/kit/ids";
import { ID_PREFIX, mintTypeId } from "@orb/kit/ids";
import { describe } from "vitest";
import { BEFORE_HISTORY_DEPTH } from "../../../../../packages/server/src/domain/chat/assembly/injections.ts";
import { shape } from "../../../../../packages/server/src/domain/chat/assembly/shape.ts";
import { convertsToEmptyWireRow } from "../../../../../packages/server/src/domain/chat/substrate/wire-history.ts";
import { expect, test } from "../../../../support/fixtures.ts";

type ShapeArgs = Parameters<typeof shape>[0];
type Shaped = ReturnType<typeof shape>;
type CanonRow = ShapeArgs["canon"][number];

/** The runner's rolling pair (`computeCacheBreakpointPlacements`): depth d and d+2, each resolved to the newest
 *  row of its role group. Both legs are assumed to clear the token floor, which is the case the leak costs. */
function markedRows(out: Shaped): number[] {
  const depth = out.cacheBreakpointFromEnd;
  if (depth === undefined) {
    return [];
  }
  return [depth, depth + 2].flatMap((wanted) => {
    const index = rowIndexAtCacheDepth(out.history, wanted);
    return index === undefined ? [] : [index];
  });
}

/** One delivered row as the provider reads it. A shaped row is one wire block: the direct SDK groups adjacent
 *  same-role rows into one message of separate blocks, and OpenRouter sends them 1:1. */
const blocks = (rows: Shaped["history"]): { role: string; content: string; name: string | undefined }[] =>
  rows.map((row) => ({ role: row.role, content: row.content, name: row.name }));

/** Every step where call N+1 does not repeat call N's prefix through N's deepest marked block, or where call N
 *  marks nothing (a case that stops caching must red, not pass vacuously). Empty = the invariant holds. */
function prefixLeaks(calls: readonly Shaped[]): string[] {
  return calls.slice(1).flatMap((next, index) => {
    const n = calls[index];
    const marked = n === undefined ? [] : markedRows(n);
    if (n === undefined || marked.length === 0) {
      return [`call ${index + 1} marks no history block`];
    }
    const through = Math.max(...marked) + 1;
    const cached = JSON.stringify(blocks(n.history.slice(0, through)));
    const repeated = JSON.stringify(blocks(next.history.slice(0, through)));
    return cached === repeated ? [] : [`call ${index + 2} rewrote call ${index + 1}'s cached prefix: ${cached} -> ${repeated}`];
  });
}

const canonRow = (role: "user" | "assistant", content: string, authorName: string, characterId: CharacterId | null = null): CanonRow => ({
  role,
  content,
  authorName,
  characterId,
  messageId: mintTypeId(ID_PREFIX.message) satisfies MessageId,
  kind: "standard",
});

/** A turn on a Claude wire that caches by explicit block markers, with the family floor (`strict`) or the
 *  measured system-row floor (`slotted`), both of which merge. */
function claudeCall(canon: readonly CanonRow[], over: Partial<ShapeArgs> & { readonly floor: RoleHandling }): ShapeArgs {
  const { floor, ...rest } = over;
  return {
    canon,
    appendUserTurn: null,
    injections: [],
    output: "per-speaker",
    cardScope: "merged",
    scopedTargetId: null,
    namesBehavior: "default",
    speakers: { user: "Alex", assistant: "Mara" },
    groupNudge: null,
    convertsToEmptyWireRow,
    roleHandlingFloor: floor,
    explicitCacheMarkers: true,
    ...rest,
  };
}

const CLAUDE_FLOORS: readonly RoleHandling[] = ["strict", "slotted"];

const MARA = mintTypeId(ID_PREFIX.character);
const WREN = mintTypeId(ID_PREFIX.character);
const KAI = mintTypeId(ID_PREFIX.character);
const cue = (name: string): string => `[Write the next reply only as ${name}.]`;

describe("a merged group round keeps every cached block (F1)", () => {
  // Greet-all seeds three adjacent greetings; then a user send opens a three-speaker round, and the next send
  // crosses the round boundary. Each speaker's call ends on SHAPE's cue, so its pin is the reply just before
  // it, and the next speaker's reply lands directly under that pinned block.
  const greetings = [
    canonRow("assistant", "Mara waves.", "Mara", MARA),
    canonRow("assistant", "Wren nods.", "Wren", WREN),
    canonRow("assistant", "Kai grins.", "Kai", KAI),
  ];
  const u1 = canonRow("user", "We head for the harbor.", "Alex");
  const m1 = canonRow("assistant", "Mara leads.", "Mara", MARA);
  const w1 = canonRow("assistant", "Wren scouts.", "Wren", WREN);
  const k1 = canonRow("assistant", "Kai follows.", "Kai", KAI);
  const u2 = canonRow("user", "Board the ship.", "Alex");
  const m2 = canonRow("assistant", "Mara climbs aboard.", "Mara", MARA);

  for (const floor of CLAUDE_FLOORS) {
    test(`floor ${floor}: seed, round, and the round boundary each repeat the prior call's cached prefix`, () => {
      const turn = (canon: readonly CanonRow[], speaker: string): Shaped =>
        shape(claudeCall(canon, { floor, groupNudge: cue(speaker), speakers: { user: "Alex", assistant: speaker } }));
      const calls = [
        turn([...greetings, u1], "Mara"),
        turn([...greetings, u1, m1], "Wren"),
        turn([...greetings, u1, m1, w1], "Kai"),
        turn([...greetings, u1, m1, w1, k1, u2], "Mara"),
        turn([...greetings, u1, m1, w1, k1, u2, m2], "Wren"),
      ];
      expect(prefixLeaks(calls)).toEqual([]);
    });
  }

  test("each speaker keeps their own label, and the level still yields one turn per run", () => {
    const out = shape(claudeCall([...greetings, u1, m1, w1], { floor: "strict", groupNudge: cue("Kai"), speakers: { user: "Alex", assistant: "Kai" } }));
    expect(blocks(out.history)).toEqual([
      { role: "assistant", content: "Mara: Mara waves.", name: undefined },
      { role: "assistant", content: "Wren: Wren nods.", name: undefined },
      { role: "assistant", content: "Kai: Kai grins.", name: undefined },
      { role: "user", content: "We head for the harbor.", name: undefined },
      { role: "assistant", content: "Mara: Mara leads.", name: undefined },
      { role: "assistant", content: "Wren: Wren scouts.", name: undefined },
      { role: "user", content: cue("Kai"), name: undefined },
    ]);
    // Role groups, which is what the wire delivers as messages: one per same-role run.
    expect(out.history.map((row) => row.role).filter((role, index, roles) => role !== roles[index - 1])).toEqual(["assistant", "user", "assistant", "user"]);
  });

  test("a wire without explicit cache markers still joins the run into one string (the non-caching join)", () => {
    const out = shape(
      claudeCall([...greetings, u1, m1, w1], {
        floor: "strict",
        groupNudge: cue("Kai"),
        speakers: { user: "Alex", assistant: "Kai" },
        explicitCacheMarkers: false,
      }),
    );
    expect(out.history.map((row) => row.content)).toEqual([
      "Mara: Mara waves.\n\nWren: Wren nods.\n\nKai: Kai grins.",
      "We head for the harbor.",
      "Mara: Mara leads.\n\nWren: Wren scouts.",
      cue("Kai"),
    ]);
  });
});

describe("multi-human rooms: back-to-back user rows keep every cached block (F1)", () => {
  const greeting = canonRow("assistant", "Aria opens the door.", "Aria", MARA);
  const nate1 = canonRow("user", "I step inside.", "Alex");
  const joe1 = canonRow("user", "I follow him in.", "Joe");
  const aria1 = canonRow("assistant", "Aria lights a lamp.", "Aria", MARA);
  const nate2 = canonRow("user", "I sit down.", "Alex");
  const aria2 = canonRow("assistant", "Aria pours tea.", "Aria", MARA);
  const joe2 = canonRow("user", "I take a cup.", "Joe");

  for (const floor of CLAUDE_FLOORS) {
    test(`floor ${floor}: each human's send repeats the prior call's cached prefix`, () => {
      const send = (canon: readonly CanonRow[], trigger: string): Shaped =>
        shape(claudeCall(canon, { floor, namesBehavior: "content", speakers: { user: trigger, assistant: "Aria" } }));
      const calls = [
        send([greeting, nate1], "Alex"),
        send([greeting, nate1, joe1], "Joe"),
        send([greeting, nate1, joe1, aria1, nate2], "Alex"),
        send([greeting, nate1, joe1, aria1, nate2, aria2, joe2], "Joe"),
      ];
      expect(prefixLeaks(calls)).toEqual([]);
    });
  }
});

describe("a solo chat is byte-identical on a caching wire (golden)", () => {
  const marker: ChatInjection = { position: "in_chat", depth: BEFORE_HISTORY_DEPTH, role: "user", content: "[Start a new chat]", origin: "new-chat-marker" };
  const note: ChatInjection = { position: "in_chat", depth: 2, role: "user", content: "Keep it short." };
  const canon = [
    canonRow("assistant", "Hello, traveller.", "Aria", MARA),
    canonRow("user", "Hi.", "Alex"),
    canonRow("assistant", "Where to?", "Aria", MARA),
    canonRow("user", "North.", "Alex"),
  ];

  test("the delivered history matches today's bytes, cached or not", () => {
    const call = (explicitCacheMarkers: boolean): Shaped =>
      shape(claudeCall(canon, { floor: "strict", injections: [marker, note], speakers: { user: "Alex", assistant: "Aria" }, explicitCacheMarkers }));
    const golden = [
      { role: "user", content: "[Start a new chat]", name: undefined },
      { role: "assistant", content: "Hello, traveller.", name: undefined },
      { role: "user", content: "Hi.\n\n[Note from user: Keep it short.]", name: undefined },
      { role: "assistant", content: "Where to?", name: undefined },
      { role: "user", content: "North.", name: undefined },
    ];
    expect(blocks(call(true).history)).toEqual(golden);
    expect(blocks(call(false).history)).toEqual(golden);
    expect(call(true).cacheBreakpointFromEnd).toBe(call(false).cacheBreakpointFromEnd);
  });
});
