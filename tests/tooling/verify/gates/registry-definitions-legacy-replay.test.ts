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
// ── SCOPE OF THIS COMMIT ──────────────────────────────────────────────────────────────────────────────
// `modal-body-not-placeholder` is driven end to end. The other eight members are UNDECLARED, deliberately:
// each needs its own prerequisite read off its own final `mustFlag` fixture, and inventing them from the
// pattern would be exactly the guesswork the `SectionPlaceholder` measurement above disproves. The
// withheld-by-population arm covers all seven non-split members so none of them reads as a clean zero in
// the meantime. The two SPLIT members (`config-group-completeness` `58370d705`,
// `section-registry-completeness` `dd862e988`) are last by dispatch order and carry a per-example coverage
// statement when they land.
import type { GatePolicy } from "../../../../tooling/src/verify/contract/policy.ts";
import { gate as chromeRegistryCompleteness } from "../../../../tooling/src/verify/gates/chrome-registry-completeness.ts";
import { gate as homeTileRegistryCompleteness } from "../../../../tooling/src/verify/gates/home-tile-registry-completeness.ts";
import { gate as modalBodyNotPlaceholder } from "../../../../tooling/src/verify/gates/modal-body-not-placeholder.ts";
import { gate as modalRegistryCompleteness } from "../../../../tooling/src/verify/gates/modal-registry-completeness.ts";
import { gate as noParallelSectionMap } from "../../../../tooling/src/verify/gates/no-parallel-section-map.ts";
import { gate as placeholderCopyRegistry } from "../../../../tooling/src/verify/gates/placeholder-copy-registry.ts";
import { gate as sectionFactoryContributionBundle } from "../../../../tooling/src/verify/gates/section-factory-contribution-bundle.ts";
import type { DifferentialClaim, Files } from "../../../support/legacy-differential.ts";
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

// ── THE REMAINING SIX, kept as the withheld receipt so none of them reads as a clean zero ─────────────

test("§4.6 — the other six non-split members are WITHHELD on their descriptor-era examples, by named population", { timeout: scaledBudget(300_000) }, async ({
  scratch,
}) => {
  const witnessed: string[] = [];
  for (const [id, base, policy, populations] of MEMBERS.slice(1)) {
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
  expect(witnessed, "all six, so the blocker is the FAMILY's shape and not one awkward module").toEqual(MEMBERS.slice(1).map(([id]) => id));
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
