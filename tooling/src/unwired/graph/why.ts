// The `--why` record: every role the build gives a named member, the site that gave it, and the build code that
// recorded it. A role can land before its declaration's file is walked, so a role is kept on a superset test (the
// declaration's span holds the name, or covers the line) and judged exactly against the walked declarations at the end.
import { basename } from "node:path";
import { getCallSites } from "node:util";
import { skipTrivia } from "@typescript/native/ast";
import type { NativeWorld } from "../native.ts";
import type { WhyTarget } from "./options.ts";
import type { DeclKey } from "./resolve.ts";
import { declKeyParts } from "./resolve.ts";
import type { CarryStep, Role } from "./roles.ts";
import { READS } from "./roles.ts";
import type { DeclInfo } from "./sites.ts";
import { isDeclKey } from "./sites.ts";

/** The line a recorded site names: the node's full start, past its leading trivia, so a comment above the node is not its line. */
export function siteLine(world: NativeWorld, file: string, at: number): number {
  const source = world.source(file);
  return (source === undefined ? 0 : source.getLineAndCharacterOfPosition(skipTrivia(source.text, at)).line) + 1;
}

/** One role a `--why` target's member was given. */
export interface WhyEntry {
  /** The target as asked. */
  readonly target: string;
  /** The member as `Owner.member`, at its declaration's `file:line`. */
  readonly member: string;
  readonly declared: string;
  readonly role: Role;
  /** The `file:line` whose code gave the role. */
  readonly site: string;
  /** The build function that recorded it, with its own `file:line`. */
  readonly via: string;
}

interface WhyEvent {
  readonly key: DeclKey;
  readonly role: Role;
  readonly file: string;
  readonly line: number;
  readonly via: string;
}

// The frames of the recorder itself and of the role sink it sits behind.
const RECORDER_FILES: ReadonlySet<string> = new Set(["why.ts", "state.ts"]);
const ANONYMOUS = "(anonymous)";

const recorder = (): string => {
  const frame = getCallSites().find(({ scriptName }) => !RECORDER_FILES.has(basename(scriptName)));
  return frame === undefined
    ? ANONYMOUS
    : `${frame.functionName === "" ? ANONYMOUS : frame.functionName} ${basename(frame.scriptName)}:${String(frame.lineNumber)}`;
};

// Each target a declaration answers, with the member as the record names it.
function targetsOf(
  targets: readonly WhyTarget[],
  decls: ReadonlyMap<DeclKey, DeclInfo>,
  key: DeclKey,
): readonly Pick<WhyEntry, "target" | "member" | "declared">[] {
  const info = decls.get(key);
  if (info === undefined) {
    return [];
  }
  const owner = memberName(decls, info);
  return targets
    .filter((target) =>
      target.kind === "member"
        ? info.name === target.name && (target.owner === null || owner === `${target.owner}.${info.name}`)
        : info.file === target.file && info.line === target.line,
    )
    .map((target) => ({ target: targetText(target), member: owner, declared: `${info.file}:${String(info.line)}` }));
}

// A member as `Owner.member`, or its bare name when it has no named holder.
function memberName(decls: ReadonlyMap<DeclKey, DeclInfo>, info: DeclInfo): string {
  const owner = isDeclKey(info.holder) ? decls.get(info.holder)?.name : undefined;
  return owner === undefined ? info.name : `${owner}.${info.name}`;
}

/** A role's recorded sites and the files whose reads the product makes: what a carried role is traced back through. */
export interface CarryOrigins {
  readonly sites: ReadonlyMap<DeclKey, readonly { readonly role: Role; readonly file: string; readonly at: number }[]>;
  readonly product: (file: string) => boolean;
  /** The source world, to name a site's line; a graph read back from a dump has none, and names the file alone. */
  readonly world: NativeWorld | null;
}

/** The roles the carry gave each target's member, after the build's own. Each names the link it came along and the
 *  member it came from, at the occurrence that gave that member the role first: a recorded site, a credit's reading
 *  file, or, through a chain of carries, the site at its start. A role the product does not hold is marked as outside it. */
