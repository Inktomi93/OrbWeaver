// The databank model layer — the derived ingest phase, the chip predicate, the stall hint, and the row
// subtitle. These are the rules that stand in for a `status` column the schema deliberately does not have,
// so they are the one place a wrong answer becomes a wrong badge on every surface at once.

import type { DocumentView } from "@orb/contracts/databank";
import { castId } from "@orb/kit/ids";
import { describe } from "vitest";
import type { BankHealth } from "../../../../../packages/client/src/features/databank/lib/databank-model.ts";
import {
  bankHealth,
  bankHealthLine,
  documentSubtitle,
  INGEST_POLL_MS,
  ingestBadge,
  ingestPhase,
  ingestPollInterval,
  ingestStallHint,
  isIngestInFlight,
  showsPhaseChip,
} from "../../../../../packages/client/src/features/databank/lib/databank-model.ts";
import { expect, test } from "../../../../support/fixtures.ts";

const AT = 1_700_000_000_000;
const FIVE_MINUTES = 300_000;

function doc(over: Partial<DocumentView> = {}): DocumentView {
  return {
    id: castId("document_00000000000000000001"),
    name: "The Crimson Court",
    mime: "application/pdf",
    origin: "upload",
    sourceUrl: null,
    byteSize: 25_088,
    charCount: 4200,
    chunkCount: 12,
    embeddedCount: 12,
    createdAt: AT,
    updatedAt: AT,
    ...over,
  };
}

describe("ingestPhase — the counts ARE the truth (there is no status column)", () => {
  test("every chunk embedded ⇒ ready", () => {
    expect(ingestPhase(doc(), AT)).toBe("ready");
  });

  test("no chunks yet ⇒ indexing (queued): the ingest workload has not landed a chunk", () => {
    expect(ingestPhase(doc({ chunkCount: 0, embeddedCount: 0 }), AT)).toBe("indexing");
  });

  test("some chunks embedded, not all ⇒ embedding — a partial ingest a retry resumes", () => {
    expect(ingestPhase(doc({ chunkCount: 39, embeddedCount: 22 }), AT)).toBe("embedding");
  });

  test("charCount 0 BEATS everything — an empty extraction is empty even if chunks somehow exist", () => {
    // The precedence matters: a scanned image-only PDF extracts to nothing, and reporting it as `indexing`
    // would promise a completion that can never arrive.
    expect(ingestPhase(doc({ charCount: 0, chunkCount: 0, embeddedCount: 0 }), AT)).toBe("empty");
    expect(ingestPhase(doc({ charCount: 0, chunkCount: 5, embeddedCount: 5 }), AT)).toBe("empty");
  });

  test("the LAST chunk landing flips embedding → ready (the boundary, not a range)", () => {
    expect(ingestPhase(doc({ chunkCount: 12, embeddedCount: 11 }), AT)).toBe("embedding");
    expect(ingestPhase(doc({ chunkCount: 12, embeddedCount: 12 }), AT)).toBe("ready");
  });
});

// DBFIX — THE PARKED-FOREVER ROW. A document whose ingest never got enqueued (or whose worker died) looks
// EXACTLY like one about to start, so the only signal a status-column-free schema can give is a frozen
// `updatedAt`. `Queued` forever is the lie this phase exists to stop telling.
describe("ingestPhase — the STALLED overlay (a frozen in-flight row)", () => {
  test("an in-flight phase past the threshold reads stalled; a terminal one never does", () => {
    const queued = doc({ chunkCount: 0, embeddedCount: 0 });
    expect(ingestPhase(queued, AT + FIVE_MINUTES - 1)).toBe("indexing"); // still fresh — do not cry wolf
    expect(ingestPhase(queued, AT + FIVE_MINUTES)).toBe("stalled");
    expect(ingestPhase(doc({ chunkCount: 39, embeddedCount: 22 }), AT + FIVE_MINUTES)).toBe("stalled");
    // Terminal phases are ageless: a year-old ready document is FINISHED, not wedged.
    expect(ingestPhase(doc(), AT + FIVE_MINUTES * 100_000)).toBe("ready");
    expect(ingestPhase(doc({ charCount: 0, chunkCount: 0, embeddedCount: 0 }), AT + FIVE_MINUTES * 100_000)).toBe("empty");
  });

  test("a LIVE ingest that keeps bumping updatedAt never reads stalled, however long it runs", () => {
    const stillWorking = doc({ chunkCount: 200, embeddedCount: 130, updatedAt: AT + FIVE_MINUTES * 20 });
    expect(ingestPhase(stillWorking, AT + FIVE_MINUTES * 20 + 1000)).toBe("embedding");
  });

  test("Stalled EARNS a row chip, and it is the DANGER one — the list row carries the truth, not just detail", () => {
    // The whole point: this verdict is reachable from the LIST, where the user actually notices six of seven
    // documents never finished. `Queued`/`Indexing` are warnings that say "wait"; this one says "act".
    expect(showsPhaseChip("stalled")).toBe(true);
    expect(ingestBadge("stalled")).toEqual({ label: "Stalled", intent: "danger" });
  });
});

