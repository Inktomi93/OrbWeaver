// The bug-report capture (#1095) — the server half of the owner's dev bug-found button.
//
// INTEGRATION rather than unit: the three clauses that matter are all about REAL state leaving the process —
// a file actually written to a real directory, a window filtered against the REAL in-memory log ring, and a
// planted credential-shaped value NOT surviving the scrub into the bytes on disk. A mocked fs would prove none
// of them.
//
// THE SCRUB PIN IS AN ECHO TEST BY CONSTRUCTION: the credential is planted INSIDE the opaque `client` blob —
// the exact position a field allowlist would miss and a value-based scrub cannot (the
// credential-display-response-echo-leak class: redacting the fields you thought of is not redacting).

import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import process from "node:process";
import type { BugReportRecord } from "@orb/kit/bug-report";
import { resolveEvidenceWindow } from "@orb/kit/evidence-window";
import { afterEach, beforeEach, describe } from "vitest";
import {
  mintBugReportId,
  readBuildIdentity,
  secretLiterals,
  serializeScrubbed,
  snapshotServerEvidence,
  writeBugReport,
} from "../../../../../packages/server/src/foundation/observability/debug/bug-report.ts";
import { logRing } from "../../../../../packages/server/src/foundation/observability/logger.ts";
import { expect, test } from "../../../../support/fixtures.ts";

const NOW = 1_760_000_000_000;
const MINUTE = 60_000;
const PLANTED_SECRET = "sk-live-cb-bug-button-planted-credential";

let dir = "";

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "cb-bug-button-"));
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

function record(overrides: Partial<BugReportRecord> = {}): BugReportRecord {
  return {
    id: mintBugReportId(),
    version: { version: "1.2.3", commit: "c".repeat(40), short: "c".repeat(12), source: "checkout" },
    capturedAt: new Date(NOW).toISOString(),
    build: { sha: "0".repeat(40), dirty: false, statusHead: [] },
    window: resolveEvidenceWindow(NOW, 5),
    note: "the roster pane painted empty after I renamed a character",
    client: null,
    server: { sources: [], evidence: {}, wireCaptureEnabled: false },
    ...overrides,
  };
}

describe("writeBugReport", () => {
  test("a capture WRITES the artifact pair — a JSON bundle and the note as markdown, one stem", async () => {
    const written = await writeBugReport({ repoRoot: dir, record: record(), secrets: [] });
    expect(written).not.toBeNull();
    const files = (await readdir(join(dir, "bug-reports"))).sort();
    expect(files).toHaveLength(2);
    expect(files[0]?.endsWith(".json")).toBe(true);
    expect(files[1]?.endsWith(".md")).toBe(true);
    // One stem, two extensions — a bundle and its note name each other without a manifest.
    expect(files[0]?.replace(/\.json$/u, "")).toBe(files[1]?.replace(/\.md$/u, ""));
  });

  test("the written JSON carries the note, the build identity and the window verbatim", async () => {
    const subject = record();
    const written = await writeBugReport({ repoRoot: dir, record: subject, secrets: [] });
    const parsed = JSON.parse(await readFile(written?.json ?? "", "utf8")) as BugReportRecord;
    expect(parsed.note).toBe(subject.note);
    expect(parsed.build).toEqual(subject.build);
    expect(parsed.window.requestedMinutes).toBe(5);
    expect(parsed.id).toBe(subject.id);
  });

  test("the markdown NAMES a dirty tree instead of pretending to be the commit", async () => {
    const written = await writeBugReport({
      repoRoot: dir,
      record: record({ build: { sha: "a".repeat(40), dirty: true, statusHead: [" M packages/client/src/x.ts"] } }),
      secrets: [],
    });
    const markdown = await readFile(written?.markdown ?? "", "utf8");
    expect(markdown).toContain("DIRTY WORKING TREE");
    expect(markdown).toContain("a".repeat(40));
  });

  test("the markdown states a TRUNCATED source, so a short evidence list never reads as a quiet period", async () => {
    const truncatedAt = NOW - 2 * MINUTE;
    const written = await writeBugReport({
      repoRoot: dir,
      record: record({
        server: {
          sources: [{ source: "wire/captures", windowFilterable: true, cap: 256, held: 256, kept: 4, truncatedAt }],
          evidence: {},
          wireCaptureEnabled: true,
        },
      }),
      secrets: [],
    });
    const markdown = await readFile(written?.markdown ?? "", "utf8");
    expect(markdown).toContain("TRUNCATED sources");
    expect(markdown).toContain("wire/captures");
    expect(markdown).toContain(new Date(truncatedAt).toISOString());
  });
});

