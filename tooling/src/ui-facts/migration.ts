// The migration plan for one census owner: the exact class sites the class-token-to-prop codemod may move onto a recipe prop,
// the sites it must leave for review, and the proof that a rerun of the census closed them. A report: it moves nothing itself.
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { Hit } from "./hand-model.ts";
import { doorOf } from "./source.ts";
import type { ComponentTables } from "./variant-tables.ts";

/** One class token on one element, written where the census saw it. The codemod reads this shape; keep both in step. */
interface PlannedSite {
  readonly path: string;
  readonly line: number;
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
// An arm key that is a plain word is a string prop value. A number or a boolean is a typed prop, which the syntax cannot confirm.
const STRING_ARM = /^[A-Za-z][A-Za-z0-9-]*$/u;
const NOT_STRING_ARMS: ReadonlySet<string> = new Set(["true", "false", "null", "undefined"]);

export function isMigratableOwner(owner: string): boolean {
  return OWNER_PATTERN.test(owner);
}

/**
 * The sidecar paths of a plan, next to its map. The codemod derives the skip folder from the same name, so a rename here
 * breaks the proof: `tooling/src/codemods/class-token-to-prop/scripts/codemod.ts` repeats this rule.
 */
function sidecarsOf(map: string): { readonly files: string; readonly programs: string; readonly skips: string } {
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
  const door = doorOf(element.source);
  const arm = hit.match?.slice(owner.length + 1);
  const axis = tables
    .get(door ?? "")
    ?.get(element.name)
    ?.get(propOf(owner));
  if (arm === undefined || axis === undefined) {
    return `no arm of ${owner} is read from ${element.name}`;
  }
  if (!STRING_ARM.test(arm) || NOT_STRING_ARMS.has(arm)) {
    return `arm "${arm}" is not a plain string prop value`;
  }
  const writing = axis.get(arm) ?? [];
  if (writing.length !== 1 || writing[0] !== hit.detail) {
    return `arm "${arm}" writes ${writing.join(" ")}, which is not exactly ${hit.detail}`;
  }
  const sameClass = [...axis].filter(([, written]) => written.includes(hit.detail)).map(([name]) => name);
  return sameClass.length === 1 ? null : `arms ${sameClass.join(", ")} all write ${hit.detail}`;
}

/** Plan one owner: recipe rows with that exact owner. A `, conditional` owner is a different group and never mechanical. */
export function planOwner(hits: readonly Hit[], tables: ComponentTables, owner: string): MigrationPlan {
  const sites: PlannedSite[] = [];
  const review: ReviewSite[] = [];
  const seen = new Set<string>();
  for (const hit of hits.filter((candidate) => candidate.category === "class-utility" && candidate.verdict === "recipe" && candidate.owner === owner)) {
    const key = `${hit.path}:${hit.line}:${hit.detail}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    const reason = refusal(hit, owner, tables);
    if (reason !== null || hit.element === null || hit.match === null) {
      review.push({ path: hit.path, line: hit.line, token: hit.detail, reason: reason ?? "no arm names this class" });
      continue;
    }
    sites.push({
      path: hit.path,
      line: hit.line,
      source: hit.element.source,
      name: hit.element.name,
      attribute: "className",
      token: hit.detail,
      prop: propOf(owner),
      value: hit.match.slice(owner.length + 1),
    });
  }
  return { owner, sites, review };
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
