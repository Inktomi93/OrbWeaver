// The `--why` record: every role the build gives a named member, the site that gave it, and the build code that
// recorded it. A role can land before its declaration's file is walked, so a role is kept on a superset test (the
// declaration's span holds the name, or covers the line) and judged exactly against the walked declarations at the end.
import { basename } from "node:path";
import { getCallSites } from "node:util";
import type { NativeWorld } from "../native.ts";
import type { WhyTarget } from "./options.ts";
import type { DeclKey } from "./resolve.ts";
import { declKeyParts } from "./resolve.ts";
import type { Role } from "./roles.ts";
import type { DeclInfo } from "./sites.ts";
import { isDeclKey } from "./sites.ts";

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
  readonly at: number;
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

const targetText = (target: WhyTarget): string =>
  target.kind === "site" ? `${target.file}:${String(target.line)}` : `${target.owner === null ? "" : `${target.owner}.`}${target.name}`;

export class WhyTracker {
  readonly #world: NativeWorld;
  readonly #targets: readonly WhyTarget[];
  readonly #candidates = new Map<DeclKey, boolean>();
  readonly #events: WhyEvent[] = [];

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
    if (candidate) {
      this.#events.push({ key, role, file, at, via: recorder() });
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
    const ownerOf = (info: DeclInfo): string | null => (isDeclKey(info.holder) ? (decls.get(info.holder)?.name ?? null) : null);
    return this.#events.flatMap((event) => {
      const info = decls.get(event.key);
      if (info === undefined) {
        return [];
      }
      const owner = ownerOf(info);
      const matched = this.#targets.filter((target) =>
        target.kind === "member"
          ? info.name === target.name && (target.owner === null || owner === target.owner)
          : info.file === target.file && info.line === target.line,
      );
      const line = (this.#world.source(event.file)?.getLineAndCharacterOfPosition(event.at).line ?? 0) + 1;
      return matched.map((target) => ({
        target: targetText(target),
        member: owner === null ? info.name : `${owner}.${info.name}`,
        declared: `${info.file}:${String(info.line)}`,
        role: event.role,
        site: `${event.file}:${String(line)}`,
        via: event.via,
      }));
    });
  }
}
