// The migration plan for one census owner: the exact class sites the class-token-to-prop codemod may move onto a recipe prop,
// the sites it must leave for review, and the proof that a rerun of the census closed them. A report: it moves nothing itself.
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { ComponentTables, Hit } from "../eslint/index.ts";
import { doorOf, kebab } from "../eslint/index.ts";
import { moveRefusal } from "./move-proof.ts";

/** One class token on one element, written where the census saw it. The codemod reads this shape; keep both in step. */
interface PlannedSite {
  readonly path: string;
  readonly line: number;
  /** The column of the string that holds the class; two elements can share a line. */
  readonly column: number;
  /** The import the element must resolve to: the module specifier and the exported name. */
  readonly source: string;
  readonly name: string;
  readonly attribute: "className";
  readonly token: string;
  readonly prop: string;
  readonly value: string;
}

interface ReviewSite {
  readonly path: string;
  readonly line: number;
  readonly token: string;
  readonly reason: string;
}

export interface MigrationPlan {
  readonly owner: string;
  readonly sites: readonly PlannedSite[];
  readonly review: readonly ReviewSite[];
}

/** A site the codemod read and left alone, with the reason it printed. */
export interface Skip {
  readonly path: string;
  readonly line: number;
  readonly token: string;
  readonly reason: string;
}

export interface Proof {
  readonly planned: number;
  readonly review: number;
  readonly remaining: readonly Hit[];
  /** Remaining sites that neither the plan nor the codemod gave a reason for. */
  readonly unexplained: readonly Hit[];
}

/** The recipe prop an owner names: `row.justify` is the `justify` axis. */
const propOf = (owner: string): string => owner.slice(owner.indexOf(".") + 1);

const OWNER_PATTERN = /^[a-z][a-z0-9-]*\.[A-Za-z][A-Za-z0-9]*$/u;
// An arm key that is a plain word is a string prop value. A `true` arm is a boolean prop, written as a JSX expression. A number is a
// typed prop, which the syntax cannot confirm, and a `false` arm is the prop's absence.
const STRING_ARM = /^[A-Za-z][A-Za-z0-9-]*$/u;
const TRUE_ARM = "true";
const NOT_STRING_ARMS: ReadonlySet<string> = new Set(["false", "null", "undefined"]);

const propValueOf = (arm: string): string => (arm === TRUE_ARM ? `{${arm}}` : arm);

export function isMigratableOwner(owner: string): boolean {
  return OWNER_PATTERN.test(owner);
}

/** The owner names a forwarded axis of a component. */
export function isDeclaredOwner(owner: string, tables: ComponentTables): boolean {
  return [...tables.values()].some((components) =>
    [...components].some(([name, recipe]) => owner === `${kebab(name)}.${propOf(owner)}` && recipe.axes.has(propOf(owner))),
  );
}

/** The rows the census ranks under an owner, plain or conditional: a plan with no site among them moved nothing it was asked to. */
export const rankedRows = (hits: readonly Hit[], owner: string): readonly Hit[] =>
  hits.filter((hit) => hit.category === "class-utility" && (hit.owner === owner || hit.owner === `${owner}, conditional`));

/**
 * The sidecar paths of a plan, next to its map. The codemod derives the skip folder from the same name, so a rename here
 * breaks the proof: `tooling/src/codemods/class-token-to-prop/scripts/codemod.ts` repeats this rule.
 */
export function sidecarsOf(map: string): { readonly files: string; readonly programs: string; readonly skips: string } {
  const base = map.replace(/\.json$/u, "");
  return { files: `${base}.files`, programs: `${base}.programs`, skips: `${base}.skips` };
}

function refusal(hit: Hit, owner: string, tables: ComponentTables): string | null {
  const element = hit.element;
  if (element === null) {
    return "the class is not written on a named @orb/ui component";
  }
  if (element.carried) {
    return `the class is written on a carrier that renders ${element.name}`;
  }
  if (!element.place.plain) {
    return "the class sits in a template literal, which the rewrite does not edit";
  }
  const recipe = tables.get(doorOf(element.source) ?? "")?.get(element.name);
  const arm = hit.match?.slice(owner.length + 1);
  const axis = recipe?.axes.get(propOf(owner));
  if (arm === undefined || axis === undefined || recipe === undefined) {
    return `no arm of ${owner} is read from ${element.name}`;
  }
  if (arm !== TRUE_ARM && (!STRING_ARM.test(arm) || NOT_STRING_ARMS.has(arm))) {
    return `arm "${arm}" is not a plain string prop value`;
  }
  const writing = axis.get(arm)?.tokens ?? [];
  // An arm of several classes moves when the class string holds every one of them: the prop then writes exactly what the string did.
  const worn = new Set([hit.detail, ...element.place.peers]);
  if (!(writing.includes(hit.detail) && writing.every((written) => worn.has(written)))) {
    return `arm "${arm}" writes ${writing.join(" ")}, which the class string does not hold whole`;
  }
  const sameClass = [...axis]
    .filter(([, written]) => written.tokens.includes(hit.detail) && written.tokens.every((token) => worn.has(token)))
    .map(([name]) => name);
  return sameClass.length === 1
    ? moveRefusal({ token: hit.detail, axis: propOf(owner), arm }, element, recipe)
    : `arms ${sameClass.join(", ")} all write ${hit.detail}`;
}

