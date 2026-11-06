// The hand-rolling census section: counts per category and per surface, the owners ranked by what they would retire, and the hits that stay.
import type { UiFacts } from "./analysis.ts";
import type { Category, Hit, KeepCode, Verdict } from "./hand-model.ts";
import { CATEGORIES, KEEP_REASONS, VERDICTS } from "./hand-model.ts";
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
  const limit = listing ? Number.POSITIVE_INFINITY : TOP;
  return [
    "## Hand-rolling census",
    "",
    `${hits.length} hits across the client and ui sources: ${count(hits, actionable)} to move (token, recipe, primitive or decide), ${count(hits, (hit) => !actionable(hit))} that stay.`,
    "Each hit names the token, recipe prop or primitive that owns it, or the one it asks for. Command: `pnpm ui-facts --only=hand-rolling` lists every hit.",
    "",
    ...categoryLines(hits),
    ...surfaceLines(hits),
    ...rankingLines(hits, limit),
    ...decisionLines(hits, limit),
    ...keepLines(hits),
    "### What the census cannot see",
    "",
    ...HAND_ROLLING_CANNOT_SEE.map((line) => `- ${line}`),
    "",
    ...(listing ? listingLines(hits) : []),
  ];
}
