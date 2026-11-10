// The ranked view of a brand-flow scan and the readable report. Ranking follows how real a site is: a brand laundered
// through a string first, then contract and port slots, then client state, then local helpers.
import { isProduction } from "../unwired/index.ts";
import type { BrandFlowReport } from "./scan.ts";
import type { Layer, MintSite, Provenance, VocabField, Where, WidenSite } from "./types.ts";

/** 1 a brand laundered through a string; 2 a contract or port slot; 3 client state; 4 a local helper; 5 library slots and unproven compares. */
const TIER = { laundered: 1, wire: 2, state: 3, local: 4, minor: 5 } as const;
const TIERS = Object.values(TIER);
type Tier = (typeof TIER)[keyof typeof TIER];
const { laundered: LAUNDERED, wire: WIRE, state: STATE, local: LOCAL, minor: MINOR } = TIER;

export interface RankedSite extends Where {
  readonly tier: Tier;
  readonly klass: "renarrow" | "widen" | "mint" | "missing";
  readonly what: string;
  readonly fix: string;
  readonly provenance: Provenance;
}

// A schema-input or unknown layer has no tier: the first is by design, the second could not be read.
const LAYER_TIER: Readonly<Partial<Record<Layer, Tier>>> = { contract: WIRE, port: WIRE, "client-state": STATE, local: LOCAL, library: MINOR };

const isDefectLayer = (widen: WidenSite): boolean => LAYER_TIER[widen.layer] !== undefined;

const RAW_FIX: Readonly<Record<string, string>> = {
  "http-param": "parse the route param with typeIdSchema(ID_PREFIX.x) before it reaches a handler",
  "db-row": "type the column with .$type<Brand>() so the row read is already branded",
  "contract-property": "brand the contract field (typeIdSchema in the schema) so the consumer needs no cast",
  parameter: "type the parameter as the brand at its callers, then drop the cast",
  variable: "type the variable as the brand where it is first assigned",
  call: "return the brand from the callee, then drop the cast",
  template: "build the id with mintTypeId or parse the composed text with typeIdSchema",
  property: "brand the declared property, then drop the cast",
  other: "parse at the boundary that produced the string",
};

const where = ({ file, line, pkg, position }: Where): Where => ({ file, line, pkg, position });

function rankedMint(mint: MintSite): RankedSite {
  const shape = mint.shape ?? "other";
  return {
    ...where(mint),
    tier: shape === "contract-property" ? WIRE : LOCAL,
    klass: "mint",
    what: `${mint.via} ${mint.brand} from a raw string (${shape}): ${mint.source}`,
    fix: RAW_FIX[shape] ?? "parse at the boundary",
    provenance: mint.provenance,
  };
}

function rankedWiden(widen: WidenSite): RankedSite {
  const brand = widen.brands.join(" | ");
  return {
    ...where(widen),
    tier: LAYER_TIER[widen.layer] ?? MINOR,
    klass: "widen",
    what: `${brand} into plain string slot ${widen.slot.name} [${widen.slot.kind}, ${widen.layer}]`,
    fix: widen.slot.kind === "state" ? `useState<${brand}> and brand the setter's argument` : `declare ${widen.slot.name} as ${brand}`,
    provenance: widen.provenance,
  };
}

/** Production sites only, worst first. A test or tooling file is counted in the report but never ranked. */
export function rank(report: BrandFlowReport): RankedSite[] {
  const production = <T extends Where>(sites: readonly T[]): T[] => sites.filter((site) => isProduction(site.file));
  const ranked: RankedSite[] = [
    ...production(report.renarrows).map(
      (site): RankedSite => ({
        ...where(site),
        tier: site.proof === "slot-widened" ? LAUNDERED : MINOR,
        klass: "renarrow",
        what: `${site.how} to ${site.brand} from a string ${site.proof === "slot-widened" ? `widened at ${site.via.join("; ")}` : "(no widen edge found)"}: ${site.source}`,
        fix: "keep the value branded through its slot: type the slot as the brand, and delete this cast or comparison",
        provenance: site.provenance,
      }),
    ),
    ...production(report.mints)
      .filter((mint) => mint.mintClass === "raw" && (mint.via === "castId" || mint.via === "as"))
      .map(rankedMint),
    ...production(report.widens).filter(isDefectLayer).map(rankedWiden),
    ...production(report.missing).map(
      (site): RankedSite => ({
        ...where(site),
        tier: LAYER_TIER[site.layer] ?? LOCAL,
        klass: "missing",
        what: `${site.name}: string (${site.declKind}${site.owner === null ? "" : ` of ${site.owner}`}) where ${site.brand} exists (${site.match} match)`,
        fix: `declare ${site.name} as ${site.brand}`,
        provenance: site.provenance,
      }),
    ),
  ];
  return ranked.sort((a, b) => a.tier - b.tier || a.file.localeCompare(b.file) || a.line - b.line);
}

