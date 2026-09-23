// doc's shapes: the governed-tree snapshot the pure rules judge, the parsed ledger ruling, the work item,
// and the closed command union the cli dispatches on. A new verb is a new arm here plus its handler.
import type { ITEM_KINDS, ITEM_STATES } from "#doc-catalog";

export type ItemKind = (typeof ITEM_KINDS)[number];
export type ItemState = (typeof ITEM_STATES)[number];

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

/** The reserved D-number window the registry declares in its own note. */
export interface RulingRange {
  readonly lo: number;
  readonly hi: number;
}

/** Everything the pure rules read, resolved once per run by `ops/tree.ts`. */
export interface DocTree {
  readonly root: readonly DocsRootEntry[];
  readonly docs: readonly GovernedDoc[];
  /** D numbers anchored in the legacy registry (both row shapes). */
  readonly registryIds: ReadonlySet<number>;
  readonly reserved: RulingRange | null;
}

/** One ledger ruling as the splitter reads it. `body` is the ruling's markdown after its anchor. */
export interface Ruling {
  readonly id: number;
  readonly title: string;
  readonly body: string;
  readonly shape: "bullet" | "section";
}

export interface RegistryParse {
  readonly rulings: readonly Ruling[];
  readonly duplicates: readonly number[];
  readonly reserved: RulingRange | null;
}

export type Blocker = { readonly kind: "owner" } | { readonly kind: "on"; readonly id: number } | { readonly kind: "wake"; readonly command: string };

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
  readonly lane: string | null;
  readonly blocked: string | null;
  readonly plan: string | null;
  readonly evidence: string | null;
  readonly reviewed: string | null;
}

/** The fields a transition may set. `null` clears a field; `undefined` leaves it alone. */
export interface ItemPatch {
  readonly state?: ItemState;
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

/** The git facts `pnpm doc drift` judges, resolved once by `ops/tree.ts` so the rule is pure. */
export interface DriftFacts {
  readonly items: readonly WorkItem[];
  /** Branch names of every worktree beyond the main checkout. */
  readonly worktreeBranches: readonly string[];
  /** Branch names not merged into `main`. */
  readonly unmergedBranches: readonly string[];
  /** `Closes:` ids per recent `main` commit, newest first. */
  readonly closedOnMain: readonly { readonly sha: string; readonly ids: readonly number[] }[];
  /** Wake commands that exited 0 when run, keyed by item id. */
  readonly wokenItems: ReadonlySet<number>;
}

export type DocCommand =
  | { readonly kind: "help" }
  | { readonly kind: "new-adr"; readonly slug: string; readonly title: string | null }
  | { readonly kind: "new-plan"; readonly slug: string; readonly title: string | null }
  | {
      readonly kind: "item";
      readonly title: string;
      readonly itemKind: ItemKind;
      readonly priority: string | null;
      readonly area: string | null;
      readonly plan: string | null;
      readonly lane: string | null;
    }
  | { readonly kind: "status"; readonly status: string; readonly paths: readonly string[]; readonly by: string | null }
  | { readonly kind: "set"; readonly ids: readonly number[]; readonly patch: ItemPatch }
  | { readonly kind: "land"; readonly ids: readonly number[]; readonly evidence: string }
  | { readonly kind: "land-merged" }
  | { readonly kind: "archive"; readonly targets: readonly string[] }
  | { readonly kind: "index" }
  | { readonly kind: "review"; readonly patterns: readonly string[] }
  | { readonly kind: "due"; readonly patterns: readonly string[] }
  | { readonly kind: "overview" }
  | { readonly kind: "drift" }
  | { readonly kind: "migrate-ledger"; readonly range: RulingRange | "all"; readonly apply: boolean };
