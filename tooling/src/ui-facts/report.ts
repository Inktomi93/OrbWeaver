// The readable report. It leads with the owner's question: how much of the drift is not using the system, and how much is the system not covering the need.
import { HAND_ROLLING_PART } from "../eslint/index.ts";
import type { Comparison } from "../floor/verdict/cohort-compare.ts";
import type { UiFacts } from "./analysis.ts";
import { isClassified } from "./analysis.ts";
import { CLASSIFICATION_RULE, CLUSTER_MIN_FILES, LITERAL_MIN_FILES, LITERAL_MIN_SITES } from "./classify.ts";
import { compositionLines } from "./composition-report.ts";
import { handRollingLines } from "./hand-report.ts";
import { groupBy, table } from "./markdown.ts";
import { CANNOT_SEE, NOT_LINTABLE, ruleCandidates } from "./rules.ts";
import type { Classified, Site, SiteClass } from "./sites.ts";
import { KINDS, SITE_CLASSES } from "./sites.ts";

const FULL_RUN_OUTLIER_CAP = 8;
const TOP = 25;
const PERCENT = 100;
const VARIANT_SITES = 3;
const VARIANT_SECTIONS = 3;

const at = (site: Site): string => `${site.path}:${site.line}`;
const pct = (part: number, whole: number): string => (whole === 0 ? "0%" : `${Math.round((part / whole) * PERCENT)}%`);

const distinct = (sites: readonly Site[], pick: (site: Site) => string): number => new Set(sites.map(pick)).size;

interface Scope {
  readonly facts: UiFacts;
  readonly inScope: (section: string) => boolean;
  readonly sites: readonly (Site | Classified)[];
  readonly classified: readonly Classified[];
}

function scopeOf(facts: UiFacts): Scope {
  const selection = facts.selection;
  const inScope = (section: string): boolean => selection === null || selection.includes(section);
  const sites = facts.sites.filter((site) => inScope(site.section));
  return { facts, inScope, sites, classified: sites.filter(isClassified) };
}

function splitLines(scope: Scope): string[] {
  const total = scope.classified.length;
  const count = (cls: SiteClass): number => scope.classified.filter((site) => site.cls === cls).length;
  const gap = count("system-gap") + count("missing-composite") + count("token-gap");
  return [
    "## The split: bypass or gap",
    "",
    `${total} classified client sites (hand-rolled values and raw elements outside the owner layers).`,
    `Class 1, bypass (a primitive or token does this today): **${count("bypass")}** (${pct(count("bypass"), total)}).`,
    `Classes 2 to 4, the system does not cover the need: **${gap}** (${pct(gap, total)}).`,
    "",
    ...table(
      ["class", "sites", "share"],
      SITE_CLASSES.map((cls) => [cls, count(cls), pct(count(cls), total)]),
    ),
    "### Classification rule",
    "",
    ...CLASSIFICATION_RULE.map((line) => `- ${line}`),
    "",
    `Thresholds: a cluster in ${CLUSTER_MIN_FILES}+ files; a literal at ${LITERAL_MIN_SITES}+ sites in ${LITERAL_MIN_FILES}+ files.`,
    "",
  ];
}

function rankingLines(scope: Scope, area: "A" | "B"): string[] {
  const rows = [
    ...groupBy(
      scope.sites.filter((site) => KINDS[site.kind]?.area === area && site.layer === "client" && !site.ownerLayer),
      (site) => site.kind,
    ),
  ].map(([kind, sites]) => {
    const info = KINDS[kind];
    const classes = sites.filter(isClassified);
    const share = (cls: SiteClass): number => classes.filter((site) => site.cls === cls).length;
    return {
      cells: [
        kind,
        sites.length,
        distinct(sites, (site) => site.path),
        distinct(sites, (site) => site.section),
        info?.replacement ?? "none exists",
        info?.guard ?? "unguarded",
        `${share("bypass")}/${share("system-gap")}/${share("missing-composite")}/${share("token-gap")}/${share("one-off")}`,
      ],
      count: sites.length,
      replaceable: info?.replacement !== null,
    };
  });
  rows.sort((a, b) => Number(b.replaceable) - Number(a.replaceable) || b.count - a.count);
  return [
    `## Ranking ${area}: ${area === "A" ? "hand-rolled CSS and geometry" : "hand-rolled HTML"}`,
    "",
    "Replaceable kinds first, then by count. Split column is bypass/gap/composite/token/one-off.",
    "",
    ...table(
      ["kind", "sites", "files", "sections", "replacement", "guard", "split"],
      rows.map((row) => row.cells),
    ),
  ];
}