const table = (header: readonly string[], rows: readonly (readonly (string | number)[])[]): string[] => [
  `| ${header.join(" | ")} |`,
  `| ${header.map(() => "---").join(" | ")} |`,
  ...rows.map((row) => `| ${row.join(" | ")} |`),
];

const tally = <T>(items: readonly T[], key: (item: T) => string): Map<string, number> => {
  const counted = new Map<string, number>();
  for (const item of items) {
    counted.set(key(item), (counted.get(key(item)) ?? 0) + 1);
  }
  return counted;
};

const TOP = 25;
const byName = ([a]: readonly [string, number], [b]: readonly [string, number]): number => a.localeCompare(b);

// What the scan can turn into a rule, and what keeps each from being one yet.
const LINT_PROPOSALS = [
  "- **Strip a brand with `as string`**: type-aware, measured, no false positives on the checker's own word. Already in the unsafe-cast rule on `wt/agent-a4e2237d754303347` (STRIPPED_BRAND); land it there.",
  "- **`castId` or `as Brand` of a plain `string` operand** (class 1, raw): type-aware and measured. The unsafe-cast rule refuses an `unknown` or `any` operand only; a `string` operand outside a literal, a `typeIdSchema` parse or a home file is the same lie. Needs a homes list for the real trusted seams (route params, row reads) before it can be an error.",
  "- **Widen-then-renarrow** (class 3): not a per-file rule. It needs the widen edge and the cast joined across files, which is what this tool does. A lint rule could catch the in-file case only: a `useState<string>` whose setter takes a brand and whose state is later compared to, or cast to, a brand.",
  "- **`useState<string>` fed a brand** (class 2, client state): held at zero by `orb/no-raw-id`.",
  "- **Id-named declaration typed `string`** (class 4): held at zero by `orb/no-raw-id` for a declared `string` annotation on an exact, qualifier or alias match, by the same name table as this report. Suffix matches stay report-only: a trailing word guesses (`providerMessageId` is a provider's handle). A destructured or unannotated name takes its source's type, so the source carries the fix.",
  "- **Widen into a contract or port slot** (class 2, tier 2): the fix is declaring the slot as the brand, so the rule is the declaration check above, not an edge check.",
  "- **Cross-brand by name** (class 5): heuristic, report-only. The measured cases are already compile errors.",
];

// What the scan does not see, so a clean count is not read as a clean tree.
const BLIND = [
  "A widen through `any`, `unknown` or a generic parameter: the contextual type is not a string, so no edge is recorded.",
  "A brand that reaches a string through a spread, a destructure of a mapped type, or an index access (`record[chatId]`): only call arguments, returns, property values, JSX props, declarations, assignments and one-level collection elements are read.",
  "A template literal is not read as a widen; a brand interpolated into display text or a cache key is not a defect.",
  "A re-narrow is joined to a widen by the declaration of the name the cast reads. A value passed through a second variable, an array element or a closure is not followed.",
  "`parsed` is a text shape (a `.parse(` call in the operand or its initializer, or a zod hook around the cast), not a proof the parse checks the prefix.",
  "A brand declared outside the ids module is found only when the checker meets it as an intersection assignable to `Branded<string>`; a hand-rolled brand with another shape is not.",
  "Id-named declarations are matched by name; `memberId`, `actorId`, a DOM id and a plugin-defined id have no brand and are listed apart.",
];

const VALUE_WIDTH = 90;

// The string-typed kind, status and role fields, most values first. The fields are reported, never judged closed.
function vocabLines(fields: readonly VocabField[]): string[] {
  const seen = fields.filter((field) => field.values.length > 0);
  return [
    `## Closed vocabularies: ${fields.length} string-typed kind, status and role fields; ${seen.length} with a literal value seen in production`,
    "",
    ...table(
      ["field", "owner", "where", "values observed", "assigned", "compared", "case"],
      seen
        .slice(0, TOP)
        .map((field) => [
          field.name,
          field.owner ?? "",
          `${field.file}:${field.line}`,
          field.values.join(", ").slice(0, VALUE_WIDTH),
          field.assigned,
          field.compared,
          field.cased,
        ]),
    ),
  ];
}

