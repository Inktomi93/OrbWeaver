// THE KNOB-WIRE FAMILY (D107, #1584) — the properties a declared proof row cannot express: the §6.4
// conversion differential against the frozen legacy descriptor, the bidirectional population port with its
// inside/outside controls, and the central reviewed-grant behaviour that REPLACED the legacy gate's two
// `ExemptionTable`s and their hand-rolled STALE/ORPHAN arms.
//
// THE DIFFERENTIAL IS A BIJECTION, NOT A TRANSCRIPTION. Every one of the legacy descriptor's 15 `mustFlag`
// and 8 `mustPass` fixtures is replayed through BOTH engines over the same bytes, and the legacy arm keys
// are translated into final `(subject, operation)` identities through ONE declared map. Equality per
// scenario is the catch-parity proof; the two declared EXCEPTIONS are the two retired arms, each named.
//
// The declared rows themselves (15 catches, 8 passes, 13 refusals) run on the static
// `structure:policy-conformance` stage; the first test here only asserts they are readable, so a row that
// stops conforming is caught in this file too rather than only in the whole-corpus stage.
import { Project } from "ts-morph";
import type { ReviewedGateGrant } from "../../../../tooling/src/verify/contract/gate-authority.ts";
import { gate } from "../../../../tooling/src/verify/gates/knob-wire-coverage.ts";
import { KNOB_WIRE_OPERATIONS } from "../../../../tooling/src/verify/lib/knob-wire-fact.ts";
import { runPolicyPass } from "../../../../tooling/src/verify/lib/policy-pass.ts";
import { REVIEWED_GRANTS } from "../../../../tooling/src/verify/lib/reviewed-grants.ts";
import { verifyPolicyProofs } from "../../../../tooling/src/verify/ops/policy-conformance.ts";
import type { Files, Label } from "../../../support/legacy-differential.ts";
import { createDifferential, frozenLegacyGate, legacyScenarios, sorted } from "../../../support/legacy-differential.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

/** The pre-conversion SHA of `tooling/src/verify/gates/knob-wire-coverage.ts`. */
const LEGACY_SHA = "4791ef15d";
const LEGACY_PATH = "tooling/src/verify/gates/knob-wire-coverage.ts";
const ROOT = "/knob-wire-family";
const SETTINGS = "packages/contracts/src/settings/index.ts";
const CLIENT_WRITER = "packages/client/src/features/x/components/x.tsx";

function projectFor(files: Files): Project {
  const project = new Project({ useInMemoryFileSystem: true });
  for (const [path, text] of Object.entries(files)) {
    project.createSourceFile(`${ROOT}/${path}`, text);
  }
  return project;
}

function after(files: Files, reviewedGrants: readonly ReviewedGateGrant[] = []): ReturnType<typeof runPolicyPass> {
  return runPolicyPass({ root: ROOT, project: projectFor(files), knownPolicies: [gate], policies: [gate], reviewedGrants, failOnWarnings: false });
}

/** The reviewed identity a finding carries — the only thing a central grant can name. */
function identities(result: ReturnType<typeof runPolicyPass>): readonly string[] {
  return sorted(result.authority.effectiveFindings.map((finding) => `${finding.subject ?? "-"}|${finding.operation ?? "-"}`));
}

// ── the §6.4 differential vocabulary ───────────────────────────────────────────────────────────────────
/** The legacy finding's registry key (`<arm>:<member>[:<direction>]`), or its retired-arm label. */
const ARM_KEY: Label = (seen) => {
  const keyed = /knob-wire-coverage\[(?<key>[^\]]+)\]/u.exec(seen.message)?.groups?.["key"];
  if (keyed === undefined) {
    return seen.message.includes("was renamed away") ? "TRIPWIRE" : `UNCLASSIFIED: ${seen.message.slice(0, 80)}`;
  }
  return seen.message.includes("GAINED its wire") ? `STALE ${keyed}` : keyed;
};

