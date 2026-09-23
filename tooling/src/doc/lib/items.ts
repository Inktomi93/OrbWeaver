// Work items as data: parse a `docs/work/NNNN-<slug>.md` file into a `WorkItem`, judge a state's final
// shape, and apply a transition patch. Any transition is legal — only the resulting shape is checked —
// which is what lets the orchestrator batch `set 12 14 17 done` without walking a lifecycle. Also the
// `item --from` batch file's schema.
import { z } from "zod";
import { DATE_RE, DOC_TOOL_TREES, ITEM_KINDS, ITEM_STATES } from "#doc-catalog";
import type { Blocker, ItemKind, ItemPatch, ItemSectionFlag, ItemState, NewItemInput, WorkItem } from "../contract/types.ts";
import { splitDocument, titleOf, withFields, withTitle } from "./frontmatter-write.ts";
import { basenameOf, parseNumberedName } from "./names.ts";
import { ITEM_SECTIONS, sectionFlags } from "./templates.ts";

const PRIORITY_RE = /^P[0-3]$/u;
const AREA_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;
const ON_RE = /^on (\d+)$/u;
/** `wake path <repo path>` (met when the path exists) or `wake gone <repo path>` (met when it does not).
 *  The path is repository-relative and may not climb out; nothing here is ever executed. */
const WAKE_RE = /^wake (path|gone) ([^\s/][^\s]*)$/u;
/** A commit id. The shape is judged here — and by `ops/tree.ts` BEFORE a doc-supplied value reaches a
 *  version-control argv, so `--help` can never become a flag; `rules.ts` proves the id reachable from
 *  `main` through the `evidenceOnMain` facts the tree walk resolves. */
const COMMIT_RE = /^[a-f0-9]{7,40}$/u;

export function isCommitId(value: string): boolean {
  return COMMIT_RE.test(value);
}
const BLOCKER_GRAMMAR = "blocked: owner | on <id> | wake path <repo path> | wake gone <repo path>";

export function isItemKind(value: string | undefined): value is ItemKind {
  return ITEM_KINDS.some((kind) => kind === value);
}

export function isItemState(value: string | undefined): value is ItemState {
  return ITEM_STATES.some((state) => state === value);
}

export function isItemPath(path: string): boolean {
  return path.startsWith(DOC_TOOL_TREES.work) && parseNumberedName(basenameOf(path)) !== null;
}

/** The blocker a `blocked:` value names, or null when the value is in no grammar. */
export function parseBlocker(value: string): Blocker | null {
  if (value === "owner") {
    return { kind: "owner" };
  }
  const on = ON_RE.exec(value)?.[1];
  if (on !== undefined) {
    return { kind: "on", id: Number(on) };
  }
  const wake = WAKE_RE.exec(value);
  if (wake === null || wake[2] === undefined || wake[2].split("/").includes("..")) {
    return null;
  }
  return { kind: "wake", presence: wake[1] === "gone" ? "gone" : "path", path: wake[2] };
}

/** `null` when the file is not an item (wrong tree, no block, unknown kind or state); the schema rules
 *  report those separately, so a caller listing items never sees a half-parsed one. */
export function parseItem(path: string, source: string): WorkItem | null {
  const name = parseNumberedName(basenameOf(path));
  const { fields, body } = splitDocument(source);
  if (name === null || fields === null || !isItemKind(fields["kind"]) || !isItemState(fields["status"])) {
    return null;
  }
  const field = (key: string): string | null => fields[key] ?? null;
  return {
    id: name.id,
    path,
    title: titleOf(body) ?? name.slug,
    kind: fields["kind"],
    state: fields["status"],
    updated: fields["updated"] ?? "",
    priority: field("priority"),
    area: field("area"),
    lane: field("lane"),
    blocked: field("blocked"),
    plan: field("plan"),
    evidence: field("evidence"),
    reviewed: field("reviewed"),
  };
}

function fieldGrammarProblems(item: WorkItem): readonly string[] {
  const problems: string[] = [];
  if (item.priority !== null && !PRIORITY_RE.test(item.priority)) {
    problems.push(`priority must be P0..P3, found ${item.priority}`);
  }
  if (item.area !== null && !AREA_RE.test(item.area)) {
    problems.push(`area must be one lowercase token, found ${item.area}`);
  }
  if (!DATE_RE.test(item.updated)) {
    problems.push("updated must be YYYY-MM-DD");
  }
  return problems;
}