describe("the credential scrub", () => {
  test("a planted credential inside the OPAQUE client blob does not reach the file", async () => {
    const written = await writeBugReport({
      repoRoot: dir,
      // Buried two levels down, inside a field name nothing would have thought to allowlist — which is the
      // point: the scrub is by VALUE.
      record: record({ client: { evidence: { headers: [{ authorization: `Bearer ${PLANTED_SECRET}` }] } } }),
      secrets: [PLANTED_SECRET],
    });
    const bytes = await readFile(written?.json ?? "", "utf8");
    expect(bytes).not.toContain(PLANTED_SECRET);
    // A POSITIVE CONTROL for the instrument itself: the surrounding structure survived, so the assertion above
    // is "the secret was removed", not "the file is empty / the write never happened".
    expect(bytes).toContain("authorization");
    expect(bytes).toContain("Bearer");
  });

  test("with no known literals the report is written through unchanged (the scrub is not a mangler)", () => {
    const subject = record({ client: { note: "nothing secret here" } });
    expect(serializeScrubbed(subject, [])).toContain("nothing secret here");
  });

  test("still removes everything when the literals COLLIDE with every redaction marker", async () => {
    // The scrubber picks a marker that contains none of the literals; hand it every candidate AS a literal and
    // it has no safe marker left, degrades to the empty replacement, and must still leave nothing behind. This
    // is the nastiest reachable input, and the one the post-condition in `serializeScrubbed` exists to judge.
    const markerCollision = ["█", "■", "◆", "●", "¤", "§", "¶", "※"];
    const subject = record({ client: { leak: markerCollision.join("") } });
    const scrubbed = serializeScrubbed(subject, markerCollision);
    expect(scrubbed).not.toBeNull();
    for (const literal of markerCollision) {
      expect(scrubbed).not.toContain(literal);
    }
    // …and the report still writes, with its structure intact — a degraded marker must not become a refusal.
    const written = await writeBugReport({ repoRoot: dir, record: subject, secrets: markerCollision });
    expect(written).not.toBeNull();
    expect(await readFile(written?.json ?? "", "utf8")).toContain(subject.note);
  });
});

// #1785 (SECURITY): `serializeScrubbed` is a SERIALIZE-then-scrub site — `JSON.stringify(record, null, 2)`
// ESCAPES `"` and `\`, so an operator credential containing either sat in the bytes under a spelling the
// raw-literal search never saw. Worse, this module's OWN post-condition ("is the literal still present?")
// asked the same raw question, so it certified the leaked bytes and let the file reach disk. Both halves now
// go through the ONE expansion in `@orb/server/kit/secret-redaction`.
describe("the credential scrub — a QUOTE-bearing operator secret (#1785)", () => {
  const quote = '"';
  const backslash = "\\";
  const quotedSecret = `env${quote}cred${backslash}c7f19d4b2a`;
  const escapedSecret = JSON.stringify(quotedSecret).slice(1, -1);

  test("neither spelling of a quoted credential reaches the file", async () => {
    const written = await writeBugReport({
      repoRoot: dir,
      // Buried inside the opaque client blob — the position a field allowlist misses and a by-value scrub
      // must not (the credential-display-response-echo-leak class).
      record: record({ client: { evidence: { headers: [{ authorization: `Bearer ${quotedSecret}` }] } } }),
      secrets: [quotedSecret],
    });
    const bytes = await readFile(written?.json ?? "", "utf8");
    expect(bytes).not.toContain(quotedSecret);
    expect(bytes).not.toContain(escapedSecret);
    // POSITIVE CONTROL: the surrounding structure survived, so this is "removed", not "the file is empty".
    expect(bytes).toContain("authorization");
  });

  test("the post-condition REFUSES bytes still holding the escaped spelling (the belt, not the marker)", () => {
    // The gate before disk asks its own question rather than trusting the scrubber's sentinel. The question
    // has to be asked about the spelling the bytes are actually written in.
    const subject = record({ client: { leak: quotedSecret } });
    const scrubbed = serializeScrubbed(subject, [quotedSecret]);
    expect(scrubbed).not.toBeNull();
    expect(scrubbed).not.toContain(escapedSecret);
    expect(scrubbed).toContain(subject.note);
  });
});