describe("showsPhaseChip — Ready is the ABSENCE of a chip (§6.1)", () => {
  test("only the non-ready phases earn a row chip", () => {
    expect(showsPhaseChip("ready")).toBe(false);
    expect(showsPhaseChip("indexing")).toBe(true);
    expect(showsPhaseChip("embedding")).toBe(true);
    expect(showsPhaseChip("empty")).toBe(true);
  });

  test("the badge each non-ready phase renders names its state and its urgency", () => {
    expect(ingestBadge("indexing")).toEqual({ label: "Queued", intent: "warning" });
    expect(ingestBadge("embedding")).toEqual({ label: "Indexing", intent: "warning" });
    // `Empty` IS A WARNING — REVERSED 2026-08-08 (side-eye P3), and the old reasoning is kept here because
    // it was not wrong about the SYSTEM: nothing is in flight and nothing failed internally, so `neutral`
    // said "no state to report". What it missed is the USER's position: an empty extraction is a document
    // that will never feed a chat, waiting for a human to re-upload or paste the text, and neutral filed
    // that beside "nothing to report" — a shrug on a document that is dead weight. It stops short of
    // `danger`, which stays reserved for the job that WEDGED (this one completed, honestly, with nothing).
    expect(ingestBadge("empty")).toEqual({ label: "Empty", intent: "warning" });
  });
});

describe("isIngestInFlight — the bounded poll's driver (D-3 arm b)", () => {
  test("true only while chunks are still expected — a terminal phase never polls", () => {
    expect(isIngestInFlight(doc({ chunkCount: 0, embeddedCount: 0 }), AT)).toBe(true);
    expect(isIngestInFlight(doc({ chunkCount: 39, embeddedCount: 22 }), AT)).toBe(true);
    expect(isIngestInFlight(doc(), AT)).toBe(false);
    expect(isIngestInFlight(doc({ charCount: 0, chunkCount: 0, embeddedCount: 0 }), AT)).toBe(false);
  });

  // A STALLED row stops the poll. Without this a document that never got enqueued keeps the library
  // refetching every 4 seconds for the entire life of the tab, forever, for a job with no worker.
  test("a STALLED document is NOT in flight — the poll stops instead of running forever", () => {
    const queued = doc({ chunkCount: 0, embeddedCount: 0 });
    expect(isIngestInFlight(queued, AT + FIVE_MINUTES - 1)).toBe(true);
    expect(isIngestInFlight(queued, AT + FIVE_MINUTES)).toBe(false);
  });
});

describe("ingestPollInterval — ONE rule for both readers of databank.list", () => {
  test("polls while some row is in flight, and stops the moment none is", () => {
    expect(ingestPollInterval([doc(), doc({ chunkCount: 0, embeddedCount: 0 })], AT)).toBe(INGEST_POLL_MS);
    expect(ingestPollInterval([doc()], AT)).toBe(false);
    // A bank that is entirely wedged must not poll forever — the phase says "act", not "wait".
    expect(ingestPollInterval([doc({ chunkCount: 0, embeddedCount: 0 })], AT + FIVE_MINUTES)).toBe(false);
  });

  test("an unread cache (the first refetch callback, before any data) polls nothing", () => {
    expect(ingestPollInterval(undefined, AT)).toBe(false);
    expect(ingestPollInterval([], AT)).toBe(false);
  });
});

