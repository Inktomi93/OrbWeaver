// Final ordinary-waiver grammar, trivia carriers, occurrence identity, and two-sided reconciliation.
import type { SourceFile } from "ts-morph";
import { Project } from "ts-morph";
import type { CoordinatedGateFinding, OrdinaryAuthorityAlarm, SelectedGatePolicy } from "../../../../tooling/src/verify/contract/gate-authority.ts";
import type { OrdinaryWaiverEngine, OrdinaryWaiverMatchResult } from "../../../../tooling/src/verify/contract/ordinary-waiver.ts";
import { createOrdinaryWaiverEngine } from "../../../../tooling/src/verify/lib/ordinary-waiver.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

const ORDINARY = "ordinary-policy";
const FILE = "packages/sample/src/probe.tsx";
const POLICIES: readonly SelectedGatePolicy[] = [
  { id: ORDINARY, authority: "ordinary", severity: "error" },
  { id: "hard-policy", authority: "hard", severity: "error" },
  { id: "reviewed-policy", authority: "reviewed-grant", severity: "warning" },
];

interface WaiverFixture {
  readonly sourceFiles: ReadonlyMap<string, SourceFile>;
  readonly engine: OrdinaryWaiverEngine;
}

function fixture(files: Readonly<Record<string, string>>, policies: readonly SelectedGatePolicy[] = POLICIES): WaiverFixture {
  const project = new Project({ useInMemoryFileSystem: true, skipFileDependencyResolution: true });
  const sourceFiles = new Map(Object.entries(files).map(([path, source]) => [path, project.createSourceFile(`/repo/${path}`, source)] as const));
  const sources = [...sourceFiles].map(([path, sourceFile]) => ({ kind: "typescript" as const, path, sourceFile }));
  return { sourceFiles, engine: createOrdinaryWaiverEngine({ sources, knownPolicies: policies }) };
}

function occurrence(source: string, token: string, nth = 1): number {
  let from = 0;
  let found = -1;
  for (let index = 0; index < nth; index += 1) {
    found = source.indexOf(token, from);
    if (found === -1) {
      throw new Error(`fixture token ${JSON.stringify(token)} occurrence ${nth} is absent`);
    }
    from = found + token.length;
  }
  return found;
}

interface FindingOptions {
  readonly nth?: number;
  readonly policyId?: string;
  readonly file?: string;
}

function finding(source: string, token: string, options: FindingOptions = {}): CoordinatedGateFinding {
  const { nth = 1, policyId = ORDINARY, file = FILE } = options;
  const project = new Project({ useInMemoryFileSystem: true, skipFileDependencyResolution: true });
  const sf = project.createSourceFile(`/coordinates/${file}`, source);
  const { line, column } = sf.getLineAndColumnAtPos(occurrence(source, token, nth));
  return { file, line, column, token, policyId, severity: "error" };
}

function lastFinding(source: string, token: string, policyId = ORDINARY, file = FILE): CoordinatedGateFinding {
  const occurrences = source.split(token).length - 1;
  return finding(source, token, { nth: occurrences, policyId, file });
}

interface CompletedResult {
  readonly match: OrdinaryWaiverMatchResult;
  readonly alarms: readonly OrdinaryAuthorityAlarm[];
}

function completed(
  engine: ReturnType<typeof createOrdinaryWaiverEngine>,
  findings: readonly CoordinatedGateFinding[],
  completedPolicyIds = [ORDINARY],
): CompletedResult {
  const match = engine.match(findings);
  return { match, alarms: engine.reconcile({ completedPolicyIds, match }) };
}

test("CONTROL — an unmarked exact finding stays effective", () => {
  const source = "export const value = forbidden();\n";
  const { engine } = fixture({ [FILE]: source });
  const { match, alarms } = completed(engine, [finding(source, "forbidden")]);

  expect(match.waiverIds).toEqual([null]);
  expect(match.consumption.size).toBe(0);
  expect(alarms).toEqual([]);
});