function overrideLines(scope: Scope): string[] {
  const gaps = scope.classified.filter((site) => site.cls === "system-gap");
  const groups = [...groupBy(gaps, (site) => site.group ?? "")].map(([key, sites]) => ({ key, sites, sections: distinct(sites, (site) => site.section) }));
  groups.sort((a, b) => b.sites.length - a.sites.length);
  const perElement = [...groupBy(gaps, (site) => site.tag ?? "?")].map(([tag, sites]) => [tag, sites.length, distinct(sites, (site) => site.section)] as const);
  perElement.sort((a, b) => b[1] - a[1]);
  return [
    "## Class 2: system gaps, grouped by element and override",
    "",
    `${VARIANT_SITES} sites or ${VARIANT_SECTIONS} sections on one override read as one missing variant.`,
    "",
    ...table(
      ["element / kind / override", "sites", "sections", "verdict", "first site"],
      groups
        .slice(0, TOP)
        .map((group) => [
          group.key,
          group.sites.length,
          group.sections,
          group.sites.length >= VARIANT_SITES || group.sections >= VARIANT_SECTIONS ? "one missing variant" : "local",
          at(group.sites[0] ?? gaps[0] ?? ({} as Site)),
        ]),
    ),
    "### Elements with the most overrides",
    "",
    ...table(["element", "override sites", "sections"], perElement.slice(0, TOP)),
  ];
}

function compositeLines(scope: Scope, facts: UiFacts): string[] {
  const composites = [
    ...groupBy(
      scope.classified.filter((site) => site.cls === "missing-composite"),
      (site) => site.group ?? "",
    ),
  ]
    .map(([key, sites]) => ({ key, sites, name: sites[0]?.fix ?? "?" }))
    .sort((a, b) => b.sites.length - a.sites.length);
  const tokens = [
    ...groupBy(
      scope.classified.filter((site) => site.cls === "token-gap"),
      (site) => site.group ?? "",
    ),
  ]
    .map(([key, sites]) => ({ key, sites }))
    .sort((a, b) => b.sites.length - a.sites.length);
  return [
    "## Class 3: missing composites",
    "",
    ...table(
      ["proposed name", "class string", "sites", "files", "sample"],
      composites
        .slice(0, TOP)
        .map((entry) => [entry.name, entry.key, entry.sites.length, distinct(entry.sites, (site) => site.path), at(entry.sites[0] ?? ({} as Site))]),
    ),
    "### Markup shapes in 3+ files (raw element trees)",
    "",
    ...table(
      ["shape", "files", "sample"],
      facts.shapes.slice(0, TOP).map((shape) => [shape.signature, shape.files, shape.sites[0] ?? ""]),
    ),
    "## Class 4: token gaps",
    "",
    ...table(
      ["kind / literal", "sites", "files", "sample"],
      tokens.slice(0, TOP).map((entry) => [entry.key, entry.sites.length, distinct(entry.sites, (site) => site.path), at(entry.sites[0] ?? ({} as Site))]),
    ),
  ];
}

function adoptionLines(scope: Scope): string[] {
  const rows = scope.facts.adoption.filter((row) => scope.inScope(row.section));
  return [
    "## Primitive adoption per section",
    "",
    "Share is primitive elements over raw plus primitive elements, lowest first.",
    "",
    ...table(
      ["section", "raw", "primitive", "composite", "local", "share"],
      rows.map((row) => [row.section, row.raw, row.ui, row.composite, row.local, pct(row.share, 1)]),
    ),
  ];
}

function sectionLines(scope: Scope): string[] {
  const sections = scope.facts.sections.filter((section) => scope.inScope(section));
  const rows = sections.map((section) => {
    const sites = scope.sites.filter((site) => site.section === section && site.layer === "client" && !site.ownerLayer);
    const count = (cls: SiteClass): number => sites.filter((site) => isClassified(site) && site.cls === cls).length;
    const adoption = scope.facts.adoption.find((row) => row.section === section);
    return [
      section,
      sites.filter((site) => KINDS[site.kind]?.area === "A").length,
      sites.filter((site) => KINDS[site.kind]?.area === "B").length,
      count("bypass"),
      count("system-gap"),
      count("missing-composite"),
      count("token-gap"),
      count("one-off"),
      adoption === undefined ? "n/a" : pct(adoption.share, 1),
    ];
  });
  rows.sort((a, b) => Number(b[1]) + Number(b[2]) - (Number(a[1]) + Number(a[2])));
  return ["## Sections", "", ...table(["section", "A sites", "B sites", "bypass", "gap", "composite", "token", "one-off", "adoption"], rows)];
}

function comparisonLines(scope: Scope): string[] {
  const full = scope.facts.selection === null;
  const out: string[] = [
    "## Cohorts: majority and outliers",
    "",
    full
      ? `Full run: ${FULL_RUN_OUTLIER_CAP} outliers listed per column; the JSON holds all.`
      : "Majorities are over the whole client; outliers are the selected sections.",
    "",
  ];
  const byCohort = groupBy(scope.facts.comparisons, (entry) => entry.cohort);
  for (const [cohort, comparisons] of byCohort) {
    const what = scope.facts.cohorts.find((entry) => entry.name === cohort)?.what ?? "";
    out.push(`### ${cohort}`, "", what, "");
    out.push(
      ...table(
        ["column", "basis", "majority", "votes", "tied", "distribution"],
        comparisons.map((entry) => [
          entry.column,
          entry.basis ?? "unlabelled",
          entry.majority,
          `${entry.votes}/${entry.total}`,
          entry.tied ? "yes" : "no",
          Object.entries(entry.distribution)
            .map(([value, count]) => `${value} ${count}`)
            .join("; "),
        ]),
      ),
    );
    for (const entry of comparisons) {
      out.push(...outlierBlock(scope, entry, full));
    }
  }
  return out;
}

