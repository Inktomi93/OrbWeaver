// The argv → DocCommand parser — PURE, and the only place a command shape is invented. Every refusal is
// a UsageError so the cli maps it to exit 3 (misuse). Every list-taking verb reads a leading run of ids
// or paths, so `set 12 14 17 done` is one call.
import { UsageError } from "../../_shared/run-tool.ts";
import type { DocCommand, ItemPatch } from "../contract/types.ts";
import { isItemKind, isItemState } from "./items.ts";
import { isSlug } from "./names.ts";

const ID_RE = /^\d+$/u;

export const USAGE = [
  "usage: pnpm doc <verb> …",
  "  new adr <slug> [--title <t>]        new plan <slug> [--title <t>]",
  "  item <title> --kind bug|work|decision|tooling [--priority P0..P3] [--area a] [--plan slug] [--lane x]",
  "  status <status> <path…> [--by <path>]",
  "  set <id…> <open|doing|blocked|done> [--lane x] [--blocked <reason>] [--priority P] [--area a] [--plan s] [--reviewed x] [--evidence sha]",
  "  land <id…> --evidence <sha>       land --merged",
  "  archive <plan-slug|item-id…>      index      review <path|glob…>      due [glob…]",
  "  overview      drift",
].join("\n");

function flagValue(args: readonly string[], flag: string): string | null {
  const index = args.indexOf(flag);
  if (index === -1) {
    return null;
  }
  const value = args[index + 1];
  if (value === undefined || value.startsWith("--") || value.trim() === "") {
    throw new UsageError(`${flag} requires a value`);
  }
  return value;
}

function requiredFlag(args: readonly string[], flag: string): string {
  const value = flagValue(args, flag);
  if (value === null) {
    throw new UsageError(`${flag} is required\n${USAGE}`);
  }
  return value;
}

function refuseUnknownFlags(args: readonly string[], allowed: readonly string[], verb: string): void {
  const unknown = args.find((token) => token.startsWith("--") && !allowed.includes(token));
  if (unknown !== undefined) {
    throw new UsageError(`${verb} does not recognize ${unknown} — flags: ${allowed.join(" ")}`);
  }
}

/** Positional arguments: everything that is not a flag or a flag's value. */
function positionals(args: readonly string[], flags: readonly string[]): readonly string[] {
  const out: string[] = [];
  let skipNext = false;
  for (const token of args) {
    if (skipNext) {
      skipNext = false;
      continue;
    }
    if (token.startsWith("--")) {
      skipNext = flags.includes(token);
      continue;
    }
    out.push(token);
  }
  return out;
}

function ids(tokens: readonly string[], verb: string): readonly number[] {
  if (tokens.length === 0 || tokens.some((token) => !ID_RE.test(token))) {
    throw new UsageError(`${verb} takes one or more numeric item ids\n${USAGE}`);
  }
  return tokens.map(Number);
}

function slugArg(value: string | undefined, verb: string): string {
  if (value === undefined || !isSlug(value)) {
    throw new UsageError(`${verb} takes a lowercase hyphenated slug\n${USAGE}`);
  }
  return value;
}

function parseNew(args: readonly string[]): DocCommand {
  const [kind, slug, ...rest] = args;
  refuseUnknownFlags(rest, ["--title"], "new");
  if (kind !== "adr" && kind !== "plan") {
    throw new UsageError(`new takes adr or plan\n${USAGE}`);
  }
  return { kind: kind === "adr" ? "new-adr" : "new-plan", slug: slugArg(slug, "new"), title: flagValue(rest, "--title") };
}

const ITEM_FLAGS = ["--kind", "--priority", "--area", "--plan", "--lane"];

function parseItem(args: readonly string[]): DocCommand {
  refuseUnknownFlags(args, ITEM_FLAGS, "item");
  const title = positionals(args, ITEM_FLAGS).join(" ").trim();
  if (title === "") {
    throw new UsageError(`item takes a title\n${USAGE}`);
  }
  const itemKind = requiredFlag(args, "--kind");
  if (!isItemKind(itemKind)) {
    throw new UsageError("--kind must be bug, work, decision or tooling");
  }
  return {
    kind: "item",
    title,
    itemKind,
    priority: flagValue(args, "--priority"),
    area: flagValue(args, "--area"),
    plan: flagValue(args, "--plan"),
    lane: flagValue(args, "--lane"),
  };
}