export function renderReport(report: BrandFlowReport, ranked: readonly RankedSite[]): string {
  const production = <T extends Where>(sites: readonly T[]): T[] => sites.filter((site) => isProduction(site.file));
  const castIds = report.mints.filter((mint) => mint.via === "castId");
  const castByClass = tally(castIds, (mint) => mint.mintClass);
  const rawByShape = tally(
    castIds.filter((mint) => mint.mintClass === "raw"),
    (mint) => mint.shape ?? "other",
  );
  const packages = [...new Set([...report.mints, ...report.widens, ...report.missing, ...report.renarrows].map((site) => site.pkg))].sort();
  const by = (sites: readonly Where[]): Map<string, number> => tally(sites, (site) => site.pkg);
  const columns = {
    "raw mint": by(report.mints.filter((mint) => mint.mintClass === "raw")),
    widen: by(report.widens.filter(isDefectLayer)),
    "re-narrow": by(report.renarrows.filter((site) => site.proof === "slot-widened")),
    missing: by(report.missing),
  };
  const lines = [
    "# brand-flow",
    "",
    `Scanned ${report.scanned.files} files in ${report.worlds.length} worlds (${report.scanned.production} production). Double counted: ${report.scanned.doubleCounted}.`,
    `Brands known: ${report.brands.length}. Worlds with no ids module: ${report.worlds.filter((world) => world.brandless).length}.`,
    "",
    "## Counts per class by package",
    "",
    ...table(
      ["package", ...Object.keys(columns)],
      packages.map((pkg) => [pkg, ...Object.values(columns).map((counts) => counts.get(pkg) ?? 0)]),
    ),
    "",
    "## Mint",
    "",
    `castId calls: ${castIds.length}. parsed ${castByClass.get("parsed") ?? 0}, literal ${castByClass.get("literal") ?? 0}, rebrand ${castByClass.get("rebrand") ?? 0}, raw string ${castByClass.get("raw") ?? 0} (the smuggle).`,
    `Raw castId by shape: ${[...rawByShape].map(([shape, total]) => `${shape} ${total}`).join(", ") || "none"}.`,
    "",
    ...table(["via", "sites"], [...tally(report.mints, (mint) => mint.via)].sort(byName)),
    "",
    `Sandbox wire declarations: ${production(report.sandboxWire).length}. The wire keeps the id family declared by SandboxWireId.`,
    "",
    "## Widen (production files)",
    "",
    "A `schema-input` slot is declared as a brand schema, whose zod input type is `string` by design; an `unknown` slot's declaration could not be read. Neither is a defect count.",
    "",
    ...table(["layer", "sites"], [...tally(production(report.widens), (widen) => widen.layer)].sort(byName)),
    "",
    ...table(["slot kind", "sites"], [...tally(production(report.widens), (widen) => widen.slot.kind)].sort(byName)),
    "",
    `## Re-narrow (a brand laundered through a string): ${report.renarrows.filter((site) => site.proof === "slot-widened").length}`,
    "",
    `## Cross-brand: ${report.crossBrand.length} (${report.crossBrand.filter((site) => site.provenance === "measured").length} measured)`,
    "",
    `## Missing: ${report.missing.length} id-named declarations typed string where a brand exists; ${report.generic.reduce((sum, entry) => sum + entry.count, 0)} more have no brand`,
    "",
    ...table(["brand", "declarations"], [...tally(report.missing, (site) => site.brand)].sort(([, a], [, b]) => b - a).slice(0, TOP)),
    "",
    "Generic ids (no brand, not defects), most declared first:",
    "",
    ...table(
      ["name", "count", "packages"],
      report.generic.slice(0, TOP).map((entry) => [entry.name, entry.count, entry.packages.join(", ")]),
    ),
    "",
    ...vocabLines(report.vocabularies),
    "",
    `## Top real sites (production only; ${production(ranked).length} ranked)`,
  ];
  for (const tier of TIERS) {
    const sites = ranked.filter((site) => site.tier === tier);
    lines.push("", `### Tier ${tier}: ${sites.length}`, "");
    for (const site of sites.slice(0, TOP)) {
      lines.push(`- \`${site.file}:${site.line}\` [${site.klass}, ${site.provenance}] ${site.what}. Fix: ${site.fix}.`);
    }
  }
  lines.push("", "## Lint candidates", "", ...LINT_PROPOSALS, "", "## What the scan cannot see", "", ...BLIND.map((line) => `- ${line}`), "");
  return lines.join("\n");
}
