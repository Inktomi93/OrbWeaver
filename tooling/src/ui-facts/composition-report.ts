// The composition section of the report: skeleton families, section structure, read, feedback and form shape, and variant use.
import type { UiFacts } from "./analysis.ts";
import type { Cohort, Member } from "./compare.ts";
import { table } from "./markdown.ts";
import type { SkeletonCohort } from "./skeleton.ts";
import type { AxisUse } from "./variants.ts";
import { totalUses } from "./variants.ts";

const TOP = 25;
const FINGERPRINT_CLIP = 220;
const FILES_SHOWN = 3;

/** What the composition columns cannot see, printed under the composition section. */
const COMPOSITION_CANNOT_SEE: readonly string[] = [
  "Skeletons read one file at a time: a local component or a hook-returned element is an `L`, so a surface that moves its body into another file looks shallow.",
  "A skeleton keeps both arms of a conditional and every map body once; it does not say which arm renders.",
  "Section boundary ownership is the tag present in the section's surface files, not a proof the boundary wraps that read.",
  "A ladder is any useQuery whose result is read through isPending, isLoading, isError or status in the same function; whether that read suspends needs types. A useQuery inside useQueries, or aliased, is not seen.",
  "An `enabled` flag is reported whatever its expression; it does not check that the gate is a null test that skipToken would replace.",
  "Success feedback is file-level: a toast manager anywhere in the file counts for every mutation in it. A success message built in a shared helper is invisible.",
  "Inline failure is a read of error, isError, retry or clearError on the hook result; an error shown through a prop passed from a parent is invisible.",
  "Form mode follows factory names across imports and tags; a form built by a helper in another file is attributed by its imported name only.",
  "Variant uses resolve through same-file consts, conditionals and `??`, `||`, `&&` of literals, three hops deep. A prop, a call, an import or a template with substitutions stays unresolved. A spread of an object literal (or a same-file const of one) writes its axes. Any other spread writes nothing here, because `orb/no-opaque-variant-spread` refuses one whose type can carry an axis; a computed key or a getter in a literal stays unresolved.",
];
const COHORT_NAMES = ["section-structure", "read-shape", "feedback", "form"] as const;

const clip = (text: string): string => (text.length <= FINGERPRINT_CLIP ? text : `${text.slice(0, FINGERPRINT_CLIP)}…`);
const cohortOf = (facts: UiFacts, name: string): Cohort | undefined => facts.cohorts.find((entry) => entry.name === name);
const cellOf = (member: Member, column: string): string => member.cells[column]?.value ?? "";
const at = (member: Member, column: string): string => `${member.path}:${member.cells[column]?.line ?? 1}`;

