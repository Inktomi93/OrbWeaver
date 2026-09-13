// THE §4.6 REPLAY FOR THE `registry-definitions` FAMILY (#2319, family 3) — the TWIN RECIPE that unblocks
// it, and the first module driven end to end on that recipe.
//
// ── WHY A TWIN IS NEEDED AT ALL, and it is not a convenience ──────────────────────────────────────────
// Every FINAL policy in this family declares a SEMANTIC population (`ModalDefinition`, `SectionDefinition`,
// `ChromeEntry`, `CHROME_ZONES`, `ContributorRegistry`, `HomeTileContribution`, `CONFIG_GROUP_IDS`,
// `MODAL_SLOT_IDS`). Its legacy descriptor declared none — it matched by AST SHAPE — so a legacy example's
// file map annotates `: ModalDefinition` and never DECLARES that type anywhere. On those bytes the member
// denominator resolves to zero, `receiptFailures` REFUSES the owner, and the final side never judges.
// **A naive table would read `legacy N → final 0` on every mustFlag row and could be mis-filed as N retired
// arms.** It is not. The withheld-by-population arm below keeps that receipt for the ORIGINAL bytes, which
// is why the twin exists and what the next reader needs to see first.
//
// ── THE TWIN RECIPE, and where its content comes from ─────────────────────────────────────────────────
// The final reader admits a definition only through a RESOLVED target (`lib/registry-fact.ts` `factsFor`),
// and `isExportedType` requires the registry type to be an EXPORTED interface/type alias whose name is the
// kind's `TYPE_NAMES` entry. Two measured consequences, both paid for:
//   · A GLOBAL (unexported, script-file) declaration does NOT work — `isExportedType` rejects it, the target
//     stays unresolved, and the population is still zero. Probed and refuted before this shape was chosen.
//   · So the target must be a MODULE and the subject must IMPORT it, which means the twin necessarily
//     PREPENDS to the subject. That shifts every line below, which is exactly why `runScenarios`' inertness
//     control compares the legacy verdict UNLINED.
// **The twin's content is not invented: it is read off the FINAL policy's own `mustFlag` fixture**, which is
// the authoritative statement of what its reader needs. For this module that is two prerequisites — the
// `ModalDefinition` target AND the canonical `SectionPlaceholder`, because `isCanonicalPlaceholder` resolves
// the JSX tag through `notePlaceholderImport`. Supplying only the target leaves the population resolved and
// the placeholder set EMPTY, so the policy runs and reports nothing — a silent zero that would have read as
// a lost catch. Measured, not assumed.
//
// ── WHAT THE TWIN IS NOT ALLOWED TO DO, and how that is proven ────────────────────────────────────────
// Two controls per row, both required and both asserted below rather than argued:
//   · INERTNESS — the legacy verdict on the twin equals its verdict on the original bytes, compared UNLINED
//     (the prepend shifts lines by construction). Without it a "twin" is simply a different example.
//   · TWIN-ALONE — the prerequisites WITHOUT the legacy subject produce no finding. Here that control is
//     STRONGER than "no findings": the twin alone cannot even resolve a population, so it REFUSES. A twin
//     that could report on its own would be manufacturing the catch it is supposed to be enabling.
//
// ── SELF-SCANNING IMMUNITY, receipted per row ─────────────────────────────────────────────────────────
// Every row carries its populations. The legacy side is `1` — the single planted subject file — on every
// row, and the final side is the subject plus the twin's prerequisites. The real corpus is never in scope,
// which is what makes this family safe to replay at all (`chrome-registry-completeness` and friends read
// `@client`, and an unfenced real-corpus drive would eat the whole client tree).
//
// ── SCOPE ─────────────────────────────────────────────────────────────────────────────────────────────
// TABLED: `modal-body-not-placeholder` (6 examples), `modal-registry-completeness` (13) and
// `placeholder-copy-registry` (8). UNDECLARED: the four remaining non-split members, each of which needs
// its own prerequisite read off its own final `mustFlag` fixture — inventing them from the pattern would be
// exactly the guesswork the `SectionPlaceholder` measurement above disproves, and the three tabled modules
// already need TWO different twin shapes between them. The withheld-by-population arm covers those four so
// none of them reads as a clean zero in the meantime. The two SPLIT members (`config-group-completeness`
// `58370d705`, `section-registry-completeness` `dd862e988`) are last by dispatch order and carry a
// per-example coverage statement when they land.
import { posix } from "node:path";
import type { GatePolicy } from "../../../../tooling/src/verify/contract/policy.ts";
import { gate as chromeRegistryCompleteness } from "../../../../tooling/src/verify/gates/chrome-registry-completeness.ts";
import { gate as homeTileRegistryCompleteness } from "../../../../tooling/src/verify/gates/home-tile-registry-completeness.ts";
import { gate as modalBodyNotPlaceholder } from "../../../../tooling/src/verify/gates/modal-body-not-placeholder.ts";
import { gate as modalRegistryCompleteness } from "../../../../tooling/src/verify/gates/modal-registry-completeness.ts";
import { gate as noParallelSectionMap } from "../../../../tooling/src/verify/gates/no-parallel-section-map.ts";
import { gate as placeholderCopyRegistry } from "../../../../tooling/src/verify/gates/placeholder-copy-registry.ts";
import { gate as sectionFactoryContributionBundle } from "../../../../tooling/src/verify/gates/section-factory-contribution-bundle.ts";
import type { DifferentialClaim, Files, Label, Replay } from "../../../support/legacy-differential.ts";
import {
  createDifferential,
  differentialViolations,
  frozenClosureOf,
  frozenLegacyGate,
  inMemorySide,
  label,
  legacyScenarios,
  repairedFiles,
  unlined,
} from "../../../support/legacy-differential.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";
import { scaledBudget } from "../../_load-budget.ts";

