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
// All seven non-split members now carry per-example replay receipts. Split siblings
// require per-example coverage statements and constructed controls for arms their legacy corpus never ran.
import { posix } from "node:path";
import type { GatePolicy } from "../../../../tooling/src/verify/contract/policy.ts";
import { gate as chromeRegistryCompleteness } from "../../../../tooling/src/verify/gates/chrome-registry-completeness.ts";
import { gate as homeTileRegistryCompleteness } from "../../../../tooling/src/verify/gates/home-tile-registry-completeness.ts";
import { gate as modalBodyNotPlaceholder } from "../../../../tooling/src/verify/gates/modal-body-not-placeholder.ts";
import { gate as modalRegistryCompleteness } from "../../../../tooling/src/verify/gates/modal-registry-completeness.ts";
import { gate as noParallelSectionMap } from "../../../../tooling/src/verify/gates/no-parallel-section-map.ts";
import { gate as placeholderCopyRegistry } from "../../../../tooling/src/verify/gates/placeholder-copy-registry.ts";
import { gate as registryAssemblyAtDoorOnly } from "../../../../tooling/src/verify/gates/registry-assembly-at-door-only.ts";
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
    finalOnTwin: [`modal-body-not-placeholder | ${SUBJECT_THEME}:3 | themeModal | Placeholder body`],
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
    finalOnTwin: [`modal-body-not-placeholder | ${SUBJECT_X}:4 | xModal | Placeholder body`],
    twinPopulation: 4,
    // Legacy could not read the imported definition. Final resolves it and reaches the actual placeholder
    // body: a stronger reader, not the same fail-closed arm. The token change is a secondary anchor delta;
    // the two-line import prepend is solely a twin artifact.
    claim: { classification: "stronger-reader", successor: "Placeholder body" },
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
    const after = differential.finalReplay([modalBodyNotPlaceholder], twin, armLabel);
    expect(after.findings, `${tag} — FINAL findings on the twin`).toEqual(row.finalOnTwin);
    expect(after.population, `${tag} — FINAL population: the subject plus the twin's declared prerequisites`).toBe(row.twinPopulation);
    expect(after.toolErrors, `${tag} — the twin resolves the population, so the final side is NOT withheld`).toEqual([]);

    expect(
      differentialViolations(row.claim, inMemorySide(before), inMemorySide(after)),
      `${tag} — the "${row.claim.classification}" label and its successor`,
    ).toEqual([]);
  }
});