/** THE ONE TRANSLATION between the legacy registry key and the final reviewed identity. A legacy key the
 *  map cannot answer is a THROW, never a quietly dropped row — the same totality the tool-error classifier
 *  owes. `C:` keys key on `userSettingsSchema` because arm C's population is the settings schema's leaves. */
const ARM_SUBJECT: ReadonlyMap<string, readonly [string, string]> = new Map([
  ["A", ["EffectiveAppConfig", KNOB_WIRE_OPERATIONS.configField]],
  ["B", ["USER_SETTINGS_SECTIONS", KNOB_WIRE_OPERATIONS.settingsSection]],
  ["B2", ["appSettingsSchema", KNOB_WIRE_OPERATIONS.adminKey]],
  ["C", ["userSettingsSchema", KNOB_WIRE_OPERATIONS.settingsLeaf]],
  ["E", ["DEFAULT_FORMAT_STRINGS", KNOB_WIRE_OPERATIONS.formatString]],
  ["F:write", ["chatMetadataSchema", KNOB_WIRE_OPERATIONS.metadataWrite]],
  ["F:read", ["chatMetadataSchema", KNOB_WIRE_OPERATIONS.metadataRead]],
]);

function translate(legacyKey: string): string {
  const parts = legacyKey.split(":");
  const [arm, member, direction] = parts;
  const armKey = direction === undefined ? arm : `${arm}:${direction}`;
  const row = armKey === undefined ? undefined : ARM_SUBJECT.get(armKey);
  if (row === undefined || member === undefined || parts.length > 3) {
    throw new Error(`untranslatable legacy key: ${legacyKey}`);
  }
  return `${row[0]}.${member}|${row[1]}`;
}

/** Every refusal this conversion can produce, compressed to a declarable code. THROWS on a shape it does
 *  not recognise: a differential that silently absorbs a new refusal is the vacuity it exists to prevent. */
const REFUSAL_CODES: readonly (readonly [string, string])[] = [
  ["was renamed away", "tripwire"],
  ["resolves to no interface declaration", "unresolved-heritage"],
  ["which no local declaration or named import binds", "tuple-unbound"],
  ["resolves to no local declaration or named import", "schema-unbound"],
  ["contributed zero members", "zero-contribution"],
  ["composition cycle", "cycle"],
  ["unsupported appSettingsSchema schema method", "key-changing-method"],
  ["unsupported appSettingsSchema expression", "unmodelled-builder"],
  ["unsupported appSettingsSchema member kind", "unsupported-member-kind"],
  ["computed appSettingsSchema key", "computed-key"],
  ['composes no "appearance" property', "manifest-edge-missing"],
  ["carries no readable schema expression", "manifest-edge-shorthand"],
];

function classifyToolError(owner: string, phase: string, message: string): string {
  for (const [needle, code] of REFUSAL_CODES) {
    if (message.includes(needle)) {
      return code;
    }
  }
  throw new Error(`unclassified refusal from ${owner}/${phase}: ${message}`);
}

const differential = createDifferential(ROOT, classifyToolError);

// ── the declared per-scenario exceptions ───────────────────────────────────────────────────────────────
/** A scenario whose legacy keys do NOT translate 1:1 into final identities, with its §6.4 class. */
interface RetiredArm {
  readonly legacyKeys: readonly string[];
  readonly finalIdentities: readonly string[];
  readonly finalErrors: readonly string[];
  readonly classification: string;
}

const RETIRED_ARMS: ReadonlyMap<string, RetiredArm> = new Map([
  [
    "STALE B:profile",
    {
      legacyKeys: ["STALE B:profile"],
      finalIdentities: [],
      finalErrors: [],
      classification:
        "RETIRED ARM (exemption-mechanism move). The legacy STALE arm fired because `profile` gained a section-patch writer while still carrying a DEFERRED entry. The final policy owns no table, so a wired member is simply not a finding; its successor is the central `stale-reviewed-grant` alarm, driven below.",
    },
  ],
  [
    "TRIPWIRE",
    {
      legacyKeys: ["TRIPWIRE"],
      finalIdentities: [],
      finalErrors: ["tripwire"],
      classification:
        "RETIRED ARM → STRONGER SUCCESSOR. The legacy paired-anchor tripwire was an ordinary finding; a reviewed-grant finding is GRANTABLE, so a permanent licence could be minted over a vacuous arm. The successor is an unsuppressible refusal (exit 2), which is why the final side reports zero findings and one fact tool error.",
    },
  ],
]);

