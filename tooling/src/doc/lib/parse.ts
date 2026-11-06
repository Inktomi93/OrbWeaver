// The argv → DocCommand parser — PURE, and the only place a command shape is invented. Every refusal is
// a UsageError so the cli maps it to exit 3 (misuse). Every list-taking verb reads a leading run of ids
// or paths, so `set 12 14 17 done` is one call.
import { UsageError } from "../../floor/cli/run-tool.ts";
import type { DocCommand, ItemPatch, OverviewState, SectionContent } from "../contract/types.ts";
import { ADR_SECTION_FLAGS, ITEM_SECTION_FLAGS, PLAN_SECTION_FLAGS } from "../contract/types.ts";
import { ITEM_STATES } from "../contract/vocab.ts";
import { isItemKind, isItemState } from "./items.ts";
import { isSlug } from "./names.ts";

const ID_RE = /^\d+$/u;

// Each verb's lines start with `  <verb>`; a continuation line is indented deeper. `<verb> --help` prints
// only its own entry, so a verb's lines live here and nowhere else.
const VERB_USAGE = {
  new: [
    "  new adr <slug> [--title <t>] [--context <text>] [--decision <text>] [--consequences <text>] [--alternatives <text>]",
    "  new plan <slug> [--title <t>] [--goal <text>] [--shape <text>] [--rejected <text>] [--coupled <text>] [--test-plan <text>]",
    "  new law <slug> [--title <t>]",
  ],
  item: [
    "  item <title> --kind bug|work|decision|tooling [--priority P0..P3] [--area a] [--plan slug] [--lane x | --blocked <reason>]",
    "       [--what <text>] [--why <text>] [--done <text>] [--commit]      (the title is positional, not --title)",
    "  item --from <file.json> [--commit]  a JSON array of items (title, kind, priority, area, plan, lane, blocked,",
    "                                      what, why, done), written all-or-nothing",
  ],
  status: ["  status <status> <path…> [--by <path>] [--kind <k>] [--blocked <reason> (status parked, a plan)]"],
  set: [
    "  set <id…> [open|doing|blocked|done] [--kind k] [--title <t> (one id)] [--lane x] [--blocked <reason>] [--priority P] [--area a]",
    "       [--plan s] [--reviewed x] [--evidence sha] [--commit]      (--<field> - or --<field> none clears a field)",
  ],
  edit: ["  edit <id> [--what <text>] [--why <text>] [--done <text>] [--commit]      replace those sections of one item"],
  show: ["  show <id…>                          print each item's file under a path header, in the order given"],
  remove: ["  remove <id|path…>                   delete governed docs nothing cites (a plan by its design.md)"],
  land: [
    "  land <id…> --evidence <sha>         landing deletes the item and commits the record",
    "  land <id…> --stage                  the same without the commit: stages the written paths, prints the record and a Closes: line",
    "  land --merged [--head-merge]",
  ],
  index: ["  index                               regenerate the generated indexes"],
  review: ["  review <path|glob…>                 mark docs reviewed today"],
  due: ["  due [glob…]                         list docs whose cited code changed since their review"],
  overview: ["  overview [--status open|doing|blocked[,…]]… [--area <a>]"],
  drift: ["  drift"],
  format: ["  format <--check|--write> [file…]    write/list compact markdown across the living docs trees"],
} as const satisfies Record<string, readonly string[]>;
type UsageVerb = keyof typeof VERB_USAGE;

export const USAGE = ["usage: pnpm doc <verb> …", ...Object.values(VERB_USAGE).flat()].join("\n");

function usageFor(verb: UsageVerb): string {
  return VERB_USAGE[verb].join("\n");
}

const HELP_FLAGS: readonly string[] = ["--help", "-h"];

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

/** Every value of a repeatable flag, in order. */
function flagValues(args: readonly string[], flag: string): readonly string[] {
  return args.flatMap((token, index) => (token === flag ? [flagValue(args.slice(index), flag) ?? ""] : []));
}