function tally(members: readonly Member[], column: string): string[][] {
  const counts = new Map<string, number>();
  for (const member of members) {
    counts.set(cellOf(member, column), (counts.get(cellOf(member, column)) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([value, count]) => [value, String(count)]);
}

function basisLines(facts: UiFacts): string[] {
  const rows = COHORT_NAMES.flatMap((name) => Object.entries(cohortOf(facts, name)?.basis ?? {}).map(([column, basis]) => [`${name} / ${column}`, basis]));
  return [
    "### Column basis",
    "",
    "Measured: read straight off the syntax of the file. Heuristic: inferred from names, file placement or presence; it can be wrong on a given row.",
    "",
    ...table(
      ["column", "basis"],
      [
        ...rows,
        ["surface skeleton", "measured (templates, composites, primitives); locals collapse to L"],
        ["variant uses", "measured for literals, heuristic through a const map"],
      ],
    ),
  ];
}

function skeletonLines(cohort: SkeletonCohort, inScope: (section: string) => boolean): string[] {
  const shown = cohort.outliers.filter((outlier) => inScope(outlier.member.section));
  return [
    `#### ${cohort.name}: ${cohort.members.length} files, ${cohort.common.length} common skeleton(s), ${cohort.outliers.length} outlier(s)`,
    "",
    ...table(
      ["count", "common skeleton", "files"],
      cohort.common.slice(0, TOP).map((entry) => [entry.count, clip(entry.fingerprint), entry.paths.slice(0, FILES_SHOWN).join(", ")]),
    ),
    ...table(
      ["outlier", "nearest common skeleton", "adds", "lacks"],
      shown
        .slice(0, TOP)
        .map((outlier) => [
          `${outlier.member.path} = ${outlier.member.fingerprint} (full: ${clip(outlier.member.full)})`,
          outlier.nearest === null ? "none: no skeleton is shared in this cohort" : clip(outlier.nearest),
          outlier.added.join(" "),
          outlier.removed.join(" "),
        ]),
    ),
  ];
}

function structureLines(facts: UiFacts, inScope: (section: string) => boolean): string[] {
  const cohort = cohortOf(facts, "section-structure");
  const members = (cohort?.members ?? []).filter((member) => inScope(member.section));
  return [
    "### Section structure",
    "",
    ...table(
      ["section", ...(cohort?.columns ?? [])],
      members.map((member) => [member.section, ...(cohort?.columns ?? []).map((column) => cellOf(member, column))]),
    ),
  ];
}

function readLines(facts: UiFacts, inScope: (section: string) => boolean): string[] {
  const members = (cohortOf(facts, "read-shape")?.members ?? []).filter((member) => inScope(member.section));
  const bad = members.filter((member) => cellOf(member, "shape") !== "background" && cellOf(member, "shape") !== "skipToken");
  const reads = facts.composition.scans.reads;
  return [
    "### Read shape",
    "",
    `Scanned ${reads.files} client files: ${reads.counts.useQuery} useQuery, ${reads.counts.useQueries} useQueries, ${reads.counts.useGatedQuery} useGatedQuery, ${reads.counts.useSuspenseQuery} useSuspenseQuery. Only useQuery is classified.`,
    "",
    ...table(["shape", "calls"], tally(members, "shape")),
    ...table(
      ["at", "in", "shape"],
      bad.slice(0, TOP).map((member) => [at(member, "shape"), member.label, cellOf(member, "shape")]),
    ),
  ];
}

function feedbackLines(facts: UiFacts, inScope: (section: string) => boolean): string[] {
  const members = (cohortOf(facts, "feedback")?.members ?? []).filter((member) => inScope(member.section));
  const scan = facts.composition.scans.feedback;
  const repeated = members.filter((member) => cellOf(member, "failure") === "toast+inline");
  return [
    "### Feedback shape",
    "",
    `Scanned ${scan.files} client files: ${scan.factories} entity-mutation hooks, ${scan.consumers} consumers.`,
    "",
    ...table(["success", "consumers"], tally(members, "success")),
    ...table(["failure", "consumers"], tally(members, "failure")),
    ...table(
      ["repeated failure surface (factory toast and an inline read)", "hook"],
      repeated.slice(0, TOP).map((member) => [at(member, "failure"), member.label]),
    ),
  ];
}

function formLines(facts: UiFacts, inScope: (section: string) => boolean): string[] {
  const members = (cohortOf(facts, "form")?.members ?? []).filter((member) => inScope(member.section));
  const defects = members.filter((member) => cellOf(member, "fit") === "autosave says Cancel");
  const odd = members.filter((member) => cellOf(member, "fit") === "explicit says Close/Done/Back");
  const row = (member: Member): string[] => [at(member, "mode"), cellOf(member, "mode"), cellOf(member, "submit"), cellOf(member, "dismiss")];
  return [
    "### Form shape",
    "",
    `Scanned ${facts.composition.scans.forms.files} client tsx files; ${facts.composition.scans.forms.factories} form hooks minted by a factory.`,
    "",
    ...table(["mode", "files"], tally(members, "mode")),
    ...table(["dismiss words", "files"], tally(members, "dismiss")),
    "Autosave forms that say Cancel:",
    "",
    ...table(["at", "mode", "submit", "dismiss"], defects.slice(0, TOP).map(row)),
    "Explicit-submit forms that dismiss with Close, Done or Back and never Cancel:",
    "",
    ...table(["at", "mode", "submit", "dismiss"], odd.slice(0, TOP).map(row)),
  ];
}

function variantRow(axis: AxisUse): string[] {
  const written = axis.values
    .filter((value) => totalUses(value) > 0)
    .map((value) => `${value.value} ${value.direct}${value.resolved > 0 ? `+${value.resolved}` : ""}`)
    .join("; ");
  const reasons = Object.entries(axis.unresolved)
    .map(([reason, count]) => `${reason} x${count}`)
    .join("; ");
  return [axis.door, axis.axis, written || "none", reasons || "none"];
}

function variantLines(facts: UiFacts): string[] {
  const report = facts.composition.variants;
  const unclaimable = (axis: AxisUse): boolean => Object.keys(axis.unresolved).length > 0;
  const valuesOf = (pick: (axis: AxisUse, uses: number) => boolean): string[][] =>
    report.axes.flatMap((axis) =>
      axis.values.filter((value) => pick(axis, totalUses(value))).map((value) => [axis.door, axis.axis, value.value, value.tags.join(", ")]),
    );
  return [
    "### Variant use",
    "",
    `Read ${report.sitesRead} primitive axis writes. Cells are literal writes, plus writes reached through a same-file const map, conditional or fallback after the plus. ${report.spreadSites} primitive elements spread props; the literal ones are read as writes, and the lint rule keeps every other spread free of variant axes.`,
    "",
    `Declared axes whose values the syntax could not fully read (${report.unreadAxes.length}): ${report.unreadAxes.join(", ") || "none"}. Their census is a lower bound.`,
    "",
    ...table(["door", "axis", "values written (literal+resolved sites)", "still unresolved"], report.axes.map(variantRow)),
    `#### Zero uses on an axis with nothing unresolved (${valuesOf((axis, uses) => uses === 0 && !unclaimable(axis)).length})`,
    "",
    ...table(
      ["door", "axis", "value", "tags"],
      valuesOf((axis, uses) => uses === 0 && !unclaimable(axis)),
    ),
    `#### Zero uses on an axis with unresolved uses: not claimable (${valuesOf((axis, uses) => uses === 0 && unclaimable(axis)).length})`,
    "",
    ...table(
      ["door", "axis", "value", "tags"],
      valuesOf((axis, uses) => uses === 0 && unclaimable(axis)),
    ),
    `#### One use (${valuesOf((_axis, uses) => uses === 1).length})`,
    "",
    ...table(
      ["door", "axis", "value", "tags"],
      valuesOf((_axis, uses) => uses === 1),
    ),
  ];
}

export function compositionLines(facts: UiFacts, inScope: (section: string) => boolean): string[] {
  const { skeletons, scans } = facts.composition;
  return [
    "## Composition (areas C and F)",
    "",
    `Skeletons read from ${scans.skeletonFiles} surface and context-tab files (${skeletons.map((cohort) => `${cohort.name} ${cohort.members.length}`).join(", ")}).`,
    "",
    ...basisLines(facts),
    "### Surface skeletons",
    "",
    "Families group on the frame: the template tree (T) of the file, or its root elements when it renders no template. Each file also keeps its full skeleton: the ordered tree of templates (T), composites (C), primitives (P) and local components (L, name dropped), four levels deep, props and text ignored, raw elements transparent, a repeated sibling written `x*`.",
    "",
    ...skeletons.flatMap((cohort) => skeletonLines(cohort, inScope)),
    ...structureLines(facts, inScope),
    ...readLines(facts, inScope),
    ...feedbackLines(facts, inScope),
    ...formLines(facts, inScope),
    ...variantLines(facts),
    "### What the composition columns cannot see",
    "",
    ...COMPOSITION_CANNOT_SEE.map((line) => `- ${line}`),
    "",
  ];
}
