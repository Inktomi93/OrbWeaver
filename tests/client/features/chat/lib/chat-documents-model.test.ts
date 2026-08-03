// The per-chat documents rack's model layer — the D85 visibility write's SET arithmetic, the source-chip
// vocabulary, the detachability test, and the picker's offer set.
//
// `nextHiddenSet` is the load-bearing one: `chat.setChatDocumentVisibility` REPLACES the whole excluded
// set, so this function's output IS the stored state. An off-by-one here silently un-hides a document the
// host switched off — a room-wide prompt-content change with no error and no visible cause.

import type { DocumentScopeSource, DocumentView } from "@orb/contracts/databank";
import type { DocumentId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { describe } from "vitest";
import {
  attachableDocuments,
  isDetachableFromChat,
  nextHiddenSet,
  sourceChips,
} from "../../../../../packages/client/src/features/chat/lib/chat-documents-model";
import { expect, test } from "../../../../support/fixtures";

const AT = 1_700_000_000_000;

const A = castId<DocumentId>("document_00000000000000000001");
const B = castId<DocumentId>("document_00000000000000000002");
const C = castId<DocumentId>("document_00000000000000000003");

function bankDoc(id: DocumentId, name: string): DocumentView {
  return {
    id,
    name,
    mime: "text/markdown",
    origin: "text",
    sourceUrl: null,
    byteSize: 2048,
    charCount: 900,
    chunkCount: 1,
    embeddedCount: 1,
    createdAt: AT,
    updatedAt: AT,
  };
}

/** An ACTIVE row as `listActiveForChat` returns it (the wire view plus `hidden` + `sources`). */
function activeRow(
  id: DocumentId,
  over: { hidden?: boolean; sources?: readonly DocumentScopeSource[] } = {},
): DocumentView & { readonly hidden: boolean; readonly sources: readonly DocumentScopeSource[] } {
  return { ...bankDoc(id, `doc ${id}`), hidden: over.hidden ?? false, sources: over.sources ?? ["chat"] };
}

describe("nextHiddenSet — the write is the WHOLE excluded set, not a patch", () => {
  test("hiding a row adds it to the set the rendered rows already prove hidden", () => {
    const rows = [activeRow(A), activeRow(B, { hidden: true })];
    expect(nextHiddenSet(rows, A, true)).toEqual([B, A]);
  });

  test("showing a row removes ONLY it — every other hidden document survives the write", () => {
    // The failure this pins: a naive `[]`/single-id payload would un-hide B as a side effect of showing A,
    // because the verb replaces the set wholesale.
    const rows = [activeRow(A, { hidden: true }), activeRow(B, { hidden: true }), activeRow(C)];
    expect(nextHiddenSet(rows, A, false)).toEqual([B]);
  });

  test("both directions are idempotent — a repeated flip round-trips to the same payload", () => {
    const rows = [activeRow(A, { hidden: true }), activeRow(B)];
    expect(nextHiddenSet(rows, A, true)).toEqual([A]);
    expect(nextHiddenSet(rows, B, false)).toEqual([A]);
  });

  test("nothing hidden ⇒ showing anything writes the empty set (the off path), never undefined", () => {
    expect(nextHiddenSet([activeRow(A), activeRow(B)], A, false)).toEqual([]);
  });
});

describe("sourceChips — WHY a document is active (D-2)", () => {
  test("each junction gets its own word", () => {
    expect(sourceChips(["global"])).toEqual(["Everywhere"]);
    expect(sourceChips(["chat"])).toEqual(["This chat"]);
    expect(sourceChips(["character"])).toEqual(["From a character"]);
  });

  test("several junctions render in the CANONICAL axis order, whatever order the server credited them", () => {
    // A list must not reorder its own chips row to row; the axis tuple is the order.
    expect(sourceChips(["chat", "global"])).toEqual(["Everywhere", "This chat"]);
    expect(sourceChips(["character", "chat", "global"])).toEqual(["Everywhere", "This chat", "From a character"]);
  });
});

describe("isDetachableFromChat — only THIS room's junction is the host's to cut", () => {
  test("a chat-attached document can be detached here", () => {
    expect(isDetachableFromChat(["chat"])).toBe(true);
    expect(isDetachableFromChat(["global", "chat"])).toBe(true);
  });

  test("a member's Everywhere document and a roster character's cannot — the host can only HIDE them", () => {
    // This is the whole reason legacy's read-only Switch was a lie: the control implied a write the host
    // does not own.
    expect(isDetachableFromChat(["global"])).toBe(false);
    expect(isDetachableFromChat(["character"])).toBe(false);
  });
});

describe("attachableDocuments — the picker offers the bank MINUS what already feeds the room", () => {
  test("a document already active through THIS chat is not offered again", () => {
    const bank = [bankDoc(A, "a"), bankDoc(B, "b")];
    expect(attachableDocuments(bank, [A]).map((d) => d.id)).toEqual([B]);
  });

  test("a document active via a CHARACTER is excluded too — attaching it would change nothing visible", () => {
    // The subtraction is over the whole ACTIVE union, not just the chat junction: the passages already
    // reach this room, so "add to this chat" would be a control with no observable effect.
    const bank = [bankDoc(A, "a"), bankDoc(B, "b"), bankDoc(C, "c")];
    const active = [activeRow(A, { sources: ["character"] }), activeRow(B, { sources: ["global"] })];
    const activeIds = active.map((row) => row.id);
    expect(attachableDocuments(bank, activeIds).map((d) => d.id)).toEqual([C]);
  });

  test("an empty bank offers nothing, and a bank with nothing active offers all of it", () => {
    expect(attachableDocuments([], [A])).toEqual([]);
    expect(attachableDocuments([bankDoc(A, "a")], []).map((d) => d.id)).toEqual([A]);
  });
});