test("§4.6 — imported modal body distinguishes a resolved placeholder from an unreadable definition at the same position", {
  timeout: scaledBudget(300_000),
}, async ({ scratch }) => {
  const differential = createDifferential("/registry-modal-body-arm", toolErrorCode);
  const legacy = await frozenLegacyGate(scratch, MODAL_BASE, MODAL_PATH);
  const base = legacyScenarios(legacy, FALLBACK)[1] as Files;
  const twin = repairedFiles(base, modalTwin(base));
  const wrongArm: Files = {
    ...twin,
    [SUBJECT_X]: `${(twin[SUBJECT_X] as string).replace("= def;", "= buildModal();")}declare function buildModal(): ModalDefinition;\n`,
  };
  const before = differential.legacyReplay(legacy, base, label);
  const resolved = differential.finalReplay([modalBodyNotPlaceholder], twin, armLabel);
  const unreadable = differential.finalReplay([modalBodyNotPlaceholder], wrongArm, armLabel);
  expect(resolved.toolErrors).toEqual([]);
  expect(unreadable.toolErrors).toEqual([]);
  expect(resolved.findings).toEqual([`modal-body-not-placeholder | ${SUBJECT_X}:4 | xModal | Placeholder body`]);
  expect(unreadable.findings).toEqual([`modal-body-not-placeholder | ${SUBJECT_X}:4 | xModal | Unreadable definition`]);
  // The old 46-character label makes these different verdicts indistinguishable, even at identical count,
  // file, line and token. The exact arm and checked successor must reject this otherwise invisible cut.
  expect(differential.finalReplay([modalBodyNotPlaceholder], twin, label).findings).toEqual(
    differential.finalReplay([modalBodyNotPlaceholder], wrongArm, label).findings,
  );
  const claim: DifferentialClaim = { classification: "stronger-reader", successor: "Placeholder body" };
  expect(differentialViolations(claim, inMemorySide(before), inMemorySide(resolved))).toEqual([]);
  expect(differentialViolations(claim, inMemorySide(before), inMemorySide(unreadable))).toEqual([
    'the declared SUCCESSOR "Placeholder body" appears in no final finding or tool error',
  ]);
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
  "Placeholder body:",
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
  "Unknown zone ",
  "Unreadable zone:",
  "Missing mobile fate:",
  "declares an empty `reason`",
  "declares no `teaser`",
  "declares an `action`",
  ...["SectionId", "ModalSlotId", "ConfigGroupId"].flatMap((vocabulary) => [
    `A per-id object literal re-declares ≥2 ${vocabulary}s outside the sanctioned homes.`,
    `An array of \`{ id: … }\` elements covers ≥2 ${vocabulary}s outside the sanctioned homes.`,
    `A bare array of id strings covers ≥2 ${vocabulary}s outside the sanctioned homes.`,
    `A \`Record<${vocabulary}, …>\` annotation declares a per-id map outside the sanctioned homes.`,
  ]),
  "A hand-maintained chrome list re-declares ≥2 CHROME_ZONES-zoned entries outside the door.",
  "ContributorRegistry parameters",
  "callable render-prop parameters",
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
  readonly originalErrors?: readonly string[];
  readonly completeOpener?: boolean;
  readonly verdict: RowVerdict;
}

interface Table {
  readonly id: string;
  readonly base: string;
  readonly policy: GatePolicy;
  readonly typeName: string;
  readonly target: string;
  readonly rows: readonly ReplayRow[];
  readonly prepare?: (files: Files) => { readonly add: Files; readonly twin: Files };
  readonly aloneCompletes?: boolean;
}

/** The verdict's own checks, as ONE list so the row asserts unconditionally: a CHECKED classification, or a
 *  refusal to classify that must NAME its reason (an unlabelled "we did not decide" reads as a decision). */
function verdictViolations(verdict: RowVerdict, before: Replay, after: Replay): readonly string[] {
  if (verdict.kind === "classified") {
    return differentialViolations(verdict.claim, inMemorySide(before), inMemorySide(after));
  }
  return verdict.label === "UNCLASSIFIED-POPULATION-UNADMITTABLE" ? [] : [`unrecognised unclassified reason: ${verdict.label}`];
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
    const repair = table.prepare?.(base) ?? sharedTargetTwin(base, table.typeName, table.target);
    const add = row.completeOpener === true ? { ...repair.add, ...OPENER_PREREQUISITE } : repair.add;
    const twin = row.completeOpener === true ? resolvedOpenerTwin(repair.twin) : repair.twin;

    const before = differential.legacyReplay(legacy, base, armLabel);
    expect(before.findings, `${tag} — LEGACY findings on the ORIGINAL bytes`).toEqual(row.legacy);
    expect(before.population, `${tag} — LEGACY population (self-scanning immunity: the planted files only)`).toBe(row.legacyPopulation);
    expect(before.toolErrors, `${tag} — the LEGACY side is never refused`).toEqual([]);

    expect(
      differential.finalReplay([table.policy], base, armLabel).toolErrors,
      `${tag} — on the ORIGINAL bytes the final policy is WITHHELD, so its zero is not a differential`,
    ).toEqual(row.originalErrors ?? [`${table.policy.id}/receipt: zero-member population(s): ${table.typeName}`]);

    expect(differential.legacyReplay(legacy, twin, unlined).findings, `${tag} — the twin is INERT on the legacy side`).toEqual(
      differential.legacyReplay(legacy, base, unlined).findings,
    );

    const alone = differential.finalReplay([table.policy], add, armLabel);
    expect(alone.findings, `${tag} — the twin ALONE manufactures nothing`).toEqual([]);
    expect(alone.toolErrors.length === 0, `${tag} — prerequisites alone have the declared admission state`).toBe(table.aloneCompletes ?? false);

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

const OPENER_PREREQUISITE: Files = {
  "packages/client/src/state/shell-store.ts": "export function openModal(id: string): void { void id; }\n",
};

function resolvedOpenerTwin(files: Files): Files {
  return repairedFiles(files, {
    add: OPENER_PREREQUISITE,
    replace: { "packages/client/src/features/x/components/opener.tsx": [["'#state'", '"../../../state/shell-store.ts"']] },
  });
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
    finalOnTwin: [],
    twinPopulation: 4,
    completeOpener: true,
    // The intended opener needs a resolvable origin; the incomplete twin is a prerequisite control below.
    verdict: { kind: "classified", claim: { classification: "vacuous-both-zero", successor: null } },
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
  const incomplete = differential.finalReplay([modalRegistryCompleteness], opener.twin, armLabel);
  expect(incomplete.toolErrors).toEqual([]);
  expect(incomplete.findings, "an unresolved opener cannot establish reachability").toEqual([
    `modal-registry-completeness | ${MODAL_REGISTRY}/x/lib/x-modal.tsx:2 | xModal | Unreachable surface modal`,
  ]);
  const completed = differential.finalReplay([modalRegistryCompleteness], resolvedOpenerTwin(opener.twin), armLabel);
  expect(completed.findings, "the completed canonical opener keeps the legacy pass").toEqual([]);
  expect(completed.toolErrors, "clean means judged, never withheld").toEqual([]);
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

const CHROME_TARGET = "packages/client/src/state/__replay-chrome-target.ts";
const CHROME_HOME = "packages/client/src/state/chrome-registry.ts";
const SECTION_HOME = "packages/client/src/state/section-registry.ts";
const CHROME_PREFIX = "a chrome widget is dishonest: a ChromeEntry no";
const FEATURE_ROOT = "packages/client/src/features";

function chromeTwin(files: Files): { readonly add: Files; readonly twin: Files } {
  const repair = sharedTargetTwin(files, "ChromeEntry", CHROME_TARGET);
  // These are already authored prerequisites, including the intentionally renamed tuple in its refusal row.
  const add = { ...repair.add, [CHROME_HOME]: files[CHROME_HOME] as string, [SECTION_HOME]: files[SECTION_HOME] as string };
  return { add, twin: repair.twin };
}

const CHROME_ROWS: readonly ReplayRow[] = [
  {
    why: "mustFlag[0] co-location; one prepended import shifts the line, the synthetic token becomes the declared name",
    legacy: [`legacy | ${FEATURE_ROOT}/x/lib/not-a-chrome-file.ts:1 | not co-located: xChrome | ${CHROME_PREFIX}`],
    legacyPopulation: 3,
    finalOnTwin: [`chrome-registry-completeness | ${FEATURE_ROOT}/x/lib/not-a-chrome-file.ts:2 | xChrome | Not co-located`],
    twinPopulation: 4,
    verdict: { kind: "classified", claim: { classification: "anchor-move", successor: "Not co-located" } },
  },
  {
    why: "mustFlag[1] duplicate id; prepend artifact + declared-name anchor",
    legacy: [
      `legacy | ${FEATURE_ROOT}/b/lib/b-chrome.tsx:1 | duplicate id "dup" (bChrome) — first claimed by "aChrome" (${FEATURE_ROOT}/a/lib/a-chrome.tsx) | ${CHROME_PREFIX}`,
    ],
    legacyPopulation: 4,
    finalOnTwin: [`chrome-registry-completeness | ${FEATURE_ROOT}/b/lib/b-chrome.tsx:2 | bChrome | Duplicate id`],
    twinPopulation: 5,
    verdict: { kind: "classified", claim: { classification: "anchor-move", successor: "Duplicate id" } },
  },
  ...["mustFlag[2] unknown zone", "mustFlag[3] wrapped unknown zone"].map(
    (why): ReplayRow => ({
      why: `${why}; prepend artifact + declared-name anchor`,
      legacy: [`legacy | ${FEATURE_ROOT}/x/lib/x-chrome.tsx:1 | zone "sidebar.top" (xChrome) | ${CHROME_PREFIX}`],
      legacyPopulation: 3,
      finalOnTwin: [`chrome-registry-completeness | ${FEATURE_ROOT}/x/lib/x-chrome.tsx:2 | xChrome | Unknown zone`],
      twinPopulation: 4,
      verdict: { kind: "classified", claim: { classification: "anchor-move", successor: "Unknown zone" } },
    }),
  ),
  {
    why: "mustFlag[4] rail mobile fate; prepend artifact + declared-name anchor",
    legacy: [`legacy | ${FEATURE_ROOT}/x/lib/rail-chrome.tsx:1 | missing mobile (railChrome, zone "rail.nav") | ${CHROME_PREFIX}`],
    legacyPopulation: 3,
    finalOnTwin: [`chrome-registry-completeness | ${FEATURE_ROOT}/x/lib/rail-chrome.tsx:2 | railChrome | Missing mobile fate`],
    twinPopulation: 4,
    verdict: { kind: "classified", claim: { classification: "anchor-move", successor: "Missing mobile fate" } },
  },
  {
    why: "mustFlag[5] renamed vocabulary: the runtime refuses both named denominators; constructed control isolates the zone refusal",
    legacy: ["legacy | tooling/src/verify/gates/chrome-registry-completeness.ts:1 | - | packages/client/src/state/chrome-registry.ts i"],
    legacyPopulation: 2,
    finalOnTwin: [],
    twinPopulation: 3,
    originalErrors: ["chrome-registry-completeness/receipt: zero-member population(s): CHROME_ZONES, ChromeEntry"],
    twinErrors: ["chrome-registry-completeness/receipt: zero-member population(s): CHROME_ZONES, ChromeEntry"],
    verdict: { kind: "classified", claim: { classification: "runtime-refusal", successor: "CHROME_ZONES" } },
  },
  {
    why: "mustFlag[6] imported definition: final judges its resolved home; one prepended import shifts line two to three",
    legacy: [
      `legacy | ${FEATURE_ROOT}/x/lib/x-chrome.tsx:2 | unreadable definition: xChrome — the identifier \`xDef\` (not an object literal declared in this file — an imported or re-exported definition) | ${CHROME_PREFIX}`,
    ],
    legacyPopulation: 4,
    finalOnTwin: [`chrome-registry-completeness | ${FEATURE_ROOT}/x/lib/x-chrome.tsx:3 | xChrome | Definition outside its home`],
    twinPopulation: 5,
    verdict: { kind: "classified", claim: { classification: "stronger-reader", successor: "Definition outside its home" } },
  },
  ...[
    "mustPass[0] imported-spread brand zone",
    "mustPass[1] topbar mobile allowed",
    "mustPass[2] full topbar",
    "mustPass[3] rail nav mobile",
    "mustPass[4] rail end mobile",
  ].map(
    (why): ReplayRow => ({
      why,
      legacy: [],
      legacyPopulation: 3,
      finalOnTwin: [],
      twinPopulation: 4,
      verdict: { kind: "classified", claim: { classification: "vacuous-both-zero", successor: null } },
    }),
  ),
  ...["mustPass[5] factory/local-array assembler", "mustPass[6] top-level array assembler"].map(
    (why): ReplayRow => ({
      why: `${why}: no ChromeEntry subject; constructed positive neighbour proves the boundary`,
      legacy: [],
      legacyPopulation: 3,
      finalOnTwin: [],
      twinPopulation: 4,
      twinErrors: ["chrome-registry-completeness/receipt: zero-member population(s): ChromeEntry"],
      verdict: { kind: "unclassified", label: "UNCLASSIFIED-POPULATION-UNADMITTABLE" },
    }),
  ),
  {
    why: "mustPass[7] same-file indirection",
    legacy: [],
    legacyPopulation: 3,
    finalOnTwin: [],
    twinPopulation: 4,
    verdict: { kind: "classified", claim: { classification: "vacuous-both-zero", successor: null } },
  },
];

test("§4.6 — chrome-registry-completeness: every legacy example and both denominator failures", { timeout: scaledBudget(300_000) }, async ({ scratch }) => {
  const driven = await driveTable(scratch, {
    id: "chrome-registry-completeness",
    base: "577d03d63",
    policy: chromeRegistryCompleteness,
    typeName: "ChromeEntry",
    target: CHROME_TARGET,
    prepare: chromeTwin,
    rows: CHROME_ROWS,
  });
  expect(driven).toBe(15);
});

test("§4.6 — chrome vocabulary refusal and assembler exclusion have constructed controls", { timeout: scaledBudget(300_000) }, async ({ scratch }) => {
  const differential = createDifferential("/registry-chrome-constructed", toolErrorCode);
  const legacy = await frozenLegacyGate(scratch, "577d03d63", "tooling/src/verify/gates/chrome-registry-completeness.ts");
  const examples = legacyScenarios(legacy, FALLBACK);
  const member: Files = {
    [`${FEATURE_ROOT}/control/lib/control-chrome.ts`]: `import type { ChromeEntry } from "../../../state/__replay-chrome-target.ts";\nexport const controlChrome: ChromeEntry = { id: "control", zone: "rail.nav" };\n`,
  };
  const renamed = chromeTwin(examples[5] as Files);
  const refused = differential.finalReplay([chromeRegistryCompleteness], { ...renamed.twin, ...member }, armLabel);
  expect(refused.findings).toEqual([]);
  expect(refused.toolErrors, "the zone denominator independently withholds a populated entry owner").toEqual([
    "chrome-registry-completeness/receipt: zero-member population(s): CHROME_ZONES",
  ]);
  for (const index of [12, 13]) {
    const twin = chromeTwin(examples[index] as Files).twin;
    const run = differential.finalReplay([chromeRegistryCompleteness], { ...twin, ...member }, armLabel);
    expect(run.toolErrors).toEqual([]);
    expect(run.findings, "assembler stays excluded while the adjacent real entry fires").toEqual([
      `chrome-registry-completeness | ${FEATURE_ROOT}/control/lib/control-chrome.ts:2 | controlChrome | Missing mobile fate`,
    ]);
  }
});

const TILE_TARGET = "packages/client/src/state/__replay-tile-target.ts";
const TILE_PREFIX = "a home tile is dishonest: a HomeTileContribution".slice(0, 46);
const TILE_ROWS: readonly ReplayRow[] = [
  {
    why: "mustFlag[0] co-location; one-line import prepend is an artifact, token moves to the declared name",
    legacy: [`legacy | ${FEATURE_ROOT}/x/lib/not-a-tile-file.ts:1 | not co-located: strayTile | ${TILE_PREFIX}`],
    legacyPopulation: 1,
    finalOnTwin: [`home-tile-registry-completeness | ${FEATURE_ROOT}/x/lib/not-a-tile-file.ts:2 | strayTile | Not co-located`],
    twinPopulation: 2,
    verdict: { kind: "classified", claim: { classification: "anchor-move", successor: "Not co-located" } },
  },
  ...[
    ["mustFlag[1] empty reason", "dormant empty reason (xTile)", "declares an empty `reason`"],
    ["mustFlag[2] absent teaser", "dormant empty teaser (xTile)", "declares no `teaser`"],
    ["mustFlag[3] doorway action", "dormant with action (xTile)", "declares an `action`"],
  ].map(
    ([why, token, arm]): ReplayRow => ({
      why: `${why}; one-line prepend artifact, exact dormant subarm retained`,
      legacy: [`legacy | ${FEATURE_ROOT}/x/lib/x-tile.tsx:1 | ${token} | ${TILE_PREFIX}`],
      legacyPopulation: 1,
      finalOnTwin: [`home-tile-registry-completeness | ${FEATURE_ROOT}/x/lib/x-tile.tsx:2 | xTile | ${arm}`],
      twinPopulation: 2,
      verdict: { kind: "classified", claim: { classification: "anchor-move", successor: arm as string } },
    }),
  ),
  {
    why: "mustFlag[4] duplicate id; one-line prepend artifact, declared-name anchor",
    legacy: [
      `legacy | ${FEATURE_ROOT}/b/lib/b-tile.tsx:1 | duplicate id "dup" (bTile) — first claimed by "aTile" (${FEATURE_ROOT}/a/lib/a-tile.tsx) | ${TILE_PREFIX}`,
    ],
    legacyPopulation: 2,
    finalOnTwin: [`home-tile-registry-completeness | ${FEATURE_ROOT}/b/lib/b-tile.tsx:2 | bTile | Duplicate id`],
    twinPopulation: 3,
    verdict: { kind: "classified", claim: { classification: "anchor-move", successor: "Duplicate id" } },
  },
  {
    why: "mustFlag[5] anti-god-map has moved to registry-assembly-at-door-only; no tile subject exists in these bytes",
    legacy: [`legacy | ${FEATURE_ROOT}/home/lib/compose-tiles.ts:1 | second home-tiles assembly | ${TILE_PREFIX}`],
    legacyPopulation: 1,
    finalOnTwin: [],
    twinPopulation: 2,
    twinErrors: ["home-tile-registry-completeness/receipt: zero-member population(s): HomeTileContribution"],
    verdict: { kind: "unclassified", label: "UNCLASSIFIED-POPULATION-UNADMITTABLE" },
  },
  ...["mustPass[0] full renderer with action", "mustPass[1] honest dormant doorway"].map(
    (why): ReplayRow => ({
      why,
      legacy: [],
      legacyPopulation: 1,
      finalOnTwin: [],
      twinPopulation: 2,
      verdict: { kind: "classified", claim: { classification: "vacuous-both-zero", successor: null } },
    }),
  ),
  {
    why: "mustPass[2] assembly at the main door; no tile subject exists in these bytes",
    legacy: [],
    legacyPopulation: 1,
    finalOnTwin: [],
    twinPopulation: 2,
    twinErrors: ["home-tile-registry-completeness/receipt: zero-member population(s): HomeTileContribution"],
    verdict: { kind: "unclassified", label: "UNCLASSIFIED-POPULATION-UNADMITTABLE" },
  },
];

test("§4.6 — home-tile-registry-completeness: every legacy example preserves its declared dormant subarm", { timeout: scaledBudget(300_000) }, async ({
  scratch,
}) => {
  const driven = await driveTable(scratch, {
    id: "home-tile-registry-completeness",
    base: "614b2cb55",
    policy: homeTileRegistryCompleteness,
    typeName: "HomeTileContribution",
    target: TILE_TARGET,
    rows: TILE_ROWS,
  });
  expect(driven).toBe(9);
});

test("§4.6 — home-tile anti-god-map and legal door are exercised by their successor", { timeout: scaledBudget(300_000) }, async ({ scratch }) => {
  const differential = createDifferential("/registry-tile-successor", toolErrorCode);
  const legacy = await frozenLegacyGate(scratch, "614b2cb55", "tooling/src/verify/gates/home-tile-registry-completeness.ts");
  const examples = legacyScenarios(legacy, FALLBACK);
  const registryHome = "packages/client/src/lib/registry.ts";
  const prerequisites = registryAssemblyAtDoorOnly.mustFlag[0].files[registryHome];
  expect(prerequisites, "the successor's actual canonical factory prerequisite").toBeTypeOf("string");
  for (const [index, subject, expected] of [
    [
      5,
      `${FEATURE_ROOT}/home/lib/compose-tiles.ts`,
      [
        `registry-assembly-at-door-only | ${FEATURE_ROOT}/home/lib/compose-tiles.ts:2 | createContributorRegistry | createRegistry()/createContributorRegistry() m`,
      ],
    ],
    [8, "packages/client/src/main.tsx", []],
  ] as const) {
    const base = examples[index] as Files;
    const add = { [registryHome]: prerequisites as string };
    const twin = repairedFiles(base, {
      add,
      prepend: { [subject]: `import { createContributorRegistry } from "${targetSpecifier(subject, registryHome)}";\n` },
    });
    expect(differential.legacyReplay(legacy, twin, unlined).findings).toEqual(differential.legacyReplay(legacy, base, unlined).findings);
    const alone = differential.finalReplay([registryAssemblyAtDoorOnly], add, label);
    expect(alone.toolErrors).toEqual([]);
    expect(alone.findings).toEqual([]);
    const run = differential.finalReplay([registryAssemblyAtDoorOnly], twin, label);
    expect(run.toolErrors).toEqual([]);
    expect(run.findings, `legacy example ${index}: moved assembly arm, including its door exclusion`).toEqual(expected);
  }
});

// The tuple-only owner needs all four vocabularies, not a registry member. Preserve the original
// declaration wherever it lives; adding a second declaration of that name would make it ambiguous.
const VOCAB_HOMES = [
  ["SECTION_IDS", "section-ids.ts"],
  ["MODAL_SLOT_IDS", "modal-slot-ids.ts"],
  ["CONFIG_GROUP_IDS", "config-group-ids.ts"],
  ["RAIL_ZONES", "section-registry.ts"],
  ["CHROME_ZONES", "chrome-registry.ts"],
] as const;

function vocabularyTwin(files: Files): { readonly add: Files; readonly twin: Files } {
  const add: Record<string, string> = {};
  for (const [name, basename] of VOCAB_HOMES) {
    const existing = Object.entries(files).find(([, source]) => source.includes(`export const ${name} =`));
    if (existing !== undefined) {
      add[existing[0]] = existing[1];
    } else {
      const home = `packages/client/src/state/${basename}` as const;
      add[home] = noParallelSectionMap.mustFlag[0].files[home] as string;
    }
  }
  // The original Record fixture imports this alias from an existing tuple home. Complete that binding
  // at the end of the prerequisite file, so the subject's authored line/column positions do not move.
  const shellHome = "packages/client/src/state/shell-store.ts";
  if (Object.values(files).some((source) => source.includes("import type { SectionId }"))) {
    add[shellHome] = `${add[shellHome]}export type SectionId = typeof SECTION_IDS[number];\n`;
  }
  return { add, twin: { ...files, ...add } };
}

const PARALLEL_ID = "no-parallel-section-map";
const PARALLEL_PREFIX = "a hardcoded map (object literal / `{ id }` array".slice(0, 46);
const PARALLEL_MISSING = {
  section: ["CHROME_ZONES", "CONFIG_GROUP_IDS", "MODAL_SLOT_IDS"],
  modal: ["CHROME_ZONES", "CONFIG_GROUP_IDS", "SECTION_IDS"],
  config: ["CHROME_ZONES", "MODAL_SLOT_IDS", "SECTION_IDS"],
  chrome: ["CONFIG_GROUP_IDS", "MODAL_SLOT_IDS", "SECTION_IDS"],
  sectionModal: ["CHROME_ZONES", "CONFIG_GROUP_IDS"],
} as const;

/** Full arm text preserves BOTH shape and vocabulary, which the common policy-message prefix cannot. */
function parallelFlag({
  why,
  file,
  legacyToken,
  line,
  token,
  arm,
  missing,
  legacyPopulation = 2,
}: {
  readonly why: string;
  readonly file: string;
  readonly legacyToken: string;
  readonly line: number;
  readonly token: string;
  readonly arm: string;
  readonly missing: readonly string[];
  readonly legacyPopulation?: number;
}): ReplayRow {
  const path = `${FEATURE_ROOT}/x/lib/${file}.ts`;
  return {
    why: `${why}; no subject prepend, token/line delta belongs to the successor anchor`,
    legacy: [`legacy | ${path}:${legacyToken === "SectionId-record-type" ? 3 : 1} | ${legacyToken} | ${PARALLEL_PREFIX}`],
    legacyPopulation,
    finalOnTwin: [`${PARALLEL_ID} | ${path}:${line} | ${token} | ${arm}`],
    twinPopulation: 6,
    originalErrors: [`${PARALLEL_ID}/receipt: zero-member population(s): ${missing.join(", ")}`],
    verdict: { kind: "classified", claim: { classification: "anchor-move", successor: arm } },
  };
}

const PARALLEL_ROWS: readonly ReplayRow[] = [
  parallelFlag({
    why: "mustFlag[0] section object",
    file: "panel-defaults",
    legacyToken: "SectionId-object-map",
    line: 2,
    token: "chats",
    arm: "A per-id object literal re-declares ≥2 SectionIds outside the sanctioned homes.",
    missing: PARALLEL_MISSING.section,
  }),
  parallelFlag({
    why: "mustFlag[1] section object array",
    file: "rail-sections",
    legacyToken: "SectionId-object-array",
    line: 2,
    token: '"chats"',
    arm: "An array of `{ id: … }` elements covers ≥2 SectionIds outside the sanctioned homes.",
    missing: PARALLEL_MISSING.section,
  }),
  parallelFlag({
    why: "mustFlag[2] typed record",
    file: "labels",
    legacyToken: "SectionId-record-type",
    line: 3,
    token: "LABELS",
    arm: "A `Record<SectionId, …>` annotation declares a per-id map outside the sanctioned homes.",
    missing: PARALLEL_MISSING.section,
  }),
  parallelFlag({
    why: "mustFlag[3] modal object",
    file: "you-rows",
    legacyToken: "ModalSlotId-object-map",
    line: 2,
    token: "theme",
    arm: "A per-id object literal re-declares ≥2 ModalSlotIds outside the sanctioned homes.",
    missing: PARALLEL_MISSING.modal,
  }),
  parallelFlag({
    why: "mustFlag[4] modal object array",
    file: "rail-actions",
    legacyToken: "ModalSlotId-object-array",
    line: 2,
    token: '"theme"',
    arm: "An array of `{ id: … }` elements covers ≥2 ModalSlotIds outside the sanctioned homes.",
    missing: PARALLEL_MISSING.modal,
  }),
  parallelFlag({
    why: "mustFlag[5] modal strings",
    file: "you-modal-ids",
    legacyToken: "ModalSlotId-string-array",
    line: 1,
    token: '"account"',
    arm: "A bare array of id strings covers ≥2 ModalSlotIds outside the sanctioned homes.",
    missing: PARALLEL_MISSING.modal,
  }),
  parallelFlag({
    why: "mustFlag[6] wrapped modal strings",
    file: "you-modal-ids",
    legacyToken: "ModalSlotId-string-array",
    line: 1,
    token: '"account" as const',
    arm: "A bare array of id strings covers ≥2 ModalSlotIds outside the sanctioned homes.",
    missing: PARALLEL_MISSING.modal,
  }),
  parallelFlag({
    why: "mustFlag[7] config object",
    file: "config-labels",
    legacyToken: "ConfigGroupId-object-map",
    line: 2,
    token: "personas",
    arm: "A per-id object literal re-declares ≥2 ConfigGroupIds outside the sanctioned homes.",
    missing: PARALLEL_MISSING.config,
  }),
  parallelFlag({
    why: "mustFlag[8] chrome list",
    file: "hand-list",
    legacyToken: "chrome-array",
    line: 2,
    token: '"rail.end"',
    arm: "A hand-maintained chrome list re-declares ≥2 CHROME_ZONES-zoned entries outside the door.",
    missing: PARALLEL_MISSING.chrome,
  }),
  parallelFlag({
    why: "mustFlag[9] imported rail spread",
    file: "hand-rail",
    legacyToken: "chrome-array",
    line: 2,
    token: '"rail.nav"',
    arm: "A hand-maintained chrome list re-declares ≥2 CHROME_ZONES-zoned entries outside the door.",
    missing: PARALLEL_MISSING.chrome,
    legacyPopulation: 3,
  }),
  ...(
    [
      ["mustPass[0] derived map", "section", 2, 6],
      ["mustPass[1] mixed object array", "section", 2, 6],
      ["mustPass[2] tuple home", "sectionModal", 1, 4],
      ["mustPass[3] foreign string", "modal", 2, 6],
      ["mustPass[4] group home", "config", 2, 6],
      ["mustPass[5] config tuple home", "config", 1, 5],
      ["mustPass[6] chrome definition home", "chrome", 2, 6],
      ["mustPass[7] foreign zones", "chrome", 2, 6],
      ["mustPass[8] section compose door", "section", 2, 6],
      ["mustPass[9] chrome compose door", "chrome", 2, 6],
      ["mustPass[10] spread plus foreign zones", "chrome", 3, 6],
    ] as const
  ).map(
    ([why, missing, legacyPopulation, twinPopulation]): ReplayRow => ({
      why,
      legacy: [],
      legacyPopulation,
      finalOnTwin: [],
      twinPopulation,
      originalErrors: [`${PARALLEL_ID}/receipt: zero-member population(s): ${PARALLEL_MISSING[missing].join(", ")}`],
      verdict: { kind: "classified", claim: { classification: "vacuous-both-zero", successor: null } },
    }),
  ),
];

test("§4.6 — no-parallel-section-map: all 21 rows retain shape, vocabulary and four receipts", { timeout: scaledBudget(300_000) }, async ({ scratch }) => {
  expect(
    await driveTable(scratch, {
      id: PARALLEL_ID,
      base: "614b2cb55",
      policy: noParallelSectionMap,
      typeName: "four vocabulary tuples",
      target: "",
      prepare: vocabularyTwin,
      aloneCompletes: true,
      rows: PARALLEL_ROWS,
    }),
  ).toBe(21);
});

test("§4.6 — each vocabulary independently withholds the populated parallel-map owner", { timeout: scaledBudget(300_000) }, async ({ scratch }) => {
  const differential = createDifferential("/registry-parallel-refusals", toolErrorCode);
  const legacy = await frozenLegacyGate(scratch, "614b2cb55", `tooling/src/verify/gates/${PARALLEL_ID}.ts`);
  const twin = vocabularyTwin(legacyScenarios(legacy, FALLBACK)[0] as Files).twin;
  for (const [name] of VOCAB_HOMES.filter(([candidate]) => candidate !== "RAIL_ZONES")) {
    const broken = Object.fromEntries(
      Object.entries(twin).map(([path, source]) => [path, source.replace(`export const ${name} =`, `export const RENAMED_${name} =`)]),
    );
    const run = differential.finalReplay([noParallelSectionMap], broken, armLabel);
    expect(run.findings, `${name}: a partial verdict is withheld`).toEqual([]);
    expect(run.toolErrors, `${name}: independently named refusal`).toEqual([`${PARALLEL_ID}/receipt: zero-member population(s): ${name}`]);
  }
});

const FACTORY_ID = "section-factory-contribution-bundle";
const REGISTRY_TYPE_HOME = "packages/client/src/lib/registry.ts";
const SECTION_TYPE_HOME = "packages/client/src/state/section-registry.ts";
const FACTORY_BOTH_MISSING = `${FACTORY_ID}/receipt: zero-member population(s): ContributorRegistry, SectionDefinition factory`;
const FACTORY_ONLY_MISSING = `${FACTORY_ID}/receipt: zero-member population(s): SectionDefinition factory`;

function excludedFactoryTwin(files: Files): { readonly add: Files; readonly twin: Files } {
  if (files[SECTION_TYPE_HOME] !== undefined) {
    return { add: files, twin: files };
  }
  const add: Files = {
    "packages/client/src/state/__replay-factory-target.ts": sectionFactoryContributionBundle.mustFlag[0].files[SECTION_TYPE_HOME] as string,
  };
  return { add, twin: { ...files, ...add } };
}

function factoryTwin(files: Files): { readonly add: Files; readonly twin: Files } {
  // Neither excluded function is a factory. Introducing canonical homes here would awaken legacy's
  // finalize tripwire and fail inertness. Keep that admission limit explicit; constructed controls below
  // put the excluded function beside an admitted factory, as the final policy's own examples do.
  if (!Object.values(files).some((source) => source.includes(": SectionDefinition"))) {
    return excludedFactoryTwin(files);
  }
  const add: Files = {
    [REGISTRY_TYPE_HOME]: files[REGISTRY_TYPE_HOME] ?? (sectionFactoryContributionBundle.mustFlag[0].files[REGISTRY_TYPE_HOME] as string),
    [SECTION_TYPE_HOME]: files[SECTION_TYPE_HOME] ?? (sectionFactoryContributionBundle.mustFlag[0].files[SECTION_TYPE_HOME] as string),
  };
  const prepend: Record<string, string> = {};
  for (const [path, source] of Object.entries(files)) {
    if (path === REGISTRY_TYPE_HOME || path === SECTION_TYPE_HOME) {
      continue;
    }
    const imports: string[] = [];
    if (source.includes(": SectionDefinition")) {
      imports.push(`import type { SectionDefinition } from "${targetSpecifier(path, SECTION_TYPE_HOME)}";`);
    }
    if (source.includes("ContributorRegistry<") && !source.includes("import type { ContributorRegistry }")) {
      imports.push(`import type { ContributorRegistry } from "${targetSpecifier(path, REGISTRY_TYPE_HOME)}";`);
    }
    if (imports.length > 0) {
      prepend[path] = `${imports.join("\n")}\n`;
    }
  }
  return { add, twin: repairedFiles(files, { add, prepend }) };
}

function factoryCatch({
  feature,
  stem,
  name,
  line,
  parameter,
  kind,
}: {
  readonly feature: string;
  readonly stem: string;
  readonly name: string;
  readonly line: number;
  readonly parameter: string;
  readonly kind: "registry" | "callable";
}): readonly [string, string] {
  const path = `${FEATURE_ROOT}/${feature}/lib/${stem}-section.tsx`;
  const legacyMessage = kind === "registry" ? `\`${name}\` takes 2 \`ContributorRegistry\` parameters` : `\`${name}\` takes 2 render-prop parameters (`;
  const arm = kind === "registry" ? "ContributorRegistry parameters" : "callable render-prop parameters";
  return [`legacy | ${path}:1 | - | ${legacyMessage.slice(0, 46)}`, `${FACTORY_ID} | ${path}:${line} | ${parameter} | ${arm}`];
}

const FACTORY_FLAG_ROWS = [
  [
    "mustFlag[0] positional registries",
    [factoryCatch({ feature: "chat", stem: "chats", name: "makeChatsSection", line: 5, parameter: "regions", kind: "registry" })],
    1,
    3,
  ],
  [
    "mustFlag[1] arrow registries",
    [factoryCatch({ feature: "chat", stem: "chats", name: "makeChatsSection", line: 5, parameter: "b", kind: "registry" })],
    1,
    3,
  ],
  [
    "mustFlag[2] imported aliases",
    [factoryCatch({ feature: "chat", stem: "chats", name: "makeChatsSection", line: 3, parameter: "b", kind: "registry" })],
    2,
    4,
  ],
  [
    "mustFlag[3] render props",
    [factoryCatch({ feature: "character", stem: "characters", name: "makeCharactersSection", line: 4, parameter: "notesPane", kind: "callable" })],
    1,
    3,
  ],
  [
    "mustFlag[4] independent arms",
    [
      factoryCatch({ feature: "x", stem: "x", name: "makeXSection", line: 5, parameter: "b", kind: "registry" }),
      factoryCatch({ feature: "x", stem: "x", name: "makeXSection", line: 7, parameter: "q", kind: "callable" }),
    ],
    1,
    3,
  ],
] as const;

const FACTORY_ROWS: readonly ReplayRow[] = [
  ...FACTORY_FLAG_ROWS.map(
    ([why, findings, legacyPopulation, twinPopulation], index): ReplayRow => ({
      why: `${why}; import prepend is an artifact, each arm moves to its own excess parameter`,
      legacy: findings.map(([before]) => (index === 2 ? before.replace(":1 |", ":2 |") : before)),
      legacyPopulation,
      finalOnTwin: findings.map(([, after]) => after),
      twinPopulation,
      originalErrors: [FACTORY_BOTH_MISSING],
      verdict: { kind: "classified", claim: { classification: "anchor-move", successor: findings[0][1] } },
    }),
  ),
  {
    why: "mustFlag[5] canonical registry rename; original missing export is preserved",
    legacy: [`legacy | tooling/src/verify/gates/${FACTORY_ID}.ts:1 | - | ${"this gate is keyed on the type name `ContributorRegistry`".slice(0, 46)}`],
    legacyPopulation: 3,
    finalOnTwin: [],
    twinPopulation: 3,
    originalErrors: [FACTORY_BOTH_MISSING],
    twinErrors: [`${FACTORY_ID}/receipt: zero-member population(s): ContributorRegistry`],
    verdict: { kind: "classified", claim: { classification: "runtime-refusal", successor: "ContributorRegistry" } },
  },
  {
    why: "mustFlag[6] canonical homes without a factory; named runtime refusal succeeds legacy blindness finding",
    legacy: [`legacy | tooling/src/verify/gates/${FACTORY_ID}.ts:1 | - | ${"no exported `SectionDefinition`-returning factory exists".slice(0, 46)}`],
    legacyPopulation: 2,
    finalOnTwin: [],
    twinPopulation: 2,
    originalErrors: [FACTORY_ONLY_MISSING],
    twinErrors: [FACTORY_ONLY_MISSING],
    verdict: { kind: "classified", claim: { classification: "runtime-refusal", successor: "SectionDefinition factory" } },
  },
  ...(
    [
      ["mustPass[0] one aliased registry and one render prop", 2, 4],
      ["mustPass[1] unresolved ForeignSeam is the declared reach limit", 1, 3],
      ["mustPass[2] one destructured parameter; its undeclared bundle type needs the separate resolved remedy control", 1, 3],
      ["mustPass[3] one registry and one render prop", 1, 3],
      ["mustPass[4] one registry", 1, 3],
    ] as const
  ).map(
    ([why, legacyPopulation, twinPopulation]): ReplayRow => ({
      why,
      legacy: [],
      legacyPopulation,
      finalOnTwin: [],
      twinPopulation,
      originalErrors: [FACTORY_BOTH_MISSING],
      verdict: { kind: "classified", claim: { classification: "vacuous-both-zero", successor: null } },
    }),
  ),
  ...["mustPass[5] different return type", "mustPass[6] unannotated return"].map(
    (why): ReplayRow => ({
      why: `${why}; canonical-home-only candidate is not inert, so original admission limit remains explicit`,
      legacy: [],
      legacyPopulation: 1,
      finalOnTwin: [],
      twinPopulation: 2,
      originalErrors: [FACTORY_BOTH_MISSING],
      twinErrors: [FACTORY_BOTH_MISSING],
      verdict: { kind: "unclassified", label: "UNCLASSIFIED-POPULATION-UNADMITTABLE" },
    }),
  ),
  {
    why: "mustPass[7] canonical exports plus one factory earns the legacy tripwire",
    legacy: [],
    legacyPopulation: 3,
    finalOnTwin: [],
    twinPopulation: 3,
    originalErrors: [FACTORY_ONLY_MISSING],
    verdict: { kind: "classified", claim: { classification: "vacuous-both-zero", successor: null } },
  },
];

test("§4.6 — section-factory-contribution-bundle: all 15 legacy rows retain separate arms and refusal identities", { timeout: scaledBudget(300_000) }, async ({
  scratch,
}) => {
  expect(
    await driveTable(scratch, {
      id: FACTORY_ID,
      base: "f16cde889",
      policy: sectionFactoryContributionBundle,
      typeName: "ContributorRegistry, SectionDefinition factory",
      target: SECTION_TYPE_HOME,
      prepare: factoryTwin,
      rows: FACTORY_ROWS,
    }),
  ).toBe(15);
});

test("§4.6 — factory excluded functions reject a non-inert twin and have admitted successor controls", { timeout: scaledBudget(300_000) }, async ({
  scratch,
}) => {
  const differential = createDifferential("/registry-factory-scope", toolErrorCode);
  const legacy = await frozenLegacyGate(scratch, "f16cde889", `tooling/src/verify/gates/${FACTORY_ID}.ts`);
  const examples = legacyScenarios(legacy, FALLBACK);
  const homes: Files = {
    [REGISTRY_TYPE_HOME]: sectionFactoryContributionBundle.mustFlag[0].files[REGISTRY_TYPE_HOME] as string,
    [SECTION_TYPE_HOME]: sectionFactoryContributionBundle.mustFlag[0].files[SECTION_TYPE_HOME] as string,
  };
  for (const index of [12, 13]) {
    const base = examples[index] as Files;
    expect(differential.legacyReplay(legacy, base, label).findings).toEqual([]);
    expect(
      differential.legacyReplay(legacy, { ...base, ...homes }, label).findings,
      "adding only homes awakens the legacy finalize tripwire; rejected twin",
    ).toEqual([`legacy | tooling/src/verify/gates/${FACTORY_ID}.ts:1 | - | ${"no exported `SectionDefinition`-returning factory exists".slice(0, 46)}`]);
  }
  // These are CONSTRUCTED successors, not evidence that a zero-denominator original passed. The final
  // fixtures place a real factory beside each excluded function and resolve the named bundle remedy.
  for (const index of [1, 3, 4] as const) {
    const run = differential.finalReplay([sectionFactoryContributionBundle], sectionFactoryContributionBundle.mustPass[index].files, armLabel);
    expect(run.toolErrors, `constructed final mustPass[${index}] admits a factory`).toEqual([]);
    expect(run.findings).toEqual([]);
  }
});

// ── FOUNDING DENOMINATOR receipts retained beside the expanded tables ───────────────────────────────────

test("§4.6 — the vocabulary and factory founding examples retain their named original-byte withholding", {
  timeout: scaledBudget(300_000),
}, async ({ scratch }) => {
  const witnessed: string[] = [];
  for (const [id, base, policy, populations] of MEMBERS.filter(
    ([memberId]) => memberId === "section-factory-contribution-bundle" || memberId === "no-parallel-section-map",
  )) {
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
  expect(witnessed, "both founding examples retain the original admission boundary").toEqual(
    MEMBERS.filter(([memberId]) => memberId === "section-factory-contribution-bundle" || memberId === "no-parallel-section-map").map(([id]) => id),
  );
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