const FALLBACK = "packages/client/src/features/x/__no-example-files-map__.tsx";
const MODAL_BASE = "f5b222e10";
const MODAL_PATH = "tooling/src/verify/gates/modal-body-not-placeholder.ts";

/** The seven non-split members and the denominator each one's fixtures under-declare. Order is the
 *  orchestrator's: the three `f5b222e10` siblings and `577d03d63`'s trio first. */
const MEMBERS: readonly (readonly [string, string, GatePolicy, readonly string[]])[] = [
  ["modal-body-not-placeholder", MODAL_BASE, modalBodyNotPlaceholder, ["ModalDefinition"]],
  ["modal-registry-completeness", "f5b222e10", modalRegistryCompleteness, ["ModalDefinition"]],
  ["placeholder-copy-registry", "f5b222e10", placeholderCopyRegistry, ["SectionDefinition"]],
  ["chrome-registry-completeness", "577d03d63", chromeRegistryCompleteness, ["ChromeEntry"]],
  ["section-factory-contribution-bundle", "f16cde889", sectionFactoryContributionBundle, ["ContributorRegistry", "SectionDefinition factory"]],
  ["home-tile-registry-completeness", "614b2cb55", homeTileRegistryCompleteness, ["HomeTileContribution"]],
  ["no-parallel-section-map", "614b2cb55", noParallelSectionMap, ["CHROME_ZONES", "CONFIG_GROUP_IDS", "MODAL_SLOT_IDS"]],
];

/** TOTAL, and it KEEPS THE POPULATION NAMES: "it refused" is not the finding — WHICH denominator came back
 *  empty is what tells the next lane what its twin has to construct. */