test("line comments bind in leading and same-line trailing trivia with exact marker coordinates", () => {
  const leadingSource = `// @orb-waive ${ORDINARY}(forbidden): accepted leading occurrence\nexport const value = forbidden();\n`;
  const leading = fixture({ [FILE]: leadingSource });
  const leadingResult = completed(leading.engine, [finding(leadingSource, "forbidden", { nth: 2 })]);
  expect(leadingResult.match.waiverIds).toEqual([`${FILE}:1:1`]);
  expect(leadingResult.match.consumption.get(`${FILE}:1:1`)).toBe(1);
  expect(leadingResult.alarms).toEqual([]);

  const trailingSource = `export const value = forbidden(); // @orb-waive ${ORDINARY}(forbidden): accepted trailing occurrence\n`;
  const trailing = fixture({ [FILE]: trailingSource });
  const markerColumn = occurrence(trailingSource, "//") + 1;
  const trailingResult = completed(trailing.engine, [finding(trailingSource, "forbidden")]);
  expect(trailingResult.match.waiverIds).toEqual([`${FILE}:1:${markerColumn}`]);
  expect(trailingResult.alarms).toEqual([]);
});

test("block comments bind before and after an authored occurrence", () => {
  const before = `export const value = /* @orb-waive ${ORDINARY}(forbidden): exact inline block */ forbidden();\n`;
  const beforeResult = completed(fixture({ [FILE]: before }).engine, [finding(before, "forbidden", { nth: 2 })]);
  expect(beforeResult.match.waiverIds[0]).toBe(`${FILE}:1:${occurrence(before, "/*") + 1}`);
  expect(beforeResult.alarms).toEqual([]);

  const after = `export const value = forbidden(); /* @orb-waive ${ORDINARY}(forbidden): exact trailing block */\n`;
  const afterResult = completed(fixture({ [FILE]: after }).engine, [finding(after, "forbidden")]);
  expect(afterResult.match.waiverIds[0]).toBe(`${FILE}:1:${occurrence(after, "/*") + 1}`);
  expect(afterResult.alarms).toEqual([]);
});

test("a JSX block-comment carrier binds the adjacent JSX occurrence", () => {
  const source = `export const view = <section>\n  {/* @orb-waive ${ORDINARY}(Forbidden): reviewed JSX occurrence */}\n  <Forbidden />\n</section>;\n`;
  const { engine } = fixture({ [FILE]: source });
  const result = completed(engine, [finding(source, "Forbidden", { nth: 2 })]);

  expect(result.match.waiverIds).toEqual([`${FILE}:2:4`]);
  expect(result.alarms).toEqual([]);
});

test("a JSX carrier between two authored regions is ambiguous and suppresses neither side", () => {
  const source = `export const view = <><Allowed />{/* @orb-waive ${ORDINARY}(Forbidden): ambiguous sibling carrier */}<Forbidden /></>;\n`;
  const result = completed(fixture({ [FILE]: source }).engine, [finding(source, "Forbidden", { nth: 2 })]);

  expect(result.match.waiverIds).toEqual([null]);
  expect(result.match.markers).toMatchObject([{ outcome: "ambiguous-trivia", candidateCount: 0 }]);
  expect(result.match.consumption.get(`${FILE}:1:${occurrence(source, "/*") + 1}`)).toBe(0);
  expect(result.alarms[0]?.message).toContain("ambiguous comment trivia");
});

test("the grammar requires policy id, nonempty position, and nonempty reason", () => {
  const sources = [
    "// @orb-waive\nexport const value = forbidden();\n",
    `// @orb-waive ${ORDINARY}: reason\nexport const value = forbidden();\n`,
    `// @orb-waive ${ORDINARY}(): reason\nexport const value = forbidden();\n`,
    `// @orb-waive ${ORDINARY}(forbidden):   \nexport const value = forbidden();\n`,
  ];
  for (const source of sources) {
    const { engine } = fixture({ [FILE]: source });
    const result = completed(engine, [lastFinding(source, "forbidden")]);
    expect(result.match.waiverIds).toEqual([null]);
    expect(result.match.markers.map(({ outcome }) => outcome)).toEqual(["malformed"]);
    expect(result.alarms[0]?.message).toContain("malformed ordinary waiver");
  }
});