type PatchKey = Exclude<keyof ItemPatch, "state">;
const PATCH_FLAGS: readonly (readonly [string, PatchKey])[] = [
  ["--lane", "lane"],
  ["--blocked", "blocked"],
  ["--priority", "priority"],
  ["--area", "area"],
  ["--plan", "plan"],
  ["--reviewed", "reviewed"],
  ["--evidence", "evidence"],
];
const SET_FLAGS = PATCH_FLAGS.map(([flag]) => flag);

/** The field writes a `set` carries. `--flag -` clears a field (a bare `-` is never a real value here);
 *  an absent flag leaves the field alone, so the patch holds only the keys the operator named. */
function parsePatch(args: readonly string[]): ItemPatch {
  const out: { -readonly [K in PatchKey]?: ItemPatch[K] } = {};
  for (const [flag, key] of PATCH_FLAGS) {
    const value = flagValue(args, flag);
    if (value !== null) {
      out[key] = value === "-" ? null : value;
    }
  }
  return out;
}

function parseSet(args: readonly string[]): DocCommand {
  refuseUnknownFlags(args, SET_FLAGS, "set");
  const tokens = positionals(args, SET_FLAGS);
  const state = tokens.at(-1);
  if (!isItemState(state)) {
    throw new UsageError(`set ends with the state: open, doing, blocked or done\n${USAGE}`);
  }
  return { kind: "set", ids: ids(tokens.slice(0, -1), "set"), patch: { state, ...parsePatch(args) } };
}

function parseLand(args: readonly string[]): DocCommand {
  if (args.length === 1 && args[0] === "--merged") {
    return { kind: "land-merged" };
  }
  refuseUnknownFlags(args, ["--evidence"], "land");
  return { kind: "land", ids: ids(positionals(args, ["--evidence"]), "land"), evidence: requiredFlag(args, "--evidence") };
}

function parseStatus(args: readonly string[]): DocCommand {
  refuseUnknownFlags(args, ["--by"], "status");
  const [status, ...paths] = positionals(args, ["--by"]);
  if (status === undefined || paths.length === 0) {
    throw new UsageError(`status takes a status and one or more paths\n${USAGE}`);
  }
  return { kind: "status", status, paths, by: flagValue(args, "--by") };
}

function parseListVerb(name: "archive" | "review" | "due", args: readonly string[]): DocCommand {
  refuseUnknownFlags(args, [], name);
  if (name !== "due" && args.length === 0) {
    throw new UsageError(`${name} takes one or more arguments\n${USAGE}`);
  }
  if (name === "archive") {
    return { kind: "archive", targets: args };
  }
  return { kind: name, patterns: args };
}

function parseBare(name: "index" | "overview" | "drift", args: readonly string[]): DocCommand {
  if (args.length > 0) {
    throw new UsageError(`${name} takes no arguments`);
  }
  return { kind: name };
}

/** Verb name → parser. A verb absent here is unknown, which is misuse. */
type Parser = (tail: readonly string[]) => DocCommand;
const help: Parser = () => ({ kind: "help" });
const VERBS: ReadonlyMap<string, Parser> = new Map<string, Parser>([
  ["help", help],
  ["--help", help],
  ["new", parseNew],
  ["item", parseItem],
  ["status", parseStatus],
  ["set", parseSet],
  ["land", parseLand],
  ["archive", (tail): DocCommand => parseListVerb("archive", tail)],
  ["review", (tail): DocCommand => parseListVerb("review", tail)],
  ["due", (tail): DocCommand => parseListVerb("due", tail)],
  ["index", (tail): DocCommand => parseBare("index", tail)],
  ["overview", (tail): DocCommand => parseBare("overview", tail)],
  ["drift", (tail): DocCommand => parseBare("drift", tail)],
  // Retired: any arguments reach the refusal (`ops/migrate-ledger.ts`), which names the verb that replaced it.
  ["migrate-ledger", (): DocCommand => ({ kind: "migrate-ledger" })],
]);

export function parseDocCommand(argv: readonly string[]): DocCommand {
  const [name, ...tail] = argv;
  if (name === undefined) {
    return { kind: "help" };
  }
  const verb = VERBS.get(name);
  if (verb === undefined) {
    throw new UsageError(`unknown verb ${name}\n${USAGE}`);
  }
  return verb(tail);
}