export function carriedEntries(
  targets: readonly WhyTarget[],
  decls: ReadonlyMap<DeclKey, DeclInfo>,
  steps: readonly CarryStep[],
  origins: CarryOrigins,
): readonly WhyEntry[] {
  const given = new Map<string, CarryStep>();
  for (const step of steps) {
    const id = stepId(step.to, step.role, step.product);
    if (!given.has(id)) {
      given.set(id, step);
    }
  }
  const label = (key: DeclKey): string => {
    const info = decls.get(key);
    if (info !== undefined) {
      return memberName(decls, info);
    }
    const { file, pos } = declKeyParts(key);
    return lineOf(origins.world, file, pos);
  };
  // The occurrence that first gave `key` the role on this side, following carries back to their start.
  const originOf = (key: DeclKey, role: Role, product: boolean, seen: Set<string>): string => {
    const recorded = origins.sites.get(key)?.find((site) => sameRole(site.role, role) && origins.product(site.file) === product);
    if (recorded !== undefined) {
      return lineOf(origins.world, recorded.file, recorded.at);
    }
    const id = stepId(key, role, product);
    const step = given.get(id);
    if (step === undefined || seen.has(id)) {
      return `${label(key)} (no recorded site)`;
    }
    seen.add(id);
    return step.from === null ? (step.file ?? "") : originOf(step.from, role, product, seen);
  };
  return steps.flatMap((step) => {
    const site = step.from === null ? (step.file ?? "") : originOf(step.from, step.role, step.product, new Set());
    const from = step.from === null ? "" : ` from ${label(step.from)}`;
    const outside = step.product ? "" : " outside the product";
    return targetsOf(targets, decls, step.to).map((named) => ({ ...named, role: step.role, site, via: `carry ${step.link}${from}${outside}` }));
  });
}

const stepId = (key: DeclKey, role: Role, product: boolean): string => `${key}\t${role}\t${String(product)}`;
// A carry hands a read on as a read, so any read role at the source is the origin of a carried read.
const sameRole = (site: Role, carried: Role): boolean => site === carried || (READS.has(site) && READS.has(carried));
const lineOf = (world: NativeWorld | null, file: string, at: number): string => (world === null ? file : `${file}:${String(siteLine(world, file, at))}`);

const targetText = (target: WhyTarget): string =>
  target.kind === "site" ? `${target.file}:${String(target.line)}` : `${target.owner === null ? "" : `${target.owner}.`}${target.name}`;

export class WhyTracker {
  readonly #world: NativeWorld;
  readonly #targets: readonly WhyTarget[];
  readonly #candidates = new Map<DeclKey, boolean>();
  readonly #events: WhyEvent[] = [];
  // One event per member, role, site line and recorder: a member several values carry through one site is given its
  // role there once per value, and the record names each such role once.
  readonly #seen = new Set<string>();

  constructor(world: NativeWorld, targets: readonly WhyTarget[]) {
    this.#world = world;
    this.#targets = targets;
  }

  note(key: DeclKey, role: Role, file: string, at: number): void {
    let candidate = this.#candidates.get(key);
    if (candidate === undefined) {
      candidate = this.#candidate(key);
      this.#candidates.set(key, candidate);
    }
    if (!candidate) {
      return;
    }
    const event = { key, role, file, line: siteLine(this.#world, file, at), via: recorder() };
    const id = `${key}\t${role}\t${file}:${String(event.line)}\t${event.via}`;
    if (!this.#seen.has(id)) {
      this.#seen.add(id);
      this.#events.push(event);
    }
  }

  #candidate(key: DeclKey): boolean {
    const { file, pos, end } = declKeyParts(key);
    const source = this.#world.source(file);
    if (source === undefined) {
      return false;
    }
    const text = source.text.slice(pos, end);
    const first = source.getLineAndCharacterOfPosition(pos).line + 1;
    const last = source.getLineAndCharacterOfPosition(end).line + 1;
    return this.#targets.some((target) =>
      target.kind === "member" ? text.includes(target.name) : target.file === file && target.line >= first && target.line <= last,
    );
  }

  /** Each target's roles, judged against the walked declarations, in the order the build recorded them. */
  entries(decls: ReadonlyMap<DeclKey, DeclInfo>): readonly WhyEntry[] {
    return this.#events.flatMap((event) =>
      targetsOf(this.#targets, decls, event.key).map((named) => ({
        ...named,
        role: event.role,
        site: `${event.file}:${String(event.line)}`,
        via: event.via,
      })),
    );
  }
}