/** Plan one owner: recipe rows with that exact owner. A `, conditional` owner is a different group and never mechanical. */
export function planOwner(hits: readonly Hit[], tables: ComponentTables, owner: string): MigrationPlan {
  const planned: { readonly arm: string; readonly site: PlannedSite }[] = [];
  const review: ReviewSite[] = [];
  const refused = new Map<string, string>();
  const seen = new Set<string>();
  for (const hit of hits.filter((candidate) => candidate.category === "class-utility" && candidate.verdict === "recipe" && candidate.owner === owner)) {
    const key = `${hit.path}:${hit.line}:${hit.element?.place.column}:${hit.detail}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    const reason = refusal(hit, owner, tables);
    const arm = `${hit.path}:${hit.line}:${hit.element?.place.column}:${hit.match}`;
    if (reason !== null || hit.element === null || hit.match === null) {
      review.push({ path: hit.path, line: hit.line, token: hit.detail, reason: reason ?? "no arm names this class" });
      refused.set(arm, hit.detail);
      continue;
    }
    planned.push({
      arm,
      site: {
        path: hit.path,
        line: hit.line,
        column: hit.element.place.column,
        source: hit.element.source,
        name: hit.element.name,
        attribute: "className",
        token: hit.detail,
        prop: propOf(owner),
        value: propValueOf(hit.match.slice(owner.length + 1)),
      },
    });
  }
  // An arm moves whole or not at all: moving the classes that passed would write the classes that did not.
  const split = planned.filter(({ arm }) => refused.has(arm));
  review.push(
    ...split.map(({ arm, site }) => ({
      path: site.path,
      line: site.line,
      token: site.token,
      reason: `the arm moves whole, and ${refused.get(arm)} of it stays for review`,
    })),
  );
  return { owner, sites: planned.filter(({ arm }) => !refused.has(arm)).map(({ site }) => site), review };
}

/** The tsconfig that checks a file: the package that owns it. */
const programOf = (path: string): string => `${path.split("/").slice(0, 2).join("/")}/tsconfig.json`;

/** Write the map the codemod reads, and the lists the format and typecheck steps read. Clears the skips of an earlier run. */
export function writePlan(root: string, map: string, plan: MigrationPlan): void {
  const sidecars = sidecarsOf(map);
  mkdirSync(dirname(join(root, map)), { recursive: true });
  rmSync(join(root, sidecars.skips), { recursive: true, force: true });
  writeFileSync(join(root, map), `${JSON.stringify(plan, null, 2)}\n`);
  const lines = (values: Iterable<string>): string =>
    [...new Set(values)]
      .sort()
      .map((value) => `${value}\n`)
      .join("");
  writeFileSync(join(root, sidecars.files), lines(plan.sites.map((site) => site.path)));
  writeFileSync(join(root, sidecars.programs), lines(plan.sites.map((site) => programOf(site.path))));
}

export function readPlan(root: string, map: string): MigrationPlan {
  return JSON.parse(readFileSync(join(root, map), "utf8")) as MigrationPlan;
}

/** The skips the codemod recorded, one file per source file it skipped a site in. */
export function readSkips(root: string, map: string): readonly Skip[] {
  const dir = join(root, sidecarsOf(map).skips);
  return existsSync(dir)
    ? readdirSync(dir)
        .toSorted()
        .flatMap((name) => JSON.parse(readFileSync(join(dir, name), "utf8")) as readonly Skip[])
    : [];
}

/**
 * Prove the owner after the rewrite: the census is rerun and the owner's recipe rows are what remains. Each remaining row needs a
 * reason from the plan's review list or the codemod's skips. A reason on the same line answers first; Biome can reflow a file and move
 * a line, so a row left over takes any unused reason for the same path and class.
 */
export function proveOwner(plan: MigrationPlan, hits: readonly Hit[], skips: readonly Skip[]): Proof {
  const remaining = hits.filter((hit) => hit.category === "class-utility" && hit.verdict === "recipe" && hit.owner === plan.owner);
  const unused = [...plan.review, ...skips];
  const take = (hit: Hit, sameLine: boolean): boolean => {
    const index = unused.findIndex((reason) => reason.path === hit.path && reason.token === hit.detail && (!sameLine || reason.line === hit.line));
    if (index < 0) {
      return false;
    }
    unused.splice(index, 1);
    return true;
  };
  const afterLines = remaining.filter((hit) => !take(hit, true));
  const unexplained = afterLines.filter((hit) => !take(hit, false));
  return { planned: plan.sites.length, review: plan.review.length, remaining, unexplained };
}
