// The databank model layer — the derived ingest phase, the chip predicate, the stall hint, and the row
// subtitle. These are the rules that stand in for a `status` column the schema deliberately does not have,
// so they are the one place a wrong answer becomes a wrong badge on every surface at once.

import type { BankHealthView, DocumentView } from "@orb/contracts/databank";
import { castId } from "@orb/kit/ids";
import { describe } from "vitest";
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
// THE CENSUS IS THE SERVER'S (2026-08-14). These used to hand `bankHealth` a page of documents and let it
// sum them, which is exactly the defect the ruling retired: the tile summed the newest 100 and read as a
// statement about the bank. The numbers are `databank.bankHealth`'s now; what is still derived here is the
// chip DECISION — which counts earn an aggregate, in what order, given the rows the tile already renders.
describe("bankHealth — the tile's ingest health (D-7)", () => {
  /** A census literal — the wire shape, over-specified on purpose so a changed field fails loudly. */
  const census = (over: Partial<BankHealthView> = {}): BankHealthView => ({
    byPhase: { embedding: 0, empty: 0, indexing: 0, ready: 0, stalled: 0 },
    chunks: 0,
    passages: 0,
    total: 0,
    ...over,
  });

  /** The four-phase bank, and the census a server would return for exactly it. */
  const bank: readonly DocumentView[] = [
    doc(),
    doc({ id: castId("document_00000000000000000002"), chunkCount: 39, embeddedCount: 22 }),
    doc({ id: castId("document_00000000000000000003"), charCount: 0, chunkCount: 0, embeddedCount: 0 }),
    doc({ id: castId("document_00000000000000000004"), chunkCount: 0, embeddedCount: 0, updatedAt: AT - FIVE_MINUTES }),
  ];
  const bankCensus = census({ byPhase: { embedding: 1, empty: 1, indexing: 0, ready: 1, stalled: 1 }, chunks: 51, passages: 34, total: 4 });

  test("the numbers come STRAIGHT from the census — the tile sums nothing", () => {
    // 12 embedded of 12 + 22 of 39 + 0 of 0 + 0 of 0, as the server counted it. Reporting 34 alone would
    // read as a finished count; reporting 51 (the chunks) would over-promise what a chat can pull.
    const health = bankHealth(bankCensus, [], AT);
    expect(health.passages).toBe(34);
    expect(health.chunks).toBe(51);
    expect(health.total).toBe(4);
  });

  test("one chip per NON-READY phase, worst first, and READY earns none", () => {
    expect(bankHealth(bankCensus, [], AT).attention).toEqual([
      { intent: "danger", label: "1 stalled", phase: "stalled" },
      { intent: "warning", label: "1 empty", phase: "empty" },
      { intent: "warning", label: "1 indexing", phase: "embedding" },
    ]);
    // A bank at rest says nothing beyond its size — the steady state is the absence of a chip (§6.1).
    expect(bankHealth(census({ byPhase: { embedding: 0, empty: 0, indexing: 0, ready: 2, stalled: 0 }, total: 2 }), [], AT).attention).toEqual([]);
  });

  // The aggregate exists for what the tile CANNOT show you. A phase whose every document is already a
  // visible row is the same fact twice, competing for one glance (side-eye 2026-08-08 P2-a).
  test("a phase fully visible in the rendered rows earns NO chip; one that reaches past them does", () => {
    expect(bankHealth(bankCensus, bank, AT).attention).toEqual([]);
    // The stalled row is LAST of four, so at three visible rows it is the only phase still hidden.
    expect(bankHealth(bankCensus, bank.slice(0, 3), AT).attention).toEqual([{ intent: "danger", label: "1 stalled", phase: "stalled" }]);
  });

  // A CENSUS THAT REACHES PAST THE PAGE. The chip counts the SERVER's number, not the rendered rows', which
  // is the whole point: twelve wedged documents and one of them on screen still reads "12 stalled".
  test("the chip states the CENSUS count even when one of that phase is on screen", () => {
    const wedged = doc({ chunkCount: 0, embeddedCount: 0, updatedAt: AT - FIVE_MINUTES });
    const many = census({ byPhase: { embedding: 0, empty: 0, indexing: 0, ready: 30, stalled: 12 }, chunks: 360, passages: 360, total: 42 });
    expect(bankHealth(many, [wedged], AT).attention).toEqual([{ intent: "danger", label: "12 stalled", phase: "stalled" }]);
  });

  test("the stall overlay rides the INJECTED clock — the same visible document is queued, then wedged", () => {
    const queued = [doc({ chunkCount: 0, embeddedCount: 0 })];
    const one = census({ byPhase: { embedding: 0, empty: 0, indexing: 1, ready: 0, stalled: 0 }, total: 1 });
    // Before the threshold the row IS the census's `indexing` document, so the chip is suppressed…
    expect(bankHealth(one, queued, AT + FIVE_MINUTES - 1).attention).toEqual([]);
    // …and after it the rendered row reads `stalled` while the census still says `indexing`, so the
    // aggregate re-appears: the tile is honest about a count it cannot see itself into agreement with.
    expect(bankHealth(one, queued, AT + FIVE_MINUTES).attention).toEqual([{ intent: "warning", label: "1 queued", phase: "indexing" }]);
  });

  test("the health LINE reads BOTH counts, with the singulars — and never a cap", () => {
    expect(bankHealthLine(bankHealth(bankCensus, [], AT))).toBe("4 documents · 34 of 51 passages indexed");
    expect(bankHealthLine(bankHealth(census({ chunks: 1, passages: 1, total: 1 }), [], AT))).toBe("1 document · 1 of 1 passage indexed");
    expect(bankHealthLine(bankHealth(census(), [], AT))).toBe("0 documents · 0 of 0 passages indexed");
    // A bank deeper than the old page limit states its SIZE. It used to read "100+" — a page length wearing
    // a census's clothes (side-eye P2-d), which is the reading `databank.bankHealth` retired.
    expect(bankHealthLine(bankHealth(census({ chunks: 1200, passages: 1170, total: 146 }), [], AT))).toBe("146 documents · 1,170 of 1,200 passages indexed");
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
