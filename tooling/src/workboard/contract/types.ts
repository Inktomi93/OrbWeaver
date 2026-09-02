// workboard's shapes: the parsed operator command, the Project field/context model, and the encoded
// field writes. `WorkCommand` is the closed command union the cli dispatches on — a new verb is a new
// arm here plus its handler, and nothing else can invent one.

interface FieldOption {
  readonly id: string;
  readonly name: string;
}

export interface Field {
  readonly id: string;
  readonly name: string;
  readonly type: string;
  readonly options?: readonly FieldOption[];
}

export interface ProjectContext {
  readonly owner: string;
  readonly projectNumber: number;
  readonly projectId: string;
  readonly fields: readonly Field[];
}

export interface Issue {
  readonly id: string;
  readonly number: number;
  readonly title?: string;
  readonly url: string;
  readonly state: "OPEN" | "CLOSED";
  readonly comments: readonly { readonly body: string }[];
  readonly blockers: readonly number[];
}

export interface ItemState {
  readonly id: string;
  readonly projectId: string;
  readonly fields: Record<string, string>;
}

export interface WorkItemContext {
  readonly target: Issue;
  readonly item: ItemState;
}

export interface IssueContext {
  readonly target: Issue;
  readonly item?: ItemState;
}

/** The five canonical ingress classes (.github/ISSUE_TEMPLATE/*.yml). ONE tuple, derived type — the
 *  parser's refusal message and the type cannot drift apart. */
const ISSUE_CLASSES_ORDER = ["work", "bug", "decision", "program", "evidence"] as const;
export type IssueClass = (typeof ISSUE_CLASSES_ORDER)[number];

export interface IssueClassConfig {
  readonly labels: readonly string[];
  readonly projectKind: string;
  readonly review?: string;
  readonly status: string;
}

/** EVERY lifecycle verb takes a LIST of issues (#870). One call per row was the cost the census measured:
 *  a median of 3 separate board calls to walk ONE row through its lifecycle, re-billing the caller's whole
 *  context each time. The verb SEMANTICS are per-issue and unchanged — runLifecycle fans out and each row
 *  is guarded, written and reported exactly as it was when the list was always length 1. */
export type LifecycleCommand =
  | { readonly kind: "claim"; readonly issues: readonly number[]; readonly lane: string }
  | { readonly kind: "ready" | "review" | "needs-owner"; readonly issues: readonly number[] }
  | { readonly kind: "set"; readonly issues: readonly number[]; readonly field: string; readonly value: string }
  | { readonly kind: "verify" | "reverify" | "done" | "refute"; readonly issues: readonly number[]; readonly evidence: string }
  | { readonly kind: "park"; readonly issues: readonly number[]; readonly wake: string }
  | { readonly kind: "block"; readonly issues: readonly number[]; readonly blocker: number }
  | { readonly kind: "unblock"; readonly issues: readonly number[]; readonly blocker: number }
  /** `land` = the closing half of a row's lifecycle in ONE call: claim-if-needed → review → verify → done,
   *  with ONE `--evidence` satisfying the same-receipt rule `done` already enforces. It composes the
   *  EXISTING verbs (never a parallel path), so every guard, refusal and rerun property still holds. */
  | { readonly kind: "land"; readonly issues: readonly number[]; readonly lane: string | null; readonly evidence: string; readonly commentFile: string | null };

export interface CreateCommand {
  readonly kind: "create";
  readonly issueClass: IssueClass;
  readonly title: string;
  readonly bodyFile: string;
}

/** `file` = the opening half in ONE call: create → Kind/Priority/Area/Review → ready → claim. Everything
 *  past the class and title is optional, so it is exactly `create` plus the writes the caller supplied —
 *  an omitted `--priority` is not a silent default, it simply is not written, and `ready`'s own metadata
 *  guard is what refuses an incomplete row. */
export interface FileCommand {
  readonly kind: "file";
  readonly issueClass: IssueClass;
  readonly title: string;
  readonly bodyFile: string | null;
  readonly priority: string | null;
  readonly area: string | null;
  readonly review: string | null;
  readonly ready: boolean;
  readonly lane: string | null;
}

export interface ListCommand {
  readonly kind: "list";
  readonly status?: string;
}

export type WorkCommand =
  | { readonly kind: "help" }
  | { readonly kind: "overview" }
  | { readonly kind: "show"; readonly issues: readonly number[] }
  | ListCommand
  | CreateCommand
  | FileCommand
  | LifecycleCommand;

export type GraphqlVariables = Readonly<Record<string, string | number>>;

export interface FieldChange {
  readonly name: string;
  readonly value?: string;
}

export type EncodedWrite =
  | { readonly kind: "text" | "option"; readonly fieldId: string; readonly fieldName: string; readonly value: string; readonly local: string }
  | { readonly kind: "clear"; readonly fieldId: string; readonly fieldName: string };

export interface FieldValueNode {
  readonly text?: string;
  readonly name?: string;
  readonly field?: { readonly name?: string };
}

export interface RawFieldNode {
  readonly __typename: string;
  readonly id?: string;
  readonly name?: string;
  readonly options?: readonly FieldOption[];
}

interface RawItemNode {
  readonly id: string;
  readonly project: { readonly id: string; readonly number: number };
  readonly fieldValues: { readonly nodes: readonly FieldValueNode[] };
}

export interface RawIssueNode {
  readonly id: string;
  readonly number: number;
  readonly title?: string;
  readonly url: string;
  readonly state: "OPEN" | "CLOSED";
  readonly comments: { readonly nodes: readonly { readonly body: string }[] };
  readonly blockedBy: { readonly nodes: readonly { readonly number: number; readonly state: "OPEN" | "CLOSED" }[] };
  readonly projectItems: { readonly nodes: readonly RawItemNode[] };
}

export interface ListRow {
  readonly content?: { readonly number?: number; readonly title?: string; readonly url?: string };
  readonly fields: Readonly<Record<string, string>>;
}

export interface RawListPage {
  readonly node?: {
    readonly items?: {
      readonly pageInfo: { readonly hasNextPage: boolean; readonly endCursor?: string | null };
      readonly nodes: readonly {
        readonly content?: { readonly number?: number; readonly title?: string; readonly url?: string } | null;
        readonly fieldValues: { readonly nodes: readonly FieldValueNode[] };
      }[];
    };
  } | null;
}
