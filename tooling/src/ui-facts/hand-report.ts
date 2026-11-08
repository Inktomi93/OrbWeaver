// The hand-rolling census section: counts per category and per surface, the owners ranked by what they would retire, and the hits that stay.
import type { Category, Hit, KeepCode, Verdict } from "../eslint/index.ts";
import { baseOf, CATEGORIES, KEEP_REASONS, PLAIN_LAYOUT, PLAIN_LAYOUT_RULE, plainLayout, VERDICTS } from "../eslint/index.ts";
import type { UiFacts } from "./analysis.ts";
import type { NoRowUse, UnfollowedUse } from "./hand-classes.ts";
import { groupBy, table } from "./markdown.ts";
import { HAND_ROLLING_CANNOT_SEE } from "./rules.ts";

const TOP = 30;
const SAMPLES = 2;

const at = (hit: Hit): string => `${hit.path}:${hit.line}`;
const actionable = (hit: Hit): boolean => hit.verdict !== "keep";
const count = (hits: readonly Hit[], test: (hit: Hit) => boolean): number => hits.filter(test).length;

/** Largest group first, then by key, so equal runs print equal reports. */
function ranked(hits: readonly Hit[], key: (hit: Hit) => string): readonly (readonly [string, readonly Hit[]])[] {
  return [...groupBy(hits, key)].sort((left, right) => right[1].length - left[1].length || left[0].localeCompare(right[0]));
}

const distinct = (hits: readonly Hit[], pick: (hit: Hit) => string): number => new Set(hits.map(pick)).size;
const samples = (hits: readonly Hit[]): string => hits.slice(0, SAMPLES).map(at).join(", ");

function categoryLines(hits: readonly Hit[]): string[] {
  const rows = CATEGORIES.map((category: Category) => {
    const own = hits.filter((hit) => hit.category === category);
    return [category, own.length, ...VERDICTS.map((verdict: Verdict) => count(own, (hit) => hit.verdict === verdict))];
  });
  return ["### Hits per category", "", ...table(["category", "hits", ...VERDICTS], rows)];
}

function surfaceLines(hits: readonly Hit[]): string[] {
  const rows = ranked(hits.filter(actionable), (hit) => hit.section).map(([section, own]) => [
    section,
    own.length,
    ...CATEGORIES.map((category: Category) => count(own, (hit) => hit.category === category)),
    count(hits, (hit) => hit.section === section && !actionable(hit)),
  ]);
  return [
    "### Hits per surface",
    "",
    "Surfaces with an actionable hit, most first. The last column counts the surface's keep hits.",
    "",
    ...table(["surface", "actionable", ...CATEGORIES, "keep"], rows),
  ];
}

function rankingLines(hits: readonly Hit[], limit: number): string[] {
  const rows = ranked(hits.filter(actionable), (hit) => hit.owner)
    .slice(0, limit)
    .map(([owner, own]) => [owner, own[0]?.verdict ?? "", own.length, distinct(own, (hit) => hit.category), distinct(own, (hit) => hit.section), samples(own)]);
  return [
    "### Owners ranked by the hits each would retire",
    "",
    "The owner is the token, recipe prop or primitive that exists, or the one a hit asks for. A `new token` or `decide` owner needs a ruling.",
    "",
    ...table(["owner", "verdict", "retires", "categories", "surfaces", "first sites"], rows),
  ];
}

function decisionLines(hits: readonly Hit[], limit: number): string[] {
  const asks = hits.filter((hit) => hit.verdict === "decide" || hit.owner.startsWith("new token:"));
  const rows = ranked(asks, (hit) => hit.owner)
    .slice(0, limit)
    .map(([owner, own]) => [owner, own.length, distinct(own, (hit) => hit.path), samples(own)]);
  return ["### Owners that do not exist yet", "", ...table(["owner asked for", "hits", "files", "first sites"], rows)];
}

function keepLines(hits: readonly Hit[]): string[] {
  const kept = hits.filter((hit) => hit.keep !== null);
  const rows = ranked(kept, (hit) => hit.keep ?? "").map(([code, own]) => [
    code,
    own.length,
    distinct(own, (hit) => hit.section),
    KEEP_REASONS[code as KeepCode],
    samples(own),
  ]);
  return ["### Hits that stay", "", ...table(["keep", "hits", "surfaces", "why", "first sites"], rows)];
}

