// Mirror test for @orb/server/kit/serde/lib — THE spine every orb-native JSON serde is defined through.
// Pins the six things that were hand-cloned (and therefore drifted) per family before it existed: the
// envelope emit, the JSON decode refusal, the VERSION GATE (accept `<=` mine, refuse newer BY NAME), the
// declared `rowPolicy` split, the accept-old-forever repair arms (`legacyVersionKeys` / `envelopeOptional`),
// and the deterministic 2-space emit.
//
// These are defined over TOY families on purpose: the point is that the SPINE owns the behaviour, so a
// family gets it by construction rather than by re-implementing it correctly.

import type { PortableParse } from "@orb/contracts/portability";
import type { EmptyJsonHeader, JsonSerde } from "@orb/server/kit/serde/lib";
import { defineJsonObjectSerde, defineJsonRowsSerde, NO_JSON_HEADER, noJsonHeader, portableParseError } from "@orb/server/kit/serde/lib";
import { describe } from "vitest";
import { z } from "zod";
import { expect, test } from "../../../../support/fixtures.ts";

/** The refusal reason — narrows the parse union so a test can name the failure it expects. */
function refusalOf<T>(result: PortableParse<T>): string {
  if (result.ok) {
    throw new Error("expected the file to be refused, but it parsed");
  }
  return result.reason;
}

const ENC = new TextEncoder();
const DEC = new TextDecoder();
const KIND = "orb.test-rows";
const OBJECT_KIND = "orb.test-object";

interface Row {
  readonly name: string;
}
interface Bag {
  readonly rows: readonly Row[];
}

const rowSchema = z.object({ name: z.string().trim().min(1) });

function rowsSerde(rowPolicy: "drop" | "reject-file"): JsonSerde<Bag> {
  return defineJsonRowsSerde<Bag, Row, EmptyJsonHeader>({
    schemaKind: KIND,
    schemaVersion: 2,
    plural: "rows",
    rowSchema,
    rowPolicy,
    headerSchema: noJsonHeader(),
    toWire: (bag) => ({ header: NO_JSON_HEADER, rows: bag.rows.map((r) => ({ name: r.name })) }),
    fromWire: (rows) => ({ rows }),
  });
}

const dropping = rowsSerde("drop");
const rejecting = rowsSerde("reject-file");

function file(body: Record<string, unknown>): Uint8Array {
  return ENC.encode(JSON.stringify(body));
}

describe("the envelope", () => {
  test("build stamps schemaKind + schemaVersion, and the emit is deterministic 2-space JSON", () => {
    const bytes = dropping.build({ rows: [{ name: "a" }] });
    expect(DEC.decode(bytes)).toBe(JSON.stringify({ schemaKind: KIND, schemaVersion: 2, rows: [{ name: "a" }] }, null, 2));
    expect(DEC.decode(dropping.build({ rows: [{ name: "a" }] }))).toBe(DEC.decode(bytes));
  });

  test("a foreign schemaKind is refused BY KIND — this is the fence between two portable families", () => {
    const outcome = dropping.parse(file({ schemaKind: "orb.something-else", schemaVersion: 1, rows: [] }));
    expect(outcome).toEqual({ ok: false, reason: "foreign-kind" });
  });

  test("bytes that are not JSON, and bytes that are JSON but not an object, are both `not-json`", () => {
    expect(refusalOf(dropping.parse(ENC.encode("{nope")))).toBe("not-json");
    expect(refusalOf(dropping.parse(new Uint8Array()))).toBe("not-json");
    expect(refusalOf(dropping.parse(ENC.encode("[1,2,3]")))).toBe("not-json");
  });
});