/** `fix` names the corrected command for an unknown flag an agent is known to reach for. */
function refuseUnknownFlags(args: readonly string[], allowed: readonly string[], verb: string, fix?: (flag: string) => string | null): void {
  const unknown = args.find((token) => token.startsWith("--") && !allowed.includes(token));
  if (unknown !== undefined) {
    const hint = fix?.(unknown) ?? null;
    throw new UsageError(`${verb} does not recognize ${unknown}${hint === null ? "" : ` — ${hint}`} — flags: ${allowed.join(" ")}`);
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

function contentFlagNames(flags: readonly string[]): readonly string[] {
  return flags.map((flag) => `--${flag}`);
}

/** The section text a mint carries: `--<flag> <text>` per content flag the kind's template declares. */
function parseContent<F extends string>(args: readonly string[], flags: readonly F[]): SectionContent<F> {
  const content: { [K in F]?: string } = {};
  for (const flag of flags) {
    const value = flagValue(args, `--${flag}`);
    if (value !== null) {
      content[flag] = value;
    }
  }
  return content;
}

const ADR_FLAGS = ADR_SECTION_FLAGS;
const PLAN_FLAGS = PLAN_SECTION_FLAGS;
const ITEM_CONTENT_FLAGS = ITEM_SECTION_FLAGS;

function parseNew(args: readonly string[]): DocCommand {
  const [kind, slug, ...rest] = args;
  if (kind === "item") {
    throw new UsageError(`new takes adr, plan or law — an item is its own verb: pnpm doc item "<title>" --kind …\n${usageFor("item")}`);
  }
  if (kind !== "adr" && kind !== "plan" && kind !== "law") {
    throw new UsageError(`new takes adr, plan or law\n${USAGE}`);
  }
  const title = flagValue(rest, "--title");
  if (kind === "law") {
    refuseUnknownFlags(rest, ["--title"], "new law");
    return { kind: "new-law", slug: slugArg(slug, "new"), title };
  }
  if (kind === "adr") {
    refuseUnknownFlags(rest, ["--title", ...contentFlagNames(ADR_FLAGS)], "new adr");
    return { kind: "new-adr", slug: slugArg(slug, "new"), title, content: parseContent(rest, ADR_FLAGS) };
  }
  refuseUnknownFlags(rest, ["--title", ...contentFlagNames(PLAN_FLAGS)], "new plan");
  return { kind: "new-plan", slug: slugArg(slug, "new"), title, content: parseContent(rest, PLAN_FLAGS) };
}

const FROM_FLAG = "--from";
/** The flag that commits a board write; it takes no value, so it is never in a value-flag list. */
const COMMIT_FLAG = "--commit";
const STAGE_FLAG = "--stage";
const ITEM_FLAGS = ["--kind", "--priority", "--area", "--plan", "--lane", "--blocked", ...contentFlagNames(ITEM_CONTENT_FLAGS), FROM_FLAG];

/** `item --from <file>` stands alone: every field of every item lives in the file. */
function parseItemBatch(args: readonly string[]): DocCommand {
  const rest = args.filter((token) => token !== COMMIT_FLAG);
  const from = requiredFlag(rest, FROM_FLAG);
  if (rest.length !== 2) {
    throw new UsageError(`item ${FROM_FLAG} takes no title and no other flag but ${COMMIT_FLAG} — every field lives in the file\n${USAGE}`);
  }
  return { kind: "item-batch", from, commit: args.includes(COMMIT_FLAG) };
}

function parseItem(args: readonly string[]): DocCommand {
  refuseUnknownFlags(args, [...ITEM_FLAGS, COMMIT_FLAG], "item", (flag) =>
    flag === "--title" ? `the title is positional: pnpm doc item "${args[args.indexOf(flag) + 1] ?? "<title>"}" --kind …` : null,
  );
  if (args.includes(FROM_FLAG)) {
    return parseItemBatch(args);
  }
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
    input: {
      title,
      kind: itemKind,
      priority: flagValue(args, "--priority"),
      area: flagValue(args, "--area"),
      plan: flagValue(args, "--plan"),
      lane: flagValue(args, "--lane"),
      blocked: flagValue(args, "--blocked"),
      content: parseContent(args, ITEM_CONTENT_FLAGS),
    },
    commit: args.includes(COMMIT_FLAG),
  };
}

/** `edit <id>` rewrites the body of the sections it is given, so at least one section flag is required. */
function parseEdit(args: readonly string[]): DocCommand {
  const sectionFlags = contentFlagNames(ITEM_CONTENT_FLAGS);
  refuseUnknownFlags(args, [...sectionFlags, COMMIT_FLAG], "edit");
  const tokens = positionals(args, sectionFlags);
  const [id] = ids(tokens, "edit");
  const sections = parseContent(args, ITEM_CONTENT_FLAGS);
  if (tokens.length !== 1 || id === undefined) {
    throw new UsageError(`edit takes exactly one item id\n${usageFor("edit")}`);
  }
  if (Object.keys(sections).length === 0) {
    throw new UsageError(`edit names at least one section to replace: ${sectionFlags.join(" ")}\n${usageFor("edit")}`);
  }
  return { kind: "edit", id, sections, commit: args.includes(COMMIT_FLAG) };
}

function parseShow(args: readonly string[]): DocCommand {
  refuseUnknownFlags(args, [], "show");
  return { kind: "show", ids: ids(args, "show") };
}

type PatchKey = Exclude<keyof ItemPatch, "state" | "kind" | "title">;
const PATCH_FLAGS: readonly (readonly [string, PatchKey])[] = [
  ["--lane", "lane"],
  ["--blocked", "blocked"],
  ["--priority", "priority"],
  ["--area", "area"],
  ["--plan", "plan"],
  ["--reviewed", "reviewed"],
  ["--evidence", "evidence"],
];
const SET_FLAGS = [...PATCH_FLAGS.map(([flag]) => flag), "--kind", "--title"];
/** The values that clear a field, so neither can name a plan, a lane or a reviewer. */
const CLEAR_VALUES: readonly string[] = ["-", "none"];

/** The field writes a `set` carries. `--flag -` or `--flag none` clears a field; an absent flag leaves
 *  the field alone, so the patch holds only the keys the operator named. */
function parsePatch(args: readonly string[]): ItemPatch {
  const out: { -readonly [K in PatchKey]?: ItemPatch[K] } = {};
  for (const [flag, key] of PATCH_FLAGS) {
    const value = flagValue(args, flag);
    if (value !== null) {
      out[key] = CLEAR_VALUES.includes(value) ? null : value;
    }
  }
  return out;
}

/** `--kind` and `--title`, which change what an item is rather than where it stands. */
function parseIdentity(args: readonly string[], idCount: number): Pick<ItemPatch, "kind" | "title"> {
  const kind = flagValue(args, "--kind");
  const title = flagValue(args, "--title");
  if (kind !== null && !isItemKind(kind)) {
    throw new UsageError("--kind must be bug, work, decision or tooling");
  }
  if (title !== null && idCount !== 1) {
    throw new UsageError(`--title renames one item — name exactly one id\n${USAGE}`);
  }
  return { ...(kind === null ? {} : { kind }), ...(title === null ? {} : { title: title.trim() }) };
}

/** The state is optional so a field-only edit (`set 12 --kind work`) needs no state. */
function parseSet(args: readonly string[]): DocCommand {
  refuseUnknownFlags(args, [...SET_FLAGS, COMMIT_FLAG], "set", (flag) =>
    flag === "--state" || flag === "--status"
      ? `the state is positional: pnpm doc set ${[...positionals(args, [...SET_FLAGS, flag]), args[args.indexOf(flag) + 1] ?? "<state>"].join(" ")}`
      : null,
  );
  const tokens = positionals(args, SET_FLAGS);
  const last = tokens.at(-1);
  const state = isItemState(last) ? last : undefined;
  if (state === undefined && tokens.length > 1 && last !== undefined && !ID_RE.test(last)) {
    throw new UsageError(`set: ${last} is not a state — states: ${ITEM_STATES.join(" ")}\n${usageFor("set")}`);
  }
  const idList = ids(state === undefined ? tokens : tokens.slice(0, -1), "set");
  const patch: ItemPatch = { ...(state === undefined ? {} : { state }), ...parseIdentity(args, idList.length), ...parsePatch(args) };
  if (Object.keys(patch).length === 0) {
    throw new UsageError(`set names a state or at least one field\n${USAGE}`);
  }
  const commit = args.includes(COMMIT_FLAG);
  if (commit && patch.title !== undefined) {
    throw new UsageError(
      `set --title cannot take ${COMMIT_FLAG}: a retitle rewrites references in files outside the board, and the commit would carry a sibling's edits in them — retitle, then commit by hand\n${usageFor("set")}`,
    );
  }
  return { kind: "set", ids: idList, patch, commit };
}

/** `--head-merge` selects the range `HEAD^1..HEAD`, only right when HEAD is itself a merge commit; its
 *  absence keeps `ORIG_HEAD..HEAD`. The caller picks the flag by which merge just ended, never by HEAD's
 *  shape — a fast-forward onto a branch whose tip is a merge commit is still a plain merge, and
 *  `HEAD^1..HEAD` there would drop every id on the first-parent side. `--stage` is the landing without a
 *  commit; it takes ids and no evidence. */
function parseLand(args: readonly string[]): DocCommand {
  if (args[0] === "--merged") {
    const rest = args.slice(1);
    if (rest.length > 0 && !(rest.length === 1 && rest[0] === "--head-merge")) {
      throw new UsageError(`land --merged takes only --head-merge\n${USAGE}`);
    }
    return { kind: "land-merged", headMerge: rest[0] === "--head-merge" };
  }
  refuseUnknownFlags(args, ["--evidence", STAGE_FLAG], "land");
  const tokens = positionals(args, ["--evidence"]);
  if (args.includes(STAGE_FLAG)) {
    if (args.includes("--evidence")) {
      throw new UsageError(`land ${STAGE_FLAG} stages the landing for your own commit and takes no --evidence — name one or the other\n${usageFor("land")}`);
    }
    return { kind: "land-stage", ids: ids(tokens, "land") };
  }
  const sha = tokens.find((token) => !ID_RE.test(token));
  if (sha !== undefined && !args.includes("--evidence")) {
    throw new UsageError(
      `land takes the evidence as a flag: pnpm doc ${["land", ...tokens.filter((token) => token !== sha), "--evidence", sha].join(" ")}\n${usageFor("land")}`,
    );
  }
  return { kind: "land", ids: ids(tokens, "land"), evidence: requiredFlag(args, "--evidence") };
}

const STATUS_FLAGS = ["--by", "--kind", "--blocked"];

function parseStatus(args: readonly string[]): DocCommand {
  refuseUnknownFlags(args, STATUS_FLAGS, "status");
  const [status, ...paths] = positionals(args, STATUS_FLAGS);
  if (status === undefined || paths.length === 0) {
    throw new UsageError(`status takes a status and one or more paths\n${USAGE}`);
  }
  if (isItemState(status) && paths.every((path) => ID_RE.test(path))) {
    throw new UsageError(
      `status moves ADRs, plans and laws by path; an item's state is set by id: pnpm doc set ${paths.join(" ")} ${status}\n${usageFor("set")}`,
    );
  }
  return { kind: "status", status, paths, by: flagValue(args, "--by"), docKind: flagValue(args, "--kind"), blocked: flagValue(args, "--blocked") };
}

function parseRemove(args: readonly string[]): DocCommand {
  refuseUnknownFlags(args, [], "remove");
  if (args.length === 0) {
    throw new UsageError(`remove takes one or more item ids or doc paths\n${USAGE}`);
  }
  return { kind: "remove", targets: args };
}

function parseListVerb(name: "review" | "due", args: readonly string[]): DocCommand {
  refuseUnknownFlags(args, [], name);
  if (name !== "due" && args.length === 0) {
    throw new UsageError(`${name} takes one or more arguments\n${USAGE}`);
  }
  return { kind: name, patterns: args };
}

// `done` is a count-only column, so filtering to it would print a bare header.
const OVERVIEW_STATES = ITEM_STATES.filter((state): state is OverviewState => state !== "done");
const OVERVIEW_FLAGS = ["--status", "--area"];

function isOverviewState(value: string): value is OverviewState {
  return OVERVIEW_STATES.some((state) => state === value);
}

function parseOverview(args: readonly string[]): DocCommand {
  refuseUnknownFlags(args, OVERVIEW_FLAGS, "overview");
  const stray = positionals(args, OVERVIEW_FLAGS);
  if (stray.length > 0) {
    const hint = stray.every(isOverviewState) ? ` — a state filter is --status ${stray.join(",")}` : "";
    throw new UsageError(`overview takes only flags, not ${stray.join(" ")}${hint}\n${usageFor("overview")}`);
  }
  const named = flagValues(args, "--status").flatMap((value) =>
    value
      .split(",")
      .map((state) => state.trim())
      .filter((state) => state !== ""),
  );
  const unknown = named.filter((state) => !isOverviewState(state));
  if (unknown.length > 0) {
    throw new UsageError(`overview --status takes ${OVERVIEW_STATES.join("|")}, not ${unknown.join(", ")}`);
  }
  return { kind: "overview", filter: { states: OVERVIEW_STATES.filter((state) => named.includes(state)), area: flagValue(args, "--area") } };
}

function parseBare(name: "index" | "drift", args: readonly string[]): DocCommand {
  if (args.length > 0) {
    throw new UsageError(`${name} takes no arguments`);
  }
  return { kind: name };
}

function parseFormat(args: readonly string[]): DocCommand {
  const [mode, ...files] = args;
  if (mode !== "--check" && mode !== "--write") {
    throw new UsageError(`format takes --check or --write\n${USAGE}`);
  }
  if (files.some((file) => file.startsWith("--"))) {
    throw new UsageError(`format takes only --check|--write and file paths\n${USAGE}`);
  }
  return { kind: "format", write: mode === "--write", files };
}

/** Verb name → parser; keyed by {@link VERB_USAGE}, so a verb with usage lines always has a parser. */
type Parser = (tail: readonly string[]) => DocCommand;
const VERBS: Readonly<Record<UsageVerb, Parser>> = {
  new: parseNew,
  item: parseItem,
  status: parseStatus,
  set: parseSet,
  edit: parseEdit,
  show: parseShow,
  remove: parseRemove,
  land: parseLand,
  review: (tail) => parseListVerb("review", tail),
  due: (tail) => parseListVerb("due", tail),
  index: (tail) => parseBare("index", tail),
  overview: parseOverview,
  drift: (tail) => parseBare("drift", tail),
  format: parseFormat,
};

function isUsageVerb(name: string): name is UsageVerb {
  return Object.hasOwn(VERBS, name);
}

export function parseDocCommand(argv: readonly string[]): DocCommand {
  const [name, ...tail] = argv;
  if (name === undefined || name === "help" || HELP_FLAGS.includes(name)) {
    return { kind: "help", text: USAGE };
  }
  if (!isUsageVerb(name)) {
    throw new UsageError(`unknown verb ${name}\n${USAGE}`);
  }
  // Help wins over every other token, so `<verb> --help` never trips the verb's own argument checks.
  if (tail.some((token) => HELP_FLAGS.includes(token))) {
    return { kind: "help", text: usageFor(name) };
  }
  return VERBS[name](tail);
}
