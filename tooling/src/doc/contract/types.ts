// doc's shapes: the governed-tree snapshot the pure rules judge, the work item,
// and the closed command union the cli dispatches on. A new verb is a new arm here plus its handler.
import type { ITEM_KINDS, ITEM_STATES } from "./vocab.ts";

export type ItemKind = (typeof ITEM_KINDS)[number];
export type ItemState = (typeof ITEM_STATES)[number];

/** One document's frontmatter block, as `lib/frontmatter.ts#parseFrontmatter` reads it. */
export interface Frontmatter {
  readonly present: boolean;
  readonly malformed: boolean;
  readonly fields: Readonly<Record<string, string>>;
  readonly errors: readonly string[];
}

/** One tracked markdown file under a tree the tool governs, with its bytes. */
export interface GovernedDoc {
  readonly path: string;
  readonly source: string;
}

/** A top-level entry of `docs/`, for the allowed-folders rule. */
export interface DocsRootEntry {
  readonly name: string;
  readonly directory: boolean;
}

/** Everything the pure rules read, resolved once per run by `ops/tree.ts`. */
export interface DocTree {
  readonly root: readonly DocsRootEntry[];
  readonly docs: readonly GovernedDoc[];
  /** EVERY file under the governed trees, markdown or not, so a stray or a nested file is judged. */
  readonly files: readonly string[];
  /** The `evidence` commits of done items that git proves reachable from `main`. */
  readonly evidenceOnMain: ReadonlySet<string>;
}

/** The closed blocker vocabulary. A wake condition names a repository path and the presence that wakes
 *  the item; there is deliberately no command form, because a committed doc must never run a shell. */
export type Blocker =
  | { readonly kind: "owner" }
  | { readonly kind: "on"; readonly id: number }
  | { readonly kind: "wake"; readonly presence: "path" | "gone"; readonly path: string };

/** The content flags per minted kind: one per section an author fills at mint time, spelled `--<flag>` on
 *  the command line and `<flag>` in a `--from` batch file. `lib/templates.ts` binds each to its section. */
export const ITEM_SECTION_FLAGS = ["what", "why", "done"] as const;
export const ADR_SECTION_FLAGS = ["context", "decision", "consequences", "alternatives"] as const;
export const PLAN_SECTION_FLAGS = ["goal", "shape", "rejected", "coupled", "test-plan"] as const;
export type ItemSectionFlag = (typeof ITEM_SECTION_FLAGS)[number];
export type AdrSectionFlag = (typeof ADR_SECTION_FLAGS)[number];
export type PlanSectionFlag = (typeof PLAN_SECTION_FLAGS)[number];

/** The authored text per section. An absent section keeps its template prompt. */
export type SectionContent<F extends string> = { readonly [K in F]?: string };

/** One item to mint. `lane` makes it `doing`, `blocked` makes it `blocked`, neither leaves it `open`. */
export interface NewItemInput {
  readonly title: string;
  readonly kind: ItemKind;
  readonly priority: string | null;
  readonly area: string | null;
  readonly plan: string | null;
  readonly lane: string | null;
  readonly blocked?: string | null;
  readonly content?: SectionContent<ItemSectionFlag>;
}

/** One ADR or plan to mint; a null title derives from the slug. */
export interface NewDocInput<F extends string> {
  readonly slug: string;
  readonly title: string | null;
  readonly content?: SectionContent<F>;
}

/** One document write judged by the pre-write check: `from` is where the doc lives now, `doc` where and
 *  what it will be (a different path is a rename). */
export interface DocEdit {
  readonly from: string;
  readonly doc: GovernedDoc;
}

/** A parsed work item. Optional fields are `null` when absent; the state's companions are checked by
 *  `lib/items.ts#itemShapeProblems`, never at parse. */
export interface WorkItem {
  readonly id: number;
  readonly path: string;
  readonly title: string;
  readonly kind: ItemKind;
  readonly state: ItemState;
  readonly updated: string;
  readonly priority: string | null;
  readonly area: string | null;
  /** The EXACT branch name the lane works on; `drift` matches it against the live worktrees. */
  readonly lane: string | null;
  readonly blocked: string | null;
  readonly plan: string | null;
  readonly evidence: string | null;
  readonly reviewed: string | null;
}

/** The fields a transition may set. `null` clears a field; `undefined` leaves it alone. `kind` and `title`
 *  are never cleared; a new title renames the item's file. */
export interface ItemPatch {
  readonly state?: ItemState;
  readonly kind?: ItemKind;
  readonly title?: string;
  readonly priority?: string | null;
  readonly area?: string | null;
  readonly lane?: string | null;
  readonly blocked?: string | null;
  readonly plan?: string | null;
  readonly evidence?: string | null;
  readonly reviewed?: string | null;
}

/** A governed doc's index-facing summary. */
export interface DocSummary {
  readonly path: string;
  readonly title: string;
  readonly kind: string;
  readonly status: string;
  readonly supersededBy: string | null;
}

/** What `pnpm doc due` reads per doc: the review date and the repository paths the body cites. */
export interface DescribedDoc {
  readonly path: string;
  readonly updated: string;
  readonly describes: readonly string[];
}

/** A plan's lifecycle facts: `blocked` is the wake condition a `parked` plan carries, in the item
 *  blocker grammar. */
export interface PlanState {
  readonly path: string;
  readonly slug: string;
  readonly status: string;
  readonly blocked: string | null;
}

/** The git facts `pnpm doc drift` judges, resolved once by `ops/tree.ts` so the rule is pure. */
export interface DriftFacts {
  readonly items: readonly WorkItem[];
  readonly plans: readonly PlanState[];
  /** Branch names of every worktree beyond the main checkout. */
  readonly worktreeBranches: readonly string[];
  /** Branch names not merged into `main`. */
  readonly unmergedBranches: readonly string[];
  /** `Closes:` ids per recent `main` commit, newest first. */
  readonly closedOnMain: readonly { readonly sha: string; readonly ids: readonly number[] }[];
  /** Items whose wake condition the tree meets, by id. */
  readonly wokenItems: ReadonlySet<number>;
  /** Parked plans whose wake condition the tree meets, by slug. */
  readonly wokenPlans: ReadonlySet<string>;
}

export type DocCommand =
  | { readonly kind: "help" }
  | { readonly kind: "new-adr"; readonly slug: string; readonly title: string | null; readonly content: SectionContent<AdrSectionFlag> }
  | { readonly kind: "new-plan"; readonly slug: string; readonly title: string | null; readonly content: SectionContent<PlanSectionFlag> }
  | { readonly kind: "new-law"; readonly slug: string; readonly title: string | null }
  | { readonly kind: "item"; readonly input: NewItemInput }
  | { readonly kind: "item-batch"; readonly from: string }
  | {
      readonly kind: "status";
      readonly status: string;
      readonly paths: readonly string[];
      readonly by: string | null;
      readonly docKind: string | null;
      readonly blocked: string | null;
    }
  | { readonly kind: "remove"; readonly targets: readonly string[] }
  | { readonly kind: "set"; readonly ids: readonly number[]; readonly patch: ItemPatch }
  | { readonly kind: "land"; readonly ids: readonly number[]; readonly evidence: string }
  | { readonly kind: "land-merged" }
  | { readonly kind: "index" }
  | { readonly kind: "review"; readonly patterns: readonly string[] }
  | { readonly kind: "due"; readonly patterns: readonly string[] }
  | { readonly kind: "overview" }
  | { readonly kind: "drift" }
  | { readonly kind: "format"; readonly write: boolean; readonly files: readonly string[] };