test("legacy central and custom spellings are inert even when carried by real comments", () => {
  const legacy = [
    "@orb-gate-ignore",
    "@foreign-id-ok",
    "@sub-floor-ok",
    "@finding-overload-ok",
    "@owner-scope-ok",
    "@owner-scope-write-ok",
    "@owner-scope-upsert-ok",
    "@first-boot-only",
    "@swallowed-ok",
    "@surface-focus-elsewhere",
    "@nullable-cmp-ok",
    "@over-art-plate-ok",
  ];
  const comments = legacy.map((name) => `// ${name} ${ORDINARY}(forbidden): legacy`).join("\n");
  const source = `${comments}\nexport const value = forbidden();\n`;
  const result = completed(fixture({ [FILE]: source }).engine, [lastFinding(source, "forbidden")]);

  expect(result.match.markers).toEqual([]);
  expect(result.match.waiverIds).toEqual([null]);
  expect(result.alarms).toEqual([]);
});

test("only authored .ts/.tsx paths contribute markers; module-script extensions stay inert", () => {
  const source = `// @orb-waive ${ORDINARY}(forbidden): exact authored source universe\nexport const value = forbidden();\n`;
  const files = {
    "plain.ts": source,
    "component.tsx": source,
    "types.d.ts": source,
    "ignored.mts": source,
    "ignored.cts": source,
    "ignored.mjs": source,
    "ignored.cjs": source,
    "ignored.js": source,
    "ignored.jsx": source,
  };
  const { engine } = fixture(files);
  const findings = Object.keys(files).map((file) => finding(source, "forbidden", { nth: 2, file }));
  const result = completed(engine, findings);

  expect(result.match.waiverIds).toEqual(["plain.ts:1:1", "component.tsx:1:1", "types.d.ts:1:1", null, null, null, null, null, null]);
  expect([...result.match.consumption]).toEqual([
    ["component.tsx:1:1", 1],
    ["plain.ts:1:1", 1],
    ["types.d.ts:1:1", 1],
  ]);
  expect(result.match.markers.map(({ id }) => id)).toEqual(["component.tsx:1:1", "plain.ts:1:1", "types.d.ts:1:1"]);
  expect(result.alarms).toEqual([]);
});

test("marker-shaped strings, JSX text, and mid-comment prose are mentions, never waivers", () => {
  const source = `const text = "@orb-waive ${ORDINARY}(forbidden): quoted";\nconst jsx = <>@orb-waive ${ORDINARY}(forbidden): jsx text</>;\n// docs say @orb-waive ${ORDINARY}(forbidden): mid-comment\n/** @orb-waive ${ORDINARY}(forbidden): JSDoc mention */\nexport const value = forbidden();\n`;
  const result = completed(fixture({ [FILE]: source }).engine, [lastFinding(source, "forbidden")]);

  expect(result.match.markers).toEqual([]);
  expect(result.match.waiverIds).toEqual([null]);
  expect(result.alarms).toEqual([]);
});

test("unknown, hard, and reviewed-grant policy markers alarm and suppress nothing", () => {
  const source =
    "// @orb-waive missing-policy(forbidden): unknown\nexport const a = forbidden();\n// @orb-waive hard-policy(forbidden): forbidden door\nexport const b = forbidden();\n// @orb-waive reviewed-policy(forbidden): wrong door\nexport const c = forbidden();\n";
  const { engine } = fixture({ [FILE]: source });
  const findings = [
    finding(source, "forbidden", { nth: 2 }),
    finding(source, "forbidden", { nth: 4, policyId: "hard-policy" }),
    finding(source, "forbidden", { nth: 6, policyId: "reviewed-policy" }),
  ];
  const match = engine.match(findings);
  const alarms = engine.reconcile({ completedPolicyIds: [], match });

  expect(match.waiverIds).toEqual([null, null, null]);
  expect(match.markers.map(({ outcome }) => outcome)).toEqual(["unknown-policy", "wrong-authority", "wrong-authority"]);
  expect(alarms.map(({ policyId }) => policyId)).toEqual(["hard-policy", "missing-policy", "reviewed-policy"]);
});

test("dead-position and stale markers are distinct and wait for completed owners", () => {
  const source = `// @orb-waive ${ORDINARY}(other): dead position\nexport const a = forbidden();\n// @orb-waive ${ORDINARY}(missing): stale after the site disappeared\nexport const b = allowed();\n`;
  const { engine } = fixture({ [FILE]: source });
  const match = engine.match([finding(source, "forbidden")]);

  expect(match.markers.map(({ outcome }) => outcome)).toEqual(["dead-position", "stale"]);
  expect(engine.reconcile({ completedPolicyIds: [], match })).toEqual([]);
  expect(engine.reconcile({ completedPolicyIds: [ORDINARY], match }).map(({ message }) => message)).toEqual([
    expect.stringContaining("dead position"),
    expect.stringContaining("stale ordinary waiver"),
  ]);
});