test("every declared row conforms", () => {
  expect(verifyPolicyProofs([gate])).toEqual([]);
});

// ── §6.4 conversion differential: all 23 legacy fixtures, both engines, the same bytes ─────────────────

test("every legacy fixture's findings translate 1:1 into the final reviewed identities", async ({ scratch }) => {
  const legacy = await frozenLegacyGate(scratch, LEGACY_SHA, LEGACY_PATH);
  expect([legacy.mustFlag.length, legacy.mustPass.length], "the frozen descriptor is the one this conversion replaced").toEqual([15, 8]);
  const examples = legacyScenarios(legacy, SETTINGS);
  let legacyTotal = 0;
  let finalTotal = 0;
  let retiredSeen = 0;

  for (const [index, files] of examples.entries()) {
    const tag = `#${index} ${Object.keys(files).join(" + ")}`;
    const before = differential.legacyReplay(legacy, files, ARM_KEY);
    const next = after(files);
    // A fact refusal surfaces TWICE — once as the provider's own `factError` and once as the consuming
    // policy's `declared fact failed:` pass error — so the codes are deduped; both halves are asserted, and
    // a shape the classifier does not recognise throws rather than being absorbed.
    const finalErrors = sorted([
      ...new Set([
        ...next.factErrors.map((error) => classifyToolError(error.factId, error.phase, error.message)),
        ...next.toolErrors.map((error) => classifyToolError(error.policyId, error.phase, error.message)),
      ]),
    ]);

    expect(before.toolErrors, `${tag} — the LEGACY engine refuses on no fixture it shipped`).toEqual([]);
    // POPULATION, both ways, per scenario: every fixture path is inside the four declared roots, so the
    // legacy Project and the final effective population are the same file set.
    const effective = new Set(next.policies.flatMap((policy) => policy.population.effectiveSourcePaths));
    expect(before.population, `${tag} — LEGACY population`).toBe(Object.keys(files).length);
    expect(sorted([...effective]), `${tag} — FINAL population equals it`).toEqual(sorted(Object.keys(files)));

    // A retired arm declares its own expectations; every other fixture's expectation is DERIVED by
    // translating the legacy keys, so no final identity is ever hand-transcribed.
    const retired = before.findings.flatMap((key) => {
      const row = RETIRED_ARMS.get(key);
      return row === undefined ? [] : [row];
    })[0];
    const expected: RetiredArm = retired ?? {
      legacyKeys: before.findings,
      finalIdentities: before.findings.map(translate),
      finalErrors: [],
      classification: "carried over 1:1",
    };
    retiredSeen += retired === undefined ? 0 : 1;

    expect(before.findings, `${tag} — LEGACY keys (${expected.classification})`).toEqual(sorted(expected.legacyKeys));
    expect(identities(next), `${tag} — FINAL reviewed identities (${expected.classification})`).toEqual(sorted(expected.finalIdentities));
    expect(finalErrors, `${tag} — FINAL refusals (${expected.classification})`).toEqual(sorted(expected.finalErrors));
    legacyTotal += before.findings.length;
    finalTotal += next.authority.effectiveFindings.length;
  }

  expect(retiredSeen, "both retired arms are exercised by the legacy corpus").toBe(RETIRED_ARMS.size);
  // LIVENESS: a bijection between two empty sets would satisfy every assertion above. These two numbers
  // are the planted positive control for the whole loop — the legacy corpus really does catch, and the
  // final policy catches the same population minus exactly the two retired arms.
  expect(legacyTotal, "the frozen legacy corpus catches 21 times across its 23 fixtures — the planted positive control for the whole loop").toBe(21);
  expect(finalTotal).toBe(legacyTotal - RETIRED_ARMS.size);
});

// ── §2.1 population port: both differences, and both controls ──────────────────────────────────────────