function blockedProblem(item: WorkItem, known: ReadonlySet<number>): string | null {
  const blocker = item.blocked === null ? null : parseBlocker(item.blocked);
  if (blocker === null) {
    return `a blocked item carries a reason: ${BLOCKER_GRAMMAR}`;
  }
  if (blocker.kind === "on" && !known.has(blocker.id)) {
    return `blocked on ${String(blocker.id)}, which is not an item under ${DOC_TOOL_TREES.work}`;
  }
  return null;
}

/** The companion a state owes, or null when the state is complete. */
function stateProblem(item: WorkItem, known: ReadonlySet<number>): string | null {
  if (item.state === "doing" && item.lane === null) {
    return "a doing item names its lane: pnpm doc set <id> doing --lane <lane>";
  }
  if (item.state === "blocked") {
    return blockedProblem(item, known);
  }
  if (item.state === "done" && (item.evidence === null || !isCommitId(item.evidence))) {
    return "a done item carries its evidence commit: pnpm doc land <id> --evidence <sha>";
  }
  return null;
}

/** Every way an item's FINAL shape is wrong: a state without its companion, a companion in a wrong
 *  grammar, or an `on <id>` blocker naming no item. `known` is every item id on the tree. */
export function itemShapeProblems(item: WorkItem, known: ReadonlySet<number>): readonly string[] {
  const state = stateProblem(item, known);
  return [...fieldGrammarProblems(item), ...(state === null ? [] : [state])].map((what) => `${item.path}: ${what}`);
}

/** The item file with a transition applied as a whole-block rewrite. A state change clears the companions
 *  that belong to the states left behind, so a `blocked` reason never survives into `doing`. */
export function applyPatch(source: string, item: WorkItem, patch: ItemPatch, today: string): string {
  const next: Record<string, string | null> = { updated: today };
  if (patch.kind !== undefined) {
    next["kind"] = patch.kind;
  }
  const state = patch.state ?? item.state;
  if (patch.state !== undefined) {
    next["status"] = patch.state;
    if (state !== "doing") {
      next["lane"] = null;
    }
    if (state !== "blocked") {
      next["blocked"] = null;
    }
    if (state !== "done") {
      next["evidence"] = null;
    }
  }
  for (const key of ["priority", "area", "lane", "blocked", "plan", "evidence", "reviewed"] as const) {
    const value = patch[key];
    if (value !== undefined) {
      next[key] = value;
    }
  }
  const patched = withFields(source, next);
  return patch.title === undefined ? patched : withTitle(patched, patch.title);
}

export function nextItemId(items: readonly WorkItem[]): number {
  return items.reduce((max, item) => Math.max(max, item.id), 0) + 1;
}

const optionalField = z.string().nullable().optional();
const optionalText = z.string().optional();

/** One entry of an `item --from` file: the `item` flags, spelled without their dashes. Strict, so a
 *  misspelled key is a refusal instead of a silently dropped section. */
const BATCH_ENTRY = z.strictObject({
  title: z.string().trim().min(1),
  kind: z.enum(ITEM_KINDS),
  priority: optionalField,
  area: optionalField,
  plan: optionalField,
  lane: optionalField,
  blocked: optionalField,
  what: optionalText,
  why: optionalText,
  done: optionalText,
} satisfies Record<ItemSectionFlag, typeof optionalText> & Record<string, z.ZodType>);
const BATCH = z.array(BATCH_ENTRY).min(1);

/** The items an `item --from` file names, or the one line saying why the file is not a batch. */
export function parseItemBatch(json: unknown): { readonly items: readonly NewItemInput[] } | { readonly error: string } {
  const parsed = BATCH.safeParse(json);
  if (!parsed.success) {
    return { error: z.prettifyError(parsed.error) };
  }
  return {
    items: parsed.data.map((entry) => {
      const content: { [K in ItemSectionFlag]?: string } = {};
      for (const flag of sectionFlags(ITEM_SECTIONS)) {
        const text = entry[flag];
        if (text !== undefined) {
          content[flag] = text;
        }
      }
      return {
        title: entry.title,
        kind: entry.kind,
        priority: entry.priority ?? null,
        area: entry.area ?? null,
        plan: entry.plan ?? null,
        lane: entry.lane ?? null,
        blocked: entry.blocked ?? null,
        content,
      };
    }),
  };
}