describe("the version gate", () => {
  test("an OLDER file parses (accept-old-forever — portable files are external artifacts)", () => {
    const outcome = dropping.parse(file({ schemaKind: KIND, schemaVersion: 1, rows: [{ name: "old" }] }));
    expect(outcome.ok).toBe(true);
  });

  test("a NEWER file is refused BY NAME rather than parsed with today's semantics", () => {
    // THE defect this arm kills: every family used to validate `schemaVersion` as "any positive int" and
    // then parse with v1 semantics regardless, so a future file half-restored in silence.
    expect(refusalOf(dropping.parse(file({ schemaKind: KIND, schemaVersion: 3, rows: [] })))).toBe("newer-version");
  });

  test("a present-but-nonsense version is `malformed`, never a silent v1", () => {
    expect(refusalOf(dropping.parse(file({ schemaKind: KIND, schemaVersion: "two", rows: [] })))).toBe("malformed");
    expect(refusalOf(dropping.parse(file({ schemaKind: KIND, schemaVersion: 0, rows: [] })))).toBe("malformed");
  });

  test("`legacyVersionKeys` reads a family's OLD version spelling forever (world-info's `version`)", () => {
    const withLegacy = defineJsonRowsSerde<Bag, Row, EmptyJsonHeader>({
      schemaKind: KIND,
      schemaVersion: 2,
      legacyVersionKeys: ["version"],
      plural: "rows",
      rowSchema,
      rowPolicy: "drop",
      headerSchema: noJsonHeader(),
      toWire: (bag) => ({ header: NO_JSON_HEADER, rows: [...bag.rows] }),
      fromWire: (rows) => ({ rows }),
    });
    expect(withLegacy.parse(file({ schemaKind: KIND, version: 1, rows: [{ name: "legacy" }] })).ok).toBe(true);
    // …and the legacy key is still VERSION-GATED, not merely tolerated.
    expect(refusalOf(withLegacy.parse(file({ schemaKind: KIND, version: 9, rows: [] })))).toBe("newer-version");
    // Build emits ONLY the uniform key.
    expect(DEC.decode(withLegacy.build({ rows: [] }))).toContain('"schemaVersion": 2');
  });
});

describe("rowPolicy — the DECLARED strictness choice (O-8)", () => {
  const body = { schemaKind: KIND, schemaVersion: 2, rows: [{ name: "keep" }, { name: "  " }, 42, { name: "also" }] };

  test('"drop" keeps the good rows — one bad row must not cost a 200-row restore', () => {
    const outcome = dropping.parse(file(body));
    expect(outcome.ok).toBe(true);
    expect(outcome.ok ? outcome.value.rows.map((r) => r.name) : []).toEqual(["keep", "also"]);
  });

  test('"reject-file" fails the WHOLE file on one bad row — the lorebook posture', () => {
    expect(refusalOf(rejecting.parse(file(body)))).toBe("malformed");
  });

  test("a missing / non-array plural is malformed under both policies", () => {
    expect(refusalOf(dropping.parse(file({ schemaKind: KIND, schemaVersion: 2 })))).toBe("malformed");
    expect(refusalOf(rejecting.parse(file({ schemaKind: KIND, schemaVersion: 2, rows: "nope" })))).toBe("malformed");
  });
});

describe("the object arm", () => {
  const objectSerde = defineJsonObjectSerde<{ readonly title: string }, { readonly title: string }>({
    schemaKind: OBJECT_KIND,
    schemaVersion: 1,
    envelopeOptional: true,
    bodySchema: z.object({ title: z.string().min(1) }),
    toWire: (value) => ({ title: value.title }),
    fromWire: (body) => ({ title: body.title }),
  });

  test("build stamps the envelope even for a family whose FILES may arrive without one", () => {
    expect(JSON.parse(DEC.decode(objectSerde.build({ title: "x" })))).toEqual({ schemaKind: OBJECT_KIND, schemaVersion: 1, title: "x" });
  });

  test("`envelopeOptional` accepts an envelope-LESS legacy file forever", () => {
    const outcome = objectSerde.parse(file({ title: "no envelope here" }));
    expect(outcome.ok ? outcome.value.title : null).toBe("no envelope here");
  });

  test("envelope-optional is not envelope-BLIND: a foreign kind is still refused", () => {
    expect(refusalOf(objectSerde.parse(file({ schemaKind: "orb.other", schemaVersion: 1, title: "x" })))).toBe("foreign-kind");
  });

  test("a body that fails its schema is `malformed`, never a throw", () => {
    expect(refusalOf(objectSerde.parse(file({ title: "" })))).toBe("malformed");
  });
});

describe("portableParseError", () => {
  test("every reason renders operator-facing WORDS — the newer-version case names the real problem", () => {
    expect(portableParseError(KIND, "newer-version")).toContain("newer version of orbweaver");
    expect(portableParseError(KIND, "foreign-kind")).toContain(KIND);
    expect(portableParseError(KIND, "not-json")).toContain("not JSON");
    expect(portableParseError(KIND, "malformed")).toContain(KIND);
  });
});