test("the population port admits the four declared roots, with an inside and an outside control", () => {
  const inside: Files = {
    [SETTINGS]: 'export const USER_SETTINGS_SECTIONS = ["ghostPort"] as const;\n',
    [CLIENT_WRITER]: "export const updateUserSettingsSection = 1;\n",
  };
  // OUTSIDE CONTROLS: `@kit` and `@tooling` are roots the legacy gate's Project LOADED (it declared no
  // `scanRoot`) and every belt's scope predicate then rejected. The final population never admits them, so
  // equality cannot pass because both sides admitted nothing.
  const outsideKit = "packages/kit/src/x.ts";
  const outsideTooling = "tooling/src/x.ts";
  const files: Files = { ...inside, [outsideKit]: "export const q = 1;\n", [outsideTooling]: "export const q = 2;\n" };
  const result = after(files);
  expect(result.toolErrors).toEqual([]);
  expect(result.factErrors).toEqual([]);
  const owner = result.policies.find((policy) => policy.id === gate.id);
  const admitted = owner?.population.effectiveSourcePaths ?? [];
  expect(sorted(admitted), "INSIDE: both declared-root files are judged").toEqual(sorted(Object.keys(inside)));
  expect(admitted, "OUTSIDE: @kit is not admitted").not.toContain(outsideKit);
  expect(admitted, "OUTSIDE: @tooling is not admitted").not.toContain(outsideTooling);

  // `legacy − final` = the two outside files, which the legacy engine loaded and judged nothing in;
  // `final − legacy` = EMPTY, because the legacy Project was the whole workspace.
  const legacyAdmits = new Set(Object.keys(files));
  expect(sorted([...legacyAdmits].filter((path) => !admitted.includes(path))), "legacy − final").toEqual(sorted([outsideKit, outsideTooling]));
  expect(
    admitted.filter((path) => !legacyAdmits.has(path)),
    "final − legacy",
  ).toEqual([]);
  // The narrowing changes no verdict on these bytes: the one in-scope knob still reds.
  expect(identities(result)).toEqual([`USER_SETTINGS_SECTIONS.ghostPort|${KNOB_WIRE_OPERATIONS.settingsSection}`]);
});

// ── §6.2 authority: the central grant door, and the two-sided liveness that replaced the tables ────────

const UNWIRED_SECTION: Files = {
  [SETTINGS]: 'export const USER_SETTINGS_SECTIONS = ["ghostPort"] as const;\n',
  [CLIENT_WRITER]: "export const updateUserSettingsSection = 1;\n",
};
const WIRED_SECTION: Files = {
  [SETTINGS]: 'export const USER_SETTINGS_SECTIONS = ["ghostPort"] as const;\n',
  [CLIENT_WRITER]: 'export const updateUserSettingsSection = 1;\nexport const w = { section: "ghostPort", patch: {} };\n',
};

function grantFor(subject: string, operation: string): ReviewedGateGrant {
  return { id: "knob-wire-coverage:probe", policyId: gate.id, subject, operation, why: "family control.", endsWhen: "the control is deleted." };
}

test("an exact central grant consumes the finding once and leaves zero effective and zero alarms", () => {
  const granted = grantFor("USER_SETTINGS_SECTIONS.ghostPort", KNOB_WIRE_OPERATIONS.settingsSection);
  const result = after(UNWIRED_SECTION, [granted]);
  expect(result.toolErrors).toEqual([]);
  expect(result.authority.grantedFindings).toHaveLength(1);
  expect(result.authority.effectiveFindings).toEqual([]);
  expect(result.authority.authorityAlarms).toEqual([]);
  expect(result.authority.reviewedGrantConsumption).toEqual([{ id: granted.id, count: 1 }]);
});