test("a marker whose matching position exists outside its trivia block fails loud as unbound", () => {
  const source = `// @orb-waive ${ORDINARY}(forbidden): wrong statement\nexport const first = allowed();\nexport const second = forbidden();\n`;
  const result = completed(fixture({ [FILE]: source }).engine, [finding(source, "forbidden", { nth: 2 })]);

  expect(result.match.waiverIds).toEqual([null]);
  expect(result.match.markers.map(({ outcome }) => outcome)).toEqual(["unbound-trivia"]);
  expect(result.alarms[0]?.message).toContain("cannot bind through comment trivia");
});

test("one marker matching multiple findings is over-broad and suppresses none", () => {
  const source = `// @orb-waive ${ORDINARY}(forbidden): cannot identify one of two\nexport const values = [forbidden(), forbidden()];\n`;
  const findings = [finding(source, "forbidden", { nth: 2 }), finding(source, "forbidden", { nth: 3 })];
  const result = completed(fixture({ [FILE]: source }).engine, findings);

  expect(result.match.waiverIds).toEqual([null, null]);
  expect(result.match.markers).toMatchObject([{ outcome: "over-broad", candidateCount: 2 }]);
  expect(result.match.consumption.get(`${FILE}:1:1`)).toBe(2);
  expect(result.alarms[0]?.message).toContain("matched 2 findings and suppressed none");
});

test("two markers targeting one finding are duplicate authority and both suppress none", () => {
  const source = `// @orb-waive ${ORDINARY}(forbidden): first reason\n// @orb-waive ${ORDINARY}(forbidden): second reason\nexport const value = forbidden();\n`;
  const result = completed(fixture({ [FILE]: source }).engine, [finding(source, "forbidden", { nth: 3 })]);

  expect(result.match.waiverIds).toEqual([null]);
  expect(result.match.markers.map(({ outcome }) => outcome)).toEqual(["duplicate-target", "duplicate-target"]);
  expect(result.alarms).toHaveLength(2);
  expect(result.alarms.every(({ message }) => message.includes("suppressed none"))).toBe(true);
});

test("missing or false finding coordinates fail loud and cannot consume a marker", () => {
  const source = `// @orb-waive ${ORDINARY}(forbidden): exact coordinate required\nexport const value = forbidden();\n`;
  const exact = finding(source, "forbidden", { nth: 2 });
  const wrong = { ...exact, column: exact.column + 1 };
  const result = completed(fixture({ [FILE]: source }).engine, [wrong]);

  expect(result.match.waiverIds).toEqual([null]);
  expect(result.match.bindingFailures).toHaveLength(1);
  expect(result.alarms.map(({ message }) => message)).toEqual([
    expect.stringContaining("does not point at its exact position token"),
    expect.stringContaining("stale ordinary waiver"),
  ]);
});

test("a finding coordinate inside the marker comment is not an authored code occurrence", () => {
  const source = `// @orb-waive ${ORDINARY}(forbidden): comment text is not code\nexport const value = forbidden();\n`;
  const commentFinding = finding(source, "forbidden");
  const result = completed(fixture({ [FILE]: source }).engine, [commentFinding]);

  expect(result.match.waiverIds).toEqual([null]);
  expect(result.match.consumption.get(`${FILE}:1:1`)).toBe(0);
  expect(result.match.bindingFailures[0]?.message).toContain("points into comment trivia rather than authored code");
  expect(result.alarms).toHaveLength(2);
});

test("matching and alarm order are deterministic across unsorted files and findings", () => {
  const a = `// @orb-waive ${ORDINARY}(alpha): a\nexport const a = alpha();\n`;
  const z = `// @orb-waive ${ORDINARY}(zeta): z\nexport const z = zeta();\n`;
  const files = { "z.ts": z, "a.ts": a };
  const { engine } = fixture(files);
  const findings = [finding(z, "zeta", { nth: 2, file: "z.ts" }), finding(a, "alpha", { nth: 2, file: "a.ts" })];
  const first = completed(engine, findings);
  const second = completed(engine, findings);

  expect(first).toEqual(second);
  expect(first.match.waiverIds).toEqual(["z.ts:1:1", "a.ts:1:1"]);
  expect([...first.match.consumption]).toEqual([
    ["a.ts:1:1", 1],
    ["z.ts:1:1", 1],
  ]);
});