// D-7 — the HOME tile's summary. It must answer "is my bank doing its job" out of the SAME counts the rows
// derive their phase from, or home and the library pane disagree about one document in two places.
describe("bankHealth — the tile's ingest health (D-7)", () => {
  /** The tile shows four rows and reads a 100-document page — the production call shape. */
  const health = (documents: readonly DocumentView[], now: number, visible = 0, limit = 100): BankHealth => bankHealth(documents, now, visible, limit);

  const bank: readonly DocumentView[] = [
    doc(),
    doc({ id: castId("document_00000000000000000002"), chunkCount: 39, embeddedCount: 22 }),
    doc({ id: castId("document_00000000000000000003"), charCount: 0, chunkCount: 0, embeddedCount: 0 }),
    doc({ id: castId("document_00000000000000000004"), chunkCount: 0, embeddedCount: 0, updatedAt: AT - FIVE_MINUTES }),
  ];

  test("counts PASSAGES against the chunks that exist — an un-embedded chunk is invisible to retrieval", () => {
    // 12 embedded of 12 + 22 of 39 + 0 of 0 + 0 of 0. Reporting 34 alone would read as a finished count;
    // reporting 51 (the chunks) would over-promise what a chat can actually pull.
    expect(health(bank, AT).passages).toBe(34);
    expect(health(bank, AT).chunks).toBe(51);
    expect(health(bank, AT).total).toBe(4);
  });

  test("one chip per NON-READY phase, worst first, and READY earns none", () => {
    expect(health(bank, AT).attention).toEqual([
      { intent: "danger", label: "1 stalled", phase: "stalled" },
      { intent: "warning", label: "1 empty", phase: "empty" },
      { intent: "warning", label: "1 indexing", phase: "embedding" },
    ]);
    // A bank at rest says nothing beyond its size — the steady state is the absence of a chip (§6.1).
    expect(health([doc(), doc({ id: castId("document_00000000000000000005") })], AT).attention).toEqual([]);
  });

  // The aggregate exists for what the tile CANNOT show you. A phase whose every document is already a
  // visible row is the same fact twice, competing for one glance (side-eye 2026-08-08 P2-a).
  test("a phase fully visible in the rendered rows earns NO chip; one that reaches past them does", () => {
    expect(health(bank, AT, bank.length).attention).toEqual([]);
    // The stalled row is LAST of four, so at three visible rows it is the only phase still hidden.
    expect(health(bank, AT, 3).attention).toEqual([{ intent: "danger", label: "1 stalled", phase: "stalled" }]);
  });

  test("the stall overlay rides the INJECTED clock — the same document is queued, then wedged", () => {
    const queued = [doc({ chunkCount: 0, embeddedCount: 0 })];
    expect(health(queued, AT + FIVE_MINUTES - 1).attention).toEqual([{ intent: "warning", label: "1 queued", phase: "indexing" }]);
    expect(health(queued, AT + FIVE_MINUTES).attention).toEqual([{ intent: "danger", label: "1 stalled", phase: "stalled" }]);
  });

  test("documents in the SAME phase aggregate into one chip", () => {
    const two = [
      doc({ charCount: 0, chunkCount: 0, embeddedCount: 0 }),
      doc({ id: castId("document_00000000000000000006"), charCount: 0, chunkCount: 0, embeddedCount: 0 }),
    ];
    expect(health(two, AT).attention).toEqual([{ intent: "warning", label: "2 empty", phase: "empty" }]);
  });

  test("the health LINE reads BOTH counts, with the singulars", () => {
    expect(bankHealthLine(health(bank, AT))).toBe("4 documents · 34 of 51 passages indexed");
    expect(bankHealthLine(health([doc({ chunkCount: 1, embeddedCount: 1 })], AT))).toBe("1 document · 1 of 1 passage indexed");
    expect(bankHealthLine(health([], AT))).toBe("0 documents · 0 of 0 passages indexed");
  });

  // A FULL PAGE IS NOT A CENSUS (side-eye 2026-08-08 P2-d): `databank.list` returns at most its default
  // limit, so a surface that prints `documents.length` as "N documents" states a bank size it never read.
  test("a page filled to the limit reports 100+, never a count it did not take", () => {
    const page = Array.from({ length: 4 }, (_, i) => doc({ id: castId(`document_0000000000000000000${i}`) }));
    expect(bankHealthLine(health(page, AT, 0, 4))).toBe("4+ documents · 48 of 48 passages indexed");
    expect(health(page, AT, 0, 4).capped).toBe(true);
    expect(health(page, AT, 0, 5).capped).toBe(false);
  });
});

describe("ingestStallHint — a wedged job, derived from updatedAt with an INJECTED clock", () => {
  test("fires only past the threshold, and names the phase it is stuck in", () => {
    const queued = doc({ chunkCount: 0, embeddedCount: 0 });
    expect(ingestStallHint(queued, AT + FIVE_MINUTES - 1)).toBeNull();
    expect(ingestStallHint(queued, AT + FIVE_MINUTES)).toBe("Still queued — Reindex can restart a stuck job.");

    const embedding = doc({ chunkCount: 39, embeddedCount: 22 });
    expect(ingestStallHint(embedding, AT + FIVE_MINUTES)).toBe("Still indexing — Reindex can restart a stuck job.");
  });

  test("a TERMINAL phase never stalls, however old the row is", () => {
    // A year-old ready document is not wedged, it is finished — the hint must not key on age alone.
    expect(ingestStallHint(doc(), AT + FIVE_MINUTES * 100_000)).toBeNull();
    expect(ingestStallHint(doc({ charCount: 0, chunkCount: 0, embeddedCount: 0 }), AT + FIVE_MINUTES * 100_000)).toBeNull();
  });

  test("a LIVE ingest that keeps bumping updatedAt never trips the hint", () => {
    // The stall signal is a FROZEN timestamp, not elapsed time since creation: a slow 200-chunk embed keeps
    // writing, so `now - updatedAt` stays small no matter how long the whole job takes.
    const stillWorking = doc({ chunkCount: 200, embeddedCount: 130, updatedAt: AT + FIVE_MINUTES * 20 });
    expect(ingestStallHint(stillWorking, AT + FIVE_MINUTES * 20 + 1000)).toBeNull();
  });
});

describe("the row subtitle + byte format", () => {
  test("provenance · size · passage count, with the singular passage", () => {
    expect(documentSubtitle(doc())).toBe("Upload · 24.5 KB · 12 passages");
    expect(documentSubtitle(doc({ origin: "youtube", byteSize: 219_136, chunkCount: 1 }))).toBe("YouTube · 214 KB · 1 passage");
  });

  test("a not-yet-chunked document reads 0 passages — the chip carries the in-flight signal, not the subtitle", () => {
    expect(documentSubtitle(doc({ chunkCount: 0, embeddedCount: 0 }))).toBe("Upload · 24.5 KB · 0 passages");
  });
});