test("a grant naming the RIGHT subject on the WRONG arm operation licenses nothing and reds stale", () => {
  // The wrong-identity control: `ghostPort` is a section, so the leaf operation names no candidate. This
  // is the arm that makes the operation vocabulary load-bearing rather than decorative (#2189).
  const result = after(UNWIRED_SECTION, [grantFor("USER_SETTINGS_SECTIONS.ghostPort", KNOB_WIRE_OPERATIONS.settingsLeaf)]);
  expect(result.authority.grantedFindings).toEqual([]);
  expect(identities(result)).toEqual([`USER_SETTINGS_SECTIONS.ghostPort|${KNOB_WIRE_OPERATIONS.settingsSection}`]);
  expect(result.authority.authorityAlarms.map((alarm) => alarm.kind)).toEqual(["stale-reviewed-grant"]);
});

test("THE LEGACY STALE ARM'S SUCCESSOR: a member that GAINS its wire reds its surviving grant", () => {
  // The legacy ratchet reported `this member GAINED its wire but still carries a DOORWAY/DEFERRED entry`
  // from a hand-rolled arm inside the gate module. Centrally, the same tree produces no finding, so the
  // grant is consumed zero times after a COMPLETE owner run and the alarm is an error.
  const result = after(WIRED_SECTION, [grantFor("USER_SETTINGS_SECTIONS.ghostPort", KNOB_WIRE_OPERATIONS.settingsSection)]);
  expect(result.toolErrors).toEqual([]);
  expect(result.authority.effectiveFindings).toEqual([]);
  expect(result.authority.authorityAlarms).toEqual([
    expect.objectContaining({ kind: "stale-reviewed-grant", policyId: gate.id, subject: "USER_SETTINGS_SECTIONS.ghostPort" }),
  ]);
  expect(result.authority.verdict.errors).toBe(1);
});

test("THE LEGACY ORPHAN ARM'S SUCCESSOR: a grant naming a member that no longer exists reds the same way", () => {
  const vanished: Files = {
    [SETTINGS]: 'export const USER_SETTINGS_SECTIONS = ["ghostPort"] as const;\n',
    [CLIENT_WRITER]: "export const updateUserSettingsSection = 1;\n",
  };
  const result = after(vanished, [grantFor("USER_SETTINGS_SECTIONS.deletedSection", KNOB_WIRE_OPERATIONS.settingsSection)]);
  expect(result.authority.authorityAlarms.map((alarm) => alarm.kind)).toEqual(["stale-reviewed-grant"]);
  expect(identities(result)).toEqual([`USER_SETTINGS_SECTIONS.ghostPort|${KNOB_WIRE_OPERATIONS.settingsSection}`]);
});

// ── the six real central rows: shape, uniqueness, and vocabulary ───────────────────────────────────────

test("every committed knob-wire grant names a real arm operation and a uniquely identifiable member", () => {
  const rows = REVIEWED_GRANTS.filter((row) => row.policyId === gate.id);
  const operations = new Set<string>(Object.values(KNOB_WIRE_OPERATIONS));
  expect(rows.length, "the two retired ExemptionTables carried 1 DOORWAY + 5 DEFERRED rows").toBe(6);
  for (const row of rows) {
    expect(operations.has(row.operation), `${row.id} names a live arm operation`).toBe(true);
    // The subject grammar is `<member source>.<member>`; a row that cannot be produced by the policy would
    // red STALE on every real run, so the shape check is the cheap half of that guarantee.
    expect(row.subject, `${row.id} subject grammar`).toMatch(/^[A-Za-z_][\w]*\.[A-Za-z_][\w]*$/u);
    expect(row.endsWhen, `${row.id} states a concrete end condition`).not.toBe("");
  }
  // 1:1 identity is what makes the over-broad alarm unreachable for this policy: no two rows share one
  // (subject, operation), and the policy emits at most one finding per pair.
  expect(new Set(rows.map((row) => `${row.subject}|${row.operation}`)).size).toBe(rows.length);
  // The five DEFERRED successors carry the durable tracker #2283; the one DOORWAY row is a sanctioned
  // seam, not debt, and cites D107 audit Q2 instead.
  expect(rows.filter((row) => row.endsWhen.includes("#2283"))).toHaveLength(5);
  expect(rows.filter((row) => row.why.includes("THE ONE SANCTIONED DOORWAY"))).toHaveLength(1);
});