test("duplicate known policy identities refuse engine construction", () => {
  const source = "export const value = forbidden();\n";
  const duplicate = [...POLICIES, POLICIES[0] as SelectedGatePolicy];
  expect(() => fixture({ [FILE]: source }, duplicate)).toThrow(`ordinary waiver engine received duplicate known policy ${ORDINARY}`);
});

// ─── #2205: `unbound-trivia` only survives while RELOCATION IS AN AVAILABLE REMEDY ───────────────────
//
// A MINIMAL PAIR, and it has to be a pair. Both files below are byte-identical except for ONE marker, and
// both put the waiver on a statement that holds no finding — so every input the old predicate looked at is
// the same in the two cases and it called them both `unbound-trivia`. The discriminator is not in the
// marker or its trivia at all: it is whether the same-token finding elsewhere in the file is ALREADY
// CLAIMED by another matched marker, which decides whether the advice `unbound-trivia` gives ("move it onto
// the occurrence it names") is possible or provably yields `duplicate-target`.
//
// A one-directional control would let the label flip back silently, which is why neither of these is
// written alone. The wrong-statement pin above (`a marker whose matching position exists outside its trivia
// block fails loud as unbound`) is the third leg and is deliberately NOT modified — if satisfying #2205
// ever requires editing it, the fix has drifted back into collapsing two real states into one.

test("#2205 — a marker over a NON-SITE whose same-token finding is already waived reads STALE, not unbound", () => {
  // The shape that mislabelled on the real tree: `lib/biome-rule-liveness.ts:303` waived a `catch` that
  // `{ cause }` chaining already owns, so the site was never in the population; its `error` position
  // collided with the genuinely-waived absorb 140 lines up and the engine advertised a relocation that
  // would have produced a duplicate.
  const source = [
    `// @orb-waive ${ORDINARY}(forbidden): the real site, waived since the file was written`,
    "export const owned = forbidden();",
    `// @orb-waive ${ORDINARY}(forbidden): waives nothing — this statement is not a site at all`,
    "export const notASite = allowed();",
    "",
  ].join("\n");
  // nth 2: the first `forbidden` in the text is the one inside the first marker's position.
  const result = completed(fixture({ [FILE]: source }).engine, [finding(source, "forbidden", { nth: 2 })]);

  expect(result.match.markers.map(({ outcome }) => outcome)).toEqual(["matched", "stale"]);
  // The real site is still suppressed by its own marker — the downgrade must not disturb the claim.
  expect(result.match.waiverIds).toEqual([`${FILE}:1:1`]);
  expect(result.alarms.map(({ message }) => message)).toEqual([expect.stringContaining("stale ordinary waiver")]);
  // And it must NOT tell the reader to relocate, which is the whole defect.
  expect(result.alarms[0]?.message).not.toContain("cannot bind through comment trivia");
});

test("#2205 — the SAME shape with the finding UNCLAIMED still reads unbound: relocation is still available", () => {
  // Byte-identical to the case above minus the claiming marker. The stray waiver is equally useless to its
  // own statement, but the finding it names has no owner, so `unbound-trivia` remains the honest label and
  // "move it there" remains a coherent instruction — this is the DECLARED LIMIT the fix leaves standing.
  const source = [
    "export const owned = forbidden();",
    `// @orb-waive ${ORDINARY}(forbidden): waives nothing here either, but the target is unowned`,
    "export const notASite = allowed();",
    "",
  ].join("\n");
  const result = completed(fixture({ [FILE]: source }).engine, [finding(source, "forbidden")]);

  expect(result.match.markers.map(({ outcome }) => outcome)).toEqual(["unbound-trivia"]);
  expect(result.match.waiverIds).toEqual([null]);
  expect(result.alarms.map(({ message }) => message)).toEqual([expect.stringContaining("cannot bind through comment trivia")]);
});