/** What the rows do not cover: class uses on primitives no judgement claims, by class and by component, so a clean row count cannot read as a clean tree. */
function noRowLines(all: readonly NoRowUse[], limit: number): string[] {
  const sum = (rows: readonly NoRowUse[]): number => rows.reduce((total, row) => total + row.uses, 0);
  const noRow = all.filter((row) => !plainLayout(row.token));
  const admitted = all.filter((row) => plainLayout(row.token));
  const byUses = (key: (row: NoRowUse) => string): readonly (readonly [string, number, number])[] =>
    [...groupBy(noRow, key)]
      .map(([name, rows]) => [name, sum(rows), rows.length] as const)
      .toSorted((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
      .slice(0, limit);
  return [
    "### Class uses with no row",
    "",
    PLAIN_LAYOUT_RULE,
    "",
    ...PLAIN_LAYOUT.map(({ pattern, why }) => `- \`${pattern.source}\`: ${why}.`),
    "",
    `The rule admits ${sum(admitted)} uses. ${sum(noRow)} uses are open: no table claims the class and the rule does not admit it.`,
    "",
    ...table(
      ["admitted by", "uses", "classes", "top components"],
      PLAIN_LAYOUT.map(({ pattern }) => {
        const own = admitted.filter((row) => pattern.test(baseOf(row.token).base));
        const components = [...groupBy(own, (row) => row.component)]
          .map(([name, rows]) => [name, sum(rows)] as const)
          .toSorted((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
          .slice(0, SAMPLES + 1)
          .map(([name, uses]) => `${name} ${uses}`);
        return [`\`${pattern.source}\``, sum(own), new Set(own.map((row) => row.token)).size, components.join(", ")];
      }),
    ),
    ...table(
      ["class", "uses", "components"],
      byUses((row) => row.token),
    ),
    ...table(
      ["component", "uses", "classes"],
      byUses((row) => row.component),
    ),
    ...table(
      ["class on component", "uses", "surfaces"],
      byUses((row) => `${row.token} on ${row.component}`),
    ),
  ];
}

/** Wrapper uses whose class lands nowhere the reader can follow: their unflagged classes are judged on no primitive. */
function unfollowedLines(all: readonly UnfollowedUse[], limit: number): string[] {
  const byComponent = [...groupBy(all, (use) => use.component)]
    .map(
      ([component, uses]) =>
        [
          component,
          uses.length,
          uses
            .slice(0, SAMPLES)
            .map((use) => use.at)
            .join(", "),
        ] as const,
    )
    .toSorted((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .slice(0, limit);
  return [
    "### Wrapper classes the reader cannot follow",
    "",
    `${all.length} class uses on client components land on no primitive the forward reader can reach: the component takes no \`className\`, computes where it lands, or sits past the hop limit. Only their flagged classes are judged.`,
    "",
    ...table(["component", "uses", "first sites"], byComponent),
  ];
}

function listingLines(hits: readonly Hit[]): string[] {
  const out = ["### Every actionable hit, by owner", ""];
  for (const [owner, own] of ranked(hits.filter(actionable), (hit) => hit.owner)) {
    out.push(
      `#### ${owner} (${own.length})`,
      "",
      ...table(
        ["at", "category", "written", "verdict", "reason"],
        own.map((hit) => [at(hit), hit.category, hit.detail, hit.verdict, hit.reason]),
      ),
    );
  }
  return out;
}

/** The census section. A full listing prints every hit; the summary prints the ranking tops and leaves the hits to the JSON. */
export function handRollingLines(facts: UiFacts, inScope: (section: string) => boolean, listing: boolean): string[] {
  const hits = facts.handRolling.filter((hit) => inScope(hit.section));
  const noRow = facts.noRow.filter((row) => inScope(row.section));
  const limit = listing ? Number.POSITIVE_INFINITY : TOP;
  return [
    "## Hand-rolling census",
    "",
    `${hits.length} hits across the client and ui sources: ${count(hits, actionable)} to move (token, recipe, primitive or decide), ${count(hits, (hit) => !actionable(hit))} that stay.`,
    `${noRow.reduce((total, row) => total + row.uses, 0)} class uses on \`@orb/ui\` elements, of ${new Set(noRow.map((row) => row.token)).size} distinct classes, earn no row; "Class uses with no row" lists them by the plain-layout rule row that admits each, and the open ones by class. Nothing under "What the census cannot see" is counted here.`,
    "Each hit names the token, recipe prop or primitive that owns it, or the one it asks for. Command: `pnpm ui-facts --only=hand-rolling` lists every hit.",
    "",
    ...categoryLines(hits),
    ...surfaceLines(hits),
    ...rankingLines(hits, limit),
    ...decisionLines(hits, limit),
    ...keepLines(hits),
    ...noRowLines(noRow, limit),
    ...unfollowedLines(
      facts.unfollowed.filter((use) => inScope(use.section)),
      limit,
    ),
    "### Arms the reader cannot open",
    "",
    `${facts.unreadArms.length} \`tv()\` arms build classes with an expression the reader cannot open, a call or an unresolved name, so the classes that expression writes are not seen, and a plan refuses a move onto such an arm.`,
    "",
    ...facts.unreadArms.slice(0, limit).map((arm) => `- \`${arm}\``),
    "",
    ...(facts.staleScopes.length === 0
      ? []
      : [
          "### Token scope rows with no token",
          "",
          "Each `orb.purpose` in `packages/ui/src/tokens/tokens.json` here covers no token the theme declares.",
          "",
          ...facts.staleScopes.map((row) => `- \`${row}\``),
          "",
        ]),
    "### What the census cannot see",
    "",
    ...HAND_ROLLING_CANNOT_SEE.map((line) => `- ${line}`),
    "",
    ...(listing ? listingLines(hits) : []),
  ];
}