function toolErrorCode(owner: string, phase: string, message: string): string {
  if (!message.includes("resolved zero members")) {
    throw new Error(`unclassified refusal from ${owner}/${phase}: ${message}`);
  }
  const names: readonly string[] = [...new Set([...message.matchAll(/population "([^"]+)"/gu)].map((match) => String(match[1])))];
  return `${owner}/${phase}: zero-member population(s): ${names.join(", ")}`;
}

const MODAL_TARGET = "__modal-target.ts";
const MODAL_PLACEHOLDER = "__section-placeholder.tsx";
/** Both prerequisites the final policy's own `mustFlag` fixture names, beside every subject directory so the
 *  import specifier is uniform and no path arithmetic can go wrong. */
function modalTwin(files: Files): { readonly add: Files; readonly prepend: Readonly<Record<string, string>> } {
  const add: Record<string, string> = {};
  const prepend: Record<string, string> = {};
  for (const path of Object.keys(files)) {
    const dir = path.slice(0, path.lastIndexOf("/"));
    add[`${dir}/${MODAL_TARGET}`] = "export interface ModalDefinition { readonly id: string }\n";
    add[`${dir}/${MODAL_PLACEHOLDER}`] = "export function SectionPlaceholder(): null {\n  return null;\n}\n";
    prepend[path] = `import type { ModalDefinition } from "./${MODAL_TARGET}";\nimport { SectionPlaceholder } from "./${MODAL_PLACEHOLDER}";\n`;
  }
  return { add, prepend };
}

const SUBJECT_THEME = "packages/client/src/features/settings/lib/theme-modal.tsx";
const SUBJECT_X = "packages/client/src/features/x/lib/x-modal.tsx";
const LEGACY_MSG = "a ModalDefinition is unreadable or dishonest: ";
const FINAL_MSG = "a ModalDefinition is unreadable or dishonest: ";

/** One row of the module's table: the legacy verdict on the ORIGINAL bytes, the final verdict on the TWIN,
 *  both populations, the classification and its successor. */
interface ModalRow {
  readonly why: string;
  readonly legacy: readonly string[];
  readonly legacyPopulation: number;
  readonly finalOnTwin: readonly string[];
  readonly twinPopulation: number;
  readonly claim: DifferentialClaim;
}

const MODAL_ROWS: readonly ModalRow[] = [
  {
    why: "mustFlag[0] a ModalDefinition function body rendering <SectionPlaceholder> — the founding catch",
    legacy: [`legacy | ${SUBJECT_THEME}:1 | "themeModal" | ${LEGACY_MSG}`],
    legacyPopulation: 1,
    finalOnTwin: [`modal-body-not-placeholder | ${SUBJECT_THEME}:3 | themeModal | ${FINAL_MSG}`],
    twinPopulation: 3,
    // THE CATCH IS CARRIED — same file, same subject, and the TOKEN moved from the quoted `"themeModal"` the
    // legacy descriptor synthesised to the bare identifier the final policy anchors on. The LINE delta (1 → 3)
    // is the twin's two-line prepend and is NOT a conversion anchor move; the token change is.
    claim: { classification: "anchor-move", successor: "themeModal" },
  },
  {
    why: "mustFlag[1] THE #944 CONTROL — the definition body lives in an IMPORTED object, invisible from the sanctioned file",
    legacy: [
      `legacy | ${SUBJECT_X}:2 | "xModal" — unreadable definition: the identifier \`def\` (not an object literal declared in this file — an imported or re-exported definition) | ${LEGACY_MSG}`,
    ],
    legacyPopulation: 1,
    finalOnTwin: [`modal-body-not-placeholder | ${SUBJECT_X}:4 | xModal | ${FINAL_MSG}`],
    twinPopulation: 4,
    // Carried, and the fail-closed arm still fires. The legacy descriptor packed its whole explanation into
    // the TOKEN; the final policy puts the identity in the token and the reason in the message.
    claim: { classification: "anchor-move", successor: "xModal" },
  },
  {
    why: "mustPass[0] the DECLARED-PLANNED arm (object literal, not a function) — silent on both engines",
    legacy: [],
    legacyPopulation: 1,
    finalOnTwin: [],
    twinPopulation: 3,
    claim: { classification: "vacuous-both-zero", successor: null },
  },
  {
    why: "mustPass[1] a function body rendering a REAL body (no <SectionPlaceholder>) — silent on both engines",
    legacy: [],
    legacyPopulation: 1,
    finalOnTwin: [],
    twinPopulation: 3,
    claim: { classification: "vacuous-both-zero", successor: null },
  },
  {
    why: "mustPass[2] SAME-FILE indirection — still co-located, so the object reader follows it; silent on both engines",
    legacy: [],
    legacyPopulation: 1,
    finalOnTwin: [],
    twinPopulation: 3,
    claim: { classification: "vacuous-both-zero", successor: null },
  },
  {
    why: "mustPass[3] a WHOLE-literal `satisfies` wrapper — silent on both engines",
    legacy: [],
    legacyPopulation: 1,
    finalOnTwin: [],
    twinPopulation: 3,
    claim: { classification: "vacuous-both-zero", successor: null },
  },
];

test("§4.6 — modal-body-not-placeholder: every legacy example replayed against its twin", { timeout: scaledBudget(300_000) }, async ({ scratch }) => {
  const differential = createDifferential("/registry-modal-body", toolErrorCode);
  const legacy = await frozenLegacyGate(scratch, MODAL_BASE, MODAL_PATH);
  const examples = legacyScenarios(legacy, FALLBACK);
  expect(examples.length, "EVERY legacy example is preserved as a row — a dropped one would be silent").toBe(MODAL_ROWS.length);

  for (const [index, row] of MODAL_ROWS.entries()) {
    const base = examples[index] as Files;
    const tag = `#${String(index)} ${row.why}`;
    const repair = modalTwin(base);
    const twin = repairedFiles(base, repair);

    // THE LEGACY SIDE, on the ORIGINAL bytes.
    const before = differential.legacyReplay(legacy, base, label);
    expect(before.findings, `${tag} — LEGACY findings on the original bytes`).toEqual(row.legacy);
    expect(before.population, `${tag} — LEGACY population (self-scanning immunity: the planted subject only)`).toBe(row.legacyPopulation);
    expect(before.toolErrors, `${tag} — the LEGACY side is never refused`).toEqual([]);

    // THE WITHHELD RECEIPT for those same original bytes — why the twin exists, kept per row.
    const withheld = differential.finalReplay([modalBodyNotPlaceholder], base, label);
    expect(withheld.toolErrors, `${tag} — on the ORIGINAL bytes the final policy is WITHHELD, so its zero is not a differential`).toEqual([
      "modal-body-not-placeholder/receipt: zero-member population(s): ModalDefinition",
    ]);

    // INERTNESS — unlined, because the twin's prepend shifts every line below it.
    expect(differential.legacyReplay(legacy, twin, unlined).findings, `${tag} — the twin is INERT on the legacy side`).toEqual(
      differential.legacyReplay(legacy, base, unlined).findings,
    );

    // TWIN-ALONE — the prerequisites without the legacy subject manufacture nothing. Stronger than "no
    // findings": with no subject there is no population, so the policy refuses.
    const alone = differential.finalReplay([modalBodyNotPlaceholder], repair.add, label);
    expect(alone.findings, `${tag} — the twin ALONE reports nothing`).toEqual([]);
    expect(alone.toolErrors.length, `${tag} — and it cannot even resolve a population without the subject`).toBeGreaterThan(0);

    // THE FINAL SIDE, on the twin.
    const after = differential.finalReplay([modalBodyNotPlaceholder], twin, label);
    expect(after.findings, `${tag} — FINAL findings on the twin`).toEqual(row.finalOnTwin);
    expect(after.population, `${tag} — FINAL population: the subject plus the twin's declared prerequisites`).toBe(row.twinPopulation);
    expect(after.toolErrors, `${tag} — the twin resolves the population, so the final side is NOT withheld`).toEqual([]);

    expect(
      differentialViolations(row.claim, inMemorySide(before), inMemorySide(after)),
      `${tag} — the "${row.claim.classification}" label and its successor`,
    ).toEqual([]);
  }
});

// ── SUB-CHUNK 2 — `modal-registry-completeness` and `placeholder-copy-registry`, TABLED ───────────────
//
// Both twins are the registry target ALONE, read off each module's own final `mustFlag[0]` fixture (spec
// step 3). NOT the same prerequisites as `modal-body-not-placeholder` above, which also needs the canonical
// `SectionPlaceholder`: same family, different reader, and the difference was MEASURED rather than
// pattern-matched. ONE SHARED TARGET per example with a computed specifier (spec step 4) — two declarations
// of one registry type make `targetFact` AMBIGUOUS, which is unresolved, which is a zero population again.
//
// TWO TWIN SHAPES, because the two legacy descriptors' fixtures differ and the shape follows the bytes:
//   · `modal-registry-completeness`'s fixtures annotate `: ModalDefinition` and IMPORT NOTHING, so the twin
//     PREPENDS the type import and every subject line shifts by one. Declared as a twin artefact per row.
//   · `placeholder-copy-registry`'s fixtures already carry `import type { SectionDefinition } from "#state";`
//     — a specifier with no target in the fixture map — so the twin REPOINTS that one import at the shared
//     target. No line moves at all, which is why those rows' lines are byte-identical on both engines.

/** The arms each final policy can report, as the vocabulary the table is written in. */
const FINAL_ARMS: readonly string[] = [
  "Not co-located:",
  "Definition outside its home:",
  "Unreadable definition:",
  "Unreadable id:",
  "Duplicate id ",
  "Duplicate singleton placement ",
  "Unreadable planned reason:",
  "Empty planned reason:",
  "Unreachable surface modal ",
  "A route declares a `modals=",
  "Unreadable copy:",
  "Empty copy:",
  "Duplicate copy:",
];

/** TOTAL, like `toolErrorCode`: a final finding whose ARM this table cannot name is a row no reader can
 *  check, and the legacy engine's whole verdict lives in the arm rather than in the count. */
function armOf(message: string): string {
  const arm = FINAL_ARMS.find((candidate) => message.includes(candidate));
  if (arm === undefined) {
    throw new Error(`unnamed final arm: ${message}`);
  }
  return arm.endsWith(":") ? arm.slice(0, -1) : arm.trim();
}

/** The legacy side keeps the shared `label` — its verdict is in the token/message it synthesised. The FINAL
 *  side names its ARM, because every finding here shares one long policy `message` and a 46-character slice
 *  of it is the same string on every row: a table written in that vocabulary could not tell "Not co-located"
 *  from "Unreachable surface modal", which is most of what these rows are claiming. */
const armLabel: Label = (seen) =>
  seen.policyId === undefined ? label(seen) : `${seen.policyId} | ${seen.file}:${seen.line} | ${seen.token ?? "-"} | ${armOf(seen.message)}`;

/** The import specifier from one subject to the ONE shared target (spec step 4). */
function targetSpecifier(subject: string, target: string): string {
  const relative = posix.relative(posix.dirname(subject), target);
  return relative.startsWith(".") ? relative : `./${relative}`;
}

/** The twin: one exported registry target, reached by every subject that names the type — by REPOINTING the
 *  fixture's unresolvable `#state` type import where there is one, and by PREPENDING where there is not. */
function sharedTargetTwin(files: Files, typeName: string, target: string): { readonly add: Files; readonly twin: Files } {
  const add: Files = { [target]: `export interface ${typeName} { readonly id: string }\n` };
  const twin: Record<string, string> = { ...files, ...add };
  for (const [path, text] of Object.entries(files)) {
    const legacyImport = `import type { ${typeName} } from "#state";`;
    const repointed = `import type { ${typeName} } from "${targetSpecifier(path, target)}";`;
    if (text.includes(legacyImport)) {
      twin[path] = text.replace(legacyImport, repointed);
    } else if (text.includes(`: ${typeName}`)) {
      twin[path] = `${repointed}\n${text}`;
    }
  }
  return { add, twin };
}

/** A row's verdict: a CHECKED classification, or an explicit refusal to classify that the test asserts BY
 *  NAME. The second arm exists because guessing a category is the exact failure this whole exercise is here
 *  to prevent, and an unlabelled "we did not decide" would read as a decision. */
type RowVerdict = { readonly kind: "classified"; readonly claim: DifferentialClaim } | { readonly kind: "unclassified"; readonly label: string };

interface ReplayRow {
  readonly why: string;
  readonly legacy: readonly string[];
  readonly legacyPopulation: number;
  readonly finalOnTwin: readonly string[];
  readonly twinPopulation: number;
  /** Non-empty only where the twin cannot admit a member without CHANGING the example. */
  readonly twinErrors?: readonly string[];
  readonly verdict: RowVerdict;
}

interface Table {
  readonly id: string;
  readonly base: string;
  readonly policy: GatePolicy;
  readonly typeName: string;
  readonly target: string;
  readonly rows: readonly ReplayRow[];
}

/** The verdict's own checks, as ONE list so the row asserts unconditionally: a CHECKED classification, or a
 *  refusal to classify that must NAME its reason (an unlabelled "we did not decide" reads as a decision). */
function verdictViolations(verdict: RowVerdict, before: Replay, after: Replay): readonly string[] {
  if (verdict.kind === "classified") {
    return differentialViolations(verdict.claim, inMemorySide(before), inMemorySide(after));
  }
  return /^UNCLASSIFIED-[A-Z-]+$/u.test(verdict.label) ? [] : [`an unclassified row must NAME its reason: ${verdict.label}`];
}

/** Every row's five assertions (spec step 5), plus the verdict. One driver so the two tables cannot drift
 *  apart in what they prove; returns the row count the caller declared, like `runScenarios`. */
async function driveTable(scratch: string, table: Table): Promise<number> {
  const differential = createDifferential(`/registry-${table.id}`, toolErrorCode);
  const legacy = await frozenLegacyGate(scratch, table.base, `tooling/src/verify/gates/${table.id}.ts`);
  const examples = legacyScenarios(legacy, FALLBACK);
  expect(examples.length, `${table.id} — EVERY legacy example is a row; a dropped one would be silent`).toBe(table.rows.length);

  for (const [index, row] of table.rows.entries()) {
    const base = examples[index] as Files;
    const tag = `${table.id} #${String(index)} ${row.why}`;
    const { add, twin } = sharedTargetTwin(base, table.typeName, table.target);

    const before = differential.legacyReplay(legacy, base, armLabel);
    expect(before.findings, `${tag} — LEGACY findings on the ORIGINAL bytes`).toEqual(row.legacy);
    expect(before.population, `${tag} — LEGACY population (self-scanning immunity: the planted files only)`).toBe(row.legacyPopulation);
    expect(before.toolErrors, `${tag} — the LEGACY side is never refused`).toEqual([]);

    expect(
      differential.finalReplay([table.policy], base, armLabel).toolErrors,
      `${tag} — on the ORIGINAL bytes the final policy is WITHHELD, so its zero is not a differential`,
    ).toEqual([`${table.policy.id}/receipt: zero-member population(s): ${table.typeName}`]);

    expect(differential.legacyReplay(legacy, twin, unlined).findings, `${tag} — the twin is INERT on the legacy side`).toEqual(
      differential.legacyReplay(legacy, base, unlined).findings,
    );

    const alone = differential.finalReplay([table.policy], add, armLabel);
    expect(alone.findings, `${tag} — the twin ALONE manufactures nothing`).toEqual([]);
    expect(alone.toolErrors.length, `${tag} — and it cannot even resolve a population without the subject`).toBeGreaterThan(0);

    const after = differential.finalReplay([table.policy], twin, armLabel);
    expect(after.findings, `${tag} — FINAL findings on the twin`).toEqual(row.finalOnTwin);
    expect(after.population, `${tag} — FINAL population: the subjects plus the shared target`).toBe(row.twinPopulation);
    expect(after.toolErrors, `${tag} — FINAL tool errors on the twin`).toEqual(row.twinErrors ?? []);

    expect(
      verdictViolations(row.verdict, before, after),
      `${tag} — the verdict: a checked classification with its successor, or a refusal to classify that NAMES its reason`,
    ).toEqual([]);
  }
  return table.rows.length;
}

const MODAL_REGISTRY = "packages/client/src/features";
const LEGACY_MODAL_MSG = "a modal is dishonest: a ModalDefinition not co";
const MODAL_REGISTRY_ROWS: readonly ReplayRow[] = [
  {
    why: "mustFlag[0] a ModalDefinition outside a `*-modal` file — the co-location arm",
    legacy: [`legacy | ${MODAL_REGISTRY}/x/lib/not-a-modal-file.ts:1 | not co-located: xModal | ${LEGACY_MODAL_MSG}`],
    legacyPopulation: 1,
    finalOnTwin: [`modal-registry-completeness | ${MODAL_REGISTRY}/x/lib/not-a-modal-file.ts:2 | xModal | Not co-located`],
    twinPopulation: 2,
    // Carried. The TOKEN moved from the legacy descriptor's packed synthetic string to the bare declared
    // name; the LINE delta is the twin's one-line prepend and is a twin artefact, not a conversion move.
    verdict: { kind: "classified", claim: { classification: "anchor-move", successor: "xModal" } },
  },
  {
    why: "mustFlag[1] a DECLARED-PLANNED modal with an empty reason — the planned-reason arm",
    legacy: [`legacy | ${MODAL_REGISTRY}/x/lib/x-modal.ts:1 | planned empty reason (xModal) | ${LEGACY_MODAL_MSG}`],
    legacyPopulation: 1,
    finalOnTwin: [`modal-registry-completeness | ${MODAL_REGISTRY}/x/lib/x-modal.ts:2 | xModal | Empty planned reason`],
    twinPopulation: 2,
    verdict: { kind: "classified", claim: { classification: "anchor-move", successor: "xModal" } },
  },
  {
    why: "mustFlag[2] two modals claiming the `mobile-tab` singleton placement",
    legacy: [
      `legacy | ${MODAL_REGISTRY}/b/lib/b-modal.ts:1 | duplicate singleton placement "mobile-tab" (bModal) — first claimed by "aModal" (${MODAL_REGISTRY}/a/lib/a-modal.ts) | ${LEGACY_MODAL_MSG}`,
    ],
    legacyPopulation: 2,
    finalOnTwin: [`modal-registry-completeness | ${MODAL_REGISTRY}/b/lib/b-modal.ts:2 | bModal | Duplicate singleton placement`],
    twinPopulation: 3,
    // The legacy token carried the prior claimant's name AND file; the final puts the identity in the token
    // and the claimant in the message. Same catch, same second-claimant subject.
    verdict: { kind: "classified", claim: { classification: "anchor-move", successor: "bModal" } },
  },
  {
    why: "mustFlag[3] two co-located definitions declaring the SAME id",
    legacy: [
      `legacy | ${MODAL_REGISTRY}/b/lib/b-modal.ts:1 | duplicate id "dup" (bModal) — first claimed by "aModal" (${MODAL_REGISTRY}/a/lib/a-modal.ts) | ${LEGACY_MODAL_MSG}`,
    ],
    legacyPopulation: 2,
    finalOnTwin: [`modal-registry-completeness | ${MODAL_REGISTRY}/b/lib/b-modal.ts:2 | bModal | Duplicate id`],
    twinPopulation: 3,
    verdict: { kind: "classified", claim: { classification: "anchor-move", successor: "bModal" } },
  },
  {
    why: "mustFlag[4] a `surface` modal with a real body and NO opener — the reachability arm (§E-7)",
    legacy: [`legacy | ${MODAL_REGISTRY}/x/lib/x-modal.tsx:1 | surface modal unreachable: "x" (xModal) | ${LEGACY_MODAL_MSG}`],
    legacyPopulation: 1,
    finalOnTwin: [`modal-registry-completeness | ${MODAL_REGISTRY}/x/lib/x-modal.tsx:2 | xModal | Unreachable surface modal`],
    twinPopulation: 2,
    verdict: { kind: "classified", claim: { classification: "anchor-move", successor: "xModal" } },
  },
  {
    why: "mustFlag[5] duplicate ids written `'dup' as never` — the wrapped-literal shape",
    legacy: [
      `legacy | ${MODAL_REGISTRY}/b/lib/b-modal.ts:1 | duplicate id "dup" (bModal) — first claimed by "aModal" (${MODAL_REGISTRY}/a/lib/a-modal.ts) | ${LEGACY_MODAL_MSG}`,
    ],
    legacyPopulation: 2,
    finalOnTwin: [`modal-registry-completeness | ${MODAL_REGISTRY}/b/lib/b-modal.ts:2 | bModal | Duplicate id`],
    twinPopulation: 3,
    verdict: { kind: "classified", claim: { classification: "anchor-move", successor: "bModal" } },
  },
  {
    why: "mustFlag[6] THE ANTI-GOD-MAP ARM — a `modals={{…}}` object literal in a route",
    legacy: [`legacy | packages/client/src/routes/some-route.tsx:1 | modals god-map prop | ${LEGACY_MODAL_MSG}`],
    legacyPopulation: 1,
    finalOnTwin: [],
    twinPopulation: 2,
    // THE RUN ROW FOR THE DECLARED LIMIT, and it is why this row is not a table cell. The example's only
    // subject is a ROUTE that declares NO modal, so the twin's target resolves and the MEMBER denominator is
    // still zero — `receiptFailures` withholds the owner before the god-map arm is ever consulted. Admitting
    // a member means ADDING a definition, at which point these are no longer the legacy example's bytes.
    twinErrors: ["modal-registry-completeness/receipt: zero-member population(s): ModalDefinition"],
    verdict: { kind: "unclassified", label: "UNCLASSIFIED-POPULATION-UNADMITTABLE" },
  },
  {
    why: "mustFlag[7] THE #944 CONTROL — an IMPORTED initializer at a sanctioned `*-modal.tsx` path",
    legacy: [
      `legacy | ${MODAL_REGISTRY}/x/lib/x-modal.tsx:2 | unreadable definition: xModal — the identifier \`xDef\` (not an object literal declared in this file — an imported or re-exported definition) | ${LEGACY_MODAL_MSG}`,
    ],
    legacyPopulation: 2,
    finalOnTwin: [`modal-registry-completeness | ${MODAL_REGISTRY}/x/lib/x-modal.tsx:3 | xModal | Definition outside its home`],
    twinPopulation: 3,
    // NOT an anchor move: the ARM changed. The legacy reader could only refuse ("an imported definition, so
    // every arm below has nothing to judge"); the final reader RESOLVES the imported initializer, finds its
    // real declaration home, and judges it there. Same subject, same verdict, a reason the legacy could not
    // reach — the definition of a stronger reader.
    verdict: { kind: "classified", claim: { classification: "stronger-reader", successor: "Definition outside its home" } },
  },
  {
    why: "mustPass[0] a FULL co-located modal (function body, repeatable placement)",
    legacy: [],
    legacyPopulation: 1,
    finalOnTwin: [],
    twinPopulation: 2,
    verdict: { kind: "classified", claim: { classification: "vacuous-both-zero", successor: null } },
  },
  {
    why: "mustPass[1] a DECLARED-PLANNED surface modal — exempt from the opener requirement",
    legacy: [],
    legacyPopulation: 1,
    finalOnTwin: [],
    twinPopulation: 2,
    verdict: { kind: "classified", claim: { classification: "vacuous-both-zero", successor: null } },
  },
  {
    why: "mustPass[2] a `surface` modal WITH an `openModal('x')` opener — the opener-grammar row",
    legacy: [],
    legacyPopulation: 2,
    finalOnTwin: [`modal-registry-completeness | ${MODAL_REGISTRY}/x/lib/x-modal.tsx:2 | xModal | Unreachable surface modal`],
    twinPopulation: 3,
    // THE MECHANISM, so a later reader cannot read `legacy 0 → final 1` as either a lost catch or a false
    // positive. The final FAILS CLOSED on an opener whose ORIGIN does not resolve: the fixture's opener is
    // `import { openModal } from '#state'`, and `#state` has no target in the fixture map and is not a real
    // specifier on this tree (every live opener imports `state/shell-store.ts` or the `state/index.ts`
    // barrel). Legacy `collectOpenModalCallSites` (f5b222e10:117-129) TEXT-matched the callee identifier and
    // resolved nothing; final `openedSlotId` (:96-110) requires `resolveCallableOrigin` to land on a module
    // whose canonical export is `openModal`. That narrowing is the DESIGN, pinned by the final module's own
    // `mustFlag[8]` (a LOCAL function named `openModal` must NOT satisfy the arm) and `mustPass[2]` (an
    // aliased import through a barrel MUST) — and the constructed row below reproduces the second pin on
    // THESE bytes: give the same example a resolvable canonical opener and the final reports nothing.
    // MEASURED, not argued: dropping the twin's prepend from `opener.tsx` ALONE leaves this finding exactly
    // where it is, so it is not a twin artefact. Real-tree `--check` is 0 effective over 11 members.
    verdict: { kind: "classified", claim: { classification: "stronger-reader", successor: "Unreachable surface modal" } },
  },
  {
    why: "mustPass[3] SAME-FILE indirection — resolved and judged by both engines",
    legacy: [],
    legacyPopulation: 1,
    finalOnTwin: [],
    twinPopulation: 2,
    verdict: { kind: "classified", claim: { classification: "vacuous-both-zero", successor: null } },
  },
  {
    why: "mustPass[4] a WHOLE-literal `satisfies` wrapper",
    legacy: [],
    legacyPopulation: 1,
    finalOnTwin: [],
    twinPopulation: 2,
    verdict: { kind: "classified", claim: { classification: "vacuous-both-zero", successor: null } },
  },
];

const SECTION_A = "packages/client/src/features/a/lib/a-section.ts";
const SECTION_B = "packages/client/src/features/b/lib/b-section.ts";
const PLACEHOLDER_ROWS: readonly ReplayRow[] = [
  {
    why: "mustFlag[0] two sections with the SAME (title, description) — the identical-sparkle duplicate",
    legacy: [`legacy | ${SECTION_B}:2 | - | section "bSection" has the SAME (title, descri`],
    legacyPopulation: 2,
    finalOnTwin: [`placeholder-copy-registry | ${SECTION_B}:2 | bSection | Duplicate copy`],
    twinPopulation: 3,
    // Carried, and the LINE DOES NOT MOVE — this twin repoints an existing import rather than prepending
    // one. The token appears where the legacy descriptor reported none (it anchored on the declaration and
    // put everything in the message).
    verdict: { kind: "classified", claim: { classification: "anchor-move", successor: "bSection" } },
  },
  {
    why: "mustFlag[1] an empty placeholder title — the non-empty arm",
    legacy: [`legacy | ${SECTION_A}:2 | - | section "aSection" has an empty placeholder ti`],
    legacyPopulation: 1,
    finalOnTwin: [`placeholder-copy-registry | ${SECTION_A}:2 | aSection | Empty copy`],
    twinPopulation: 2,
    verdict: { kind: "classified", claim: { classification: "anchor-move", successor: "aSection" } },
  },
  {
    why: 'mustFlag[2] an empty title written `"" as string` — the wrapped-literal shape',
    legacy: [`legacy | ${SECTION_A}:2 | - | section "aSection" has an empty placeholder ti`],
    legacyPopulation: 1,
    finalOnTwin: [`placeholder-copy-registry | ${SECTION_A}:2 | aSection | Empty copy`],
    twinPopulation: 2,
    verdict: { kind: "classified", claim: { classification: "anchor-move", successor: "aSection" } },
  },
  {
    why: "mustFlag[3] THE #944 CONTROL — the definition moved behind an IMPORT",
    legacy: [`legacy | ${SECTION_A}:3 | - | section "aSection" has an UNREADABLE definitio`],
    legacyPopulation: 2,
    finalOnTwin: [],
    twinPopulation: 3,
    // THE CATCH IS RETIRED ON THIS EXAMPLE AND THAT IS CORRECT, WHICH IS NOT THE SAME AS A LOST CATCH — and
    // the difference is two committed controls below, not an argument. The legacy finding was a REFUSAL OF
    // IGNORANCE: its reader could not follow a cross-module const, so it fail-closed on the definition's
    // unreadability. The final reader RESOLVES that const and compares the copy it finds — control (D)
    // proves the resolved pair enters the distinctness comparison rather than being silently skipped — and
    // it STILL fails closed on a definition that is genuinely unreadable (control (E)).
    verdict: {
      kind: "classified",
      claim: {
        classification: "retired-arm",
        successor: null,
        retiredWhy:
          "the legacy catch was its reader REFUSING a cross-module const it could not follow; the final resolves and judges that definition (control D: a second section duplicating the resolved copy is caught) and still fails closed on a genuinely unreadable one (control E). Nothing carries the refusal because there is nothing left to refuse.",
      },
    },
  },
  {
    why: "mustFlag[4] THE FACTORY CONTROL — a `make<X>Section()` factory duplicating a const section's copy",
    legacy: [`legacy | ${SECTION_B}:2 | - | section "bSection" has the SAME (title, descri`],
    legacyPopulation: 2,
    finalOnTwin: [`placeholder-copy-registry | ${SECTION_B}:2 | bSection | Duplicate copy`],
    twinPopulation: 3,
    verdict: { kind: "classified", claim: { classification: "anchor-move", successor: "bSection" } },
  },
  {
    why: "mustPass[0] each section's pair distinct and non-empty — the sanctioned honest copy",
    legacy: [],
    legacyPopulation: 2,
    finalOnTwin: [],
    twinPopulation: 3,
    verdict: { kind: "classified", claim: { classification: "vacuous-both-zero", successor: null } },
  },
  {
    why: "mustPass[1] the factory arm's FALSE branch — a factory section with its own distinct copy",
    legacy: [],
    legacyPopulation: 2,
    finalOnTwin: [],
    twinPopulation: 3,
    verdict: { kind: "classified", claim: { classification: "vacuous-both-zero", successor: null } },
  },
  {
    why: "mustPass[2] SAME-FILE indirection — resolved and judged by both engines",
    legacy: [],
    legacyPopulation: 1,
    finalOnTwin: [],
    twinPopulation: 2,
    verdict: { kind: "classified", claim: { classification: "vacuous-both-zero", successor: null } },
  },
];

test("§4.6 — modal-registry-completeness: all 13 legacy examples against the target-alone twin", { timeout: scaledBudget(300_000) }, async ({ scratch }) => {
  const driven = await driveTable(scratch, {
    id: "modal-registry-completeness",
    base: "f5b222e10",
    policy: modalRegistryCompleteness,
    typeName: "ModalDefinition",
    target: "packages/client/src/state/__replay-modal-target.ts",
    rows: MODAL_REGISTRY_ROWS,
  });
  expect(driven, "every legacy example is a declared row").toBe(MODAL_REGISTRY_ROWS.length);
});

test("§4.6 — the two modal-registry rows a replay CANNOT settle, settled by construction", { timeout: scaledBudget(300_000) }, async ({ scratch }) => {
  const differential = createDifferential("/registry-modal-constructed", toolErrorCode);
  const legacy = await frozenLegacyGate(scratch, "f5b222e10", "tooling/src/verify/gates/modal-registry-completeness.ts");
  const examples = legacyScenarios(legacy, FALLBACK);
  const target = "packages/client/src/state/__replay-modal-target.ts";

  // (1) THE GOD-MAP SUCCESSOR, constructed from the arm's own trigger conditions rather than replayed —
  // because the replay row above CANNOT admit a member without ceasing to be the legacy example. The arm
  // needs a route with a `modals={{…}}` prop AND a resolvable population; the legacy bytes supply the first.
  const godMap = sharedTargetTwin(examples[6] as Files, "ModalDefinition", target);
  const withOneDefinition = repairedFiles(godMap.twin, {
    add: {
      "packages/client/src/features/a/lib/a-modal.tsx":
        'import type { ModalDefinition } from "../../../state/__replay-modal-target.ts";\nexport const aModal: ModalDefinition = { id: "a", trigger: { placement: "rail.end" }, body: () => null };\n',
    },
  });
  const godMapRun = differential.finalReplay([modalRegistryCompleteness], withOneDefinition, armLabel);
  expect(godMapRun.findings, "the anti-god-map arm IS carried — the legacy route bytes, unchanged, plus one live definition").toEqual([
    "modal-registry-completeness | packages/client/src/routes/some-route.tsx:1 | modals | A route declares a `modals=",
  ]);
  expect(godMapRun.toolErrors, "and with a member admitted the owner is no longer withheld").toEqual([]);

  // (2) THE OPENER COVERAGE STATEMENT for `mustPass[2]`. Same bytes, same twin, one change: the opener's
  // unresolvable `'#state'` specifier now names a module that really exports the canonical `openModal`.
  const opener = sharedTargetTwin(examples[legacy.mustFlag.length + 2] as Files, "ModalDefinition", target);
  const resolvableOpener = repairedFiles(opener.twin, {
    add: { "packages/client/src/state/shell-store.ts": "export function openModal(id: string): void { void id; }\n" },
    replace: { "packages/client/src/features/x/components/opener.tsx": [["'#state'", '"../../../state/shell-store.ts"']] },
  });
  expect(
    differential.finalReplay([modalRegistryCompleteness], resolvableOpener, armLabel).findings,
    "the reachability arm accuses an UNRESOLVABLE opener origin, never a real one — so the row above is a stronger reader, not a false positive",
  ).toEqual([]);
});

test("§4.6 — placeholder-copy-registry: all 8 legacy examples against the target-alone twin", { timeout: scaledBudget(300_000) }, async ({ scratch }) => {
  const driven = await driveTable(scratch, {
    id: "placeholder-copy-registry",
    base: "f5b222e10",
    policy: placeholderCopyRegistry,
    typeName: "SectionDefinition",
    target: "packages/client/src/state/__replay-section-target.ts",
    rows: PLACEHOLDER_ROWS,
  });
  expect(driven, "every legacy example is a declared row").toBe(PLACEHOLDER_ROWS.length);
});

test("§4.6 — the #944 placeholder row is a DISSOLVED refusal, not a lost catch (both controls)", { timeout: scaledBudget(300_000) }, async ({ scratch }) => {
  const differential = createDifferential("/registry-placeholder-controls", toolErrorCode);
  const legacy = await frozenLegacyGate(scratch, "f5b222e10", "tooling/src/verify/gates/placeholder-copy-registry.ts");
  const unreadable = sharedTargetTwin(
    legacyScenarios(legacy, FALLBACK)[3] as Files,
    "SectionDefinition",
    "packages/client/src/state/__replay-section-target.ts",
  );

  // (D) THE COMPARISON CONTROL — the one that decides the classification. If the final merely SKIPPED the
  // imported definition, a second section carrying the same copy could not collide with it.
  const duplicateOfTheResolvedCopy = repairedFiles(unreadable.twin, {
    add: {
      [SECTION_B]:
        'import type { SectionDefinition } from "../../../state/__replay-section-target.ts";\nexport const bSection: SectionDefinition = { id: "b", placeholder: { title: "T", description: "D" }, content: { planned: "x" }, context: { kind: "none" } };\n',
    },
  });
  expect(
    differential.finalReplay([placeholderCopyRegistry], duplicateOfTheResolvedCopy, armLabel).findings,
    "the cross-module definition's copy IS in the distinctness comparison — it collides with a duplicate",
  ).toEqual([`placeholder-copy-registry | ${SECTION_B}:2 | bSection | Duplicate copy`]);

  // (E) THE FAIL-CLOSED CONTROL — the unreadable arm did not leave the policy; its TRIGGER moved from "the
  // definition is imported" to "the definition cannot be resolved at all".
  const genuinelyUnreadable = repairedFiles(unreadable.twin, {
    replace: {
      "packages/client/src/features/a/lib/a-definition.ts": [
        [
          'export const aDef = { id: "a", placeholder: { title: "T", description: "D" }, content: { planned: "x" }, context: { kind: "none" } };',
          "export const aDef = buildDef();\ndeclare function buildDef(): { readonly id: string };",
        ],
      ],
    },
  });
  expect(
    differential.finalReplay([placeholderCopyRegistry], genuinelyUnreadable, armLabel).findings,
    "a definition the reader genuinely cannot resolve STILL fails closed",
  ).toEqual([`placeholder-copy-registry | ${SECTION_A}:3 | aSection | Unreadable definition`]);
});

// ── THE REMAINING FOUR, kept as the withheld receipt so none of them reads as a clean zero ────────────

test("§4.6 — the other four non-split members are WITHHELD on their descriptor-era examples, by named population", { timeout: scaledBudget(300_000) }, async ({
  scratch,
}) => {
  const witnessed: string[] = [];
  for (const [id, base, policy, populations] of MEMBERS.slice(3)) {
    const differential = createDifferential(`/registry-${id}`, toolErrorCode);
    const legacy = await frozenLegacyGate(scratch, base, `tooling/src/verify/gates/${id}.ts`);
    const files = legacyScenarios(legacy, FALLBACK)[0];
    if (files === undefined) {
      throw new Error(`${id} has no legacy example`);
    }
    expect(differential.legacyReplay(legacy, files, label).toolErrors, `${id} — the LEGACY side runs`).toEqual([]);
    expect(differential.finalReplay([policy], files, label).toolErrors, `${id} — the FINAL side is withheld, and by WHICH denominator`).toEqual([
      `${policy.id}/receipt: zero-member population(s): ${populations.join(", ")}`,
    ]);
    witnessed.push(id);
  }
  expect(witnessed, "all four, so the blocker is the FAMILY's shape and not one awkward module").toEqual(MEMBERS.slice(3).map(([id]) => id));
});

// ── THE FROZEN-CLOSURE CONTROLS, both directions ──────────────────────────────────────────────────────

test("the frozen closure extracts an era-matched dep that NO LONGER EXISTS on today's tree", ({ scratch }) => {
  // A REAL permanent instance rather than a fixture: `placeholder-copy-registry` at `f5b222e10` imports
  // `../lib/section-defs.ts`, which is gone today. Before the closure this module died at import.
  const closure = frozenClosureOf(scratch, "f5b222e10", "tooling/src/verify/gates/placeholder-copy-registry.ts");
  expect(closure.extracted, "the entry module is extracted first").toContain("tooling/src/verify/gates/placeholder-copy-registry.ts");
  expect(closure.extracted, "the era-matched dep is pulled from the frozen SHA").toContain("tooling/src/verify/lib/section-defs.ts");
  expect(closure.depth, "the closure is deeper than the entry module alone").toBeGreaterThan(0);
});

test("the frozen closure REFUSES LOUDLY when a dep is absent at the frozen SHA too", ({ scratch }) => {
  expect(() => {
    frozenClosureOf(scratch, "f5b222e10", "tooling/src/verify/gates/no-such-gate-ever.ts");
  }).toThrow("does not exist at that SHA either");
});