function outlierBlock(scope: Scope, entry: Comparison, full: boolean): string[] {
  const defects = entry.defects.filter((outlier) => scope.inScope(outlier.section));
  const defectBlock =
    defects.length === 0
      ? []
      : [
          `${entry.cohort} / ${entry.column}: ${defects.length} defect(s) whatever the majority`,
          "",
          ...table(
            ["at", "member", "value"],
            defects.map((outlier) => [outlier.at, outlier.label, outlier.value]),
          ),
        ];
  const shown = entry.outliers.filter(
    (outlier) => scope.inScope(outlier.section) && !defects.some((defect) => defect.at === outlier.at && defect.value === outlier.value),
  );
  if (shown.length === 0) {
    return defectBlock;
  }
  const rows = (full ? shown.slice(0, FULL_RUN_OUTLIER_CAP) : shown).map((outlier) => [outlier.at, outlier.label, outlier.value]);
  return [
    ...defectBlock,
    `${entry.cohort} / ${entry.column}: ${shown.length} outlier(s) from "${entry.majority}"`,
    "",
    ...table(["at", "member", "value"], rows),
  ];
}

function duplicateLines(scope: Scope): string[] {
  const groups = scope.facts.duplicates.filter((group) => group.copies.some((copy) => scope.inScope(copy.section)));
  return [
    "## Duplicated maps (area E)",
    "",
    ...table(
      ["keys", "copies", "identical values", "at"],
      groups
        .slice(0, TOP)
        .map((group) => [
          group.keys.join(", "),
          group.copies.length,
          group.identical ? "yes" : "no",
          group.copies.map((copy) => `${copy.name} ${copy.at}`).join("; "),
        ]),
    ),
  ];
}

function siteLines(scope: Scope): string[] {
  const full = scope.facts.selection === null;
  const out: string[] = ["## Sites", "", full ? "Top sites per kind; the JSON holds every site." : "Every selected site.", ""];
  for (const [kind, sites] of groupBy(
    scope.sites.filter((site) => !site.ownerLayer && site.layer === "client"),
    (site) => site.kind,
  )) {
    const shown = full ? sites.slice(0, FULL_RUN_OUTLIER_CAP) : sites;
    out.push(
      `### ${kind} (${sites.length})`,
      "",
      ...table(
        ["at", "detail", "class", "fix"],
        shown.map((site) => [at(site), site.detail, isClassified(site) ? site.cls : "n/a", isClassified(site) ? (site.fix ?? "") : ""]),
      ),
    );
  }
  return out;
}

function ruleLines(facts: UiFacts): string[] {
  return [
    "## Findings that could become a lint rule",
    "",
    ...table(
      ["candidate", "engine", "polices", "extends", "hits"],
      ruleCandidates(facts).map((rule) => [rule.id, rule.engine, rule.polices, rule.extends ?? "new rule", rule.hits]),
    ),
    "## Findings that need a decision first (not lint)",
    "",
    ...table(
      ["finding", "needs"],
      NOT_LINTABLE.map((entry) => [entry.finding, entry.needs]),
    ),
  ];
}

/** `parts` names the report parts to print alone; empty prints the whole report. */
export function renderReport(facts: UiFacts, command: string, parts: readonly string[] = []): string {
  const scope = scopeOf(facts);
  const scanned = facts.scanned;
  const head = [
    "# UI facts",
    "",
    `Command: \`${command}\``,
    `Scanned ${scanned.total} files: ${scanned.ts} ts, ${scanned.tsx} tsx, ${scanned.css} css (client ${scanned.client}, ui ${scanned.ui}). In selection: ${scanned.inSelection}.`,
    facts.selection === null ? "Selection: the whole client." : `Selection: ${facts.selection.join(", ")} (majorities are still over the whole client).`,
    `Exceptions applied: ${facts.excepted.length}.`,
    "",
  ];
  if (parts.includes(HAND_ROLLING_PART)) {
    return [...head, ...handRollingLines(facts, scope.inScope, true)].join("\n");
  }
  return [
    ...head,
    ...splitLines(scope),
    ...adoptionLines(scope),
    ...overrideLines(scope),
    ...compositeLines(scope, facts),
    ...rankingLines(scope, "A"),
    ...rankingLines(scope, "B"),
    ...sectionLines(scope),
    ...comparisonLines(scope),
    ...compositionLines(facts, scope.inScope),
    ...duplicateLines(scope),
    ...handRollingLines(facts, scope.inScope, false),
    ...ruleLines(facts),
    "## What this cannot see",
    "",
    ...CANNOT_SEE.map((line) => `- ${line}`),
    "",
    ...siteLines(scope),
  ].join("\n");
}