describe("secretLiterals", () => {
  // The env keys are SCREAMING_SNAKE by nature, so they arrive as entry PAIRS rather than object properties —
  // a literal would red `useNamingConvention` and the suppression would be noise around the actual subject.
  test("collects secret-NAMED values and ignores everything else", () => {
    const literals = secretLiterals(
      Object.fromEntries([
        ["OPENROUTER_API_KEY", PLANTED_SECRET],
        ["DEBUG_TOKEN", "another-long-operator-secret"],
        ["SOME_PASSWORD", "hunter2-but-longer"],
        ["NODE_ENV", "development"],
        ["PORT", 8788],
      ]),
    );
    expect([...literals].sort()).toEqual(["another-long-operator-secret", "hunter2-but-longer", PLANTED_SECRET].sort());
  });

  test("skips values too SHORT to scrub by literal — redacting a 3-char 'secret' would shred the report", () => {
    expect(secretLiterals(Object.fromEntries([["API_KEY", "abc"]]))).toEqual([]);
  });
});

describe("snapshotServerEvidence", () => {
  test("filters the REAL log ring to the window and reports held-vs-kept per source", () => {
    logRing.push(JSON.stringify({ level: "error", time: NOW - 60 * MINUTE, msg: "long before the window" }));
    logRing.push(JSON.stringify({ level: "error", time: NOW - MINUTE, msg: "inside the window" }));
    const server = snapshotServerEvidence(resolveEvidenceWindow(NOW, 5));
    const errors = server.evidence["errors"] ?? [];
    const messages = errors.map((entry) => (entry as { msg?: unknown }).msg);
    expect(messages).toContain("inside the window");
    expect(messages).not.toContain("long before the window");
  });

  test("an UNWIRED recorder port reports itself absent — never a silent zero that reads as 'nothing happened'", () => {
    const server = snapshotServerEvidence(resolveEvidenceWindow(NOW, 5));
    const rpg = server.sources.find((meta) => meta.source === "rpg/traces");
    expect(rpg).toMatchObject({ held: 0, kept: 0, windowFilterable: false });
    expect(rpg?.reason).toContain("not wired");
  });

  test("a WIRED recorder port contributes its records through the window", () => {
    const server = snapshotServerEvidence(resolveEvidenceWindow(NOW, 5), {
      rpgTrace: {
        recent: () => [
          { at: NOW - 90 * MINUTE, seq: 1 },
          { at: NOW - MINUTE, seq: 2 },
        ],
      },
    });
    expect(server.evidence["rpgTraces"]).toEqual([{ at: NOW - MINUTE, seq: 2 }]);
    expect(server.sources.find((meta) => meta.source === "rpg/traces")).toMatchObject({ held: 2, kept: 1, windowFilterable: true });
  });
});

describe("readBuildIdentity", () => {
  test("stamps the sha of a real checkout, and answers null where git cannot", () => {
    // The repo itself — the honest positive control (a fixed sha would prove only that a constant is a string).
    const here = readBuildIdentity(process.cwd());
    expect(here.sha).toMatch(/^[0-9a-f]{40}$/u);
    expect(typeof here.dirty).toBe("boolean");
    // A temp dir is not a checkout: `sha: null` is the documented "git could not answer", never a throw.
    expect(readBuildIdentity(dir).sha).toBeNull();
  });
});
