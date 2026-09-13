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
  /** The issue body — carries the dod-fenced block when the row has a Definition of Done (#923). */
  readonly body: string;
  readonly comments: readonly { readonly body: string }[];
  readonly blockers: readonly number[];
}

/** ONE row of the BULK board snapshot (`fetchIssueStates`, #2156's citation census). Every field is
 *  RUNTIME-VALIDATED at the network door before it lands here — the GraphQL payload is untrusted input,
 *  and a cast is not a check: an unvalidated `state` of `"STALE"` made an openness claim read as
 *  satisfied, because the only rejection was the exact string `"CLOSED"` (codex review F4, 2026-09-13).
 *
 *  `title`/`body` carry the SUBJECT the citation contract joins on, and `onBoard` says the issue is an
 *  item of Project `PROJECT_NUMBER` — a citation names a BOARD row, so an issue on no board is not one. */
export interface BoardIssueRow {
  readonly number: number;
  readonly state: "OPEN" | "CLOSED";
  readonly title: string;
  /** `""` when GitHub reports a null body — absent, never a missing measurement. */
  readonly body: string;
  readonly onBoard: boolean;
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
  /** `set` takes PAIRS (#923 P1 — the census's most-called verb at 1,502 single-field calls): N
   *  name/value assignments land as ONE batched field mutation per row. */
  | { readonly kind: "set"; readonly issues: readonly number[]; readonly assignments: readonly { readonly name: string; readonly value: string }[] }
  | { readonly kind: "verify" | "reverify"; readonly issues: readonly number[]; readonly evidence: string }
  /** `done` gains the LOUD override (#923): `override` is the `--force-close --reason` text — it skips
   *  the DoD run, records the reason + the overridden command as an issue comment, and closes. Null =
   *  the normal path, where a red DoD refuses the close. */
  | { readonly kind: "done"; readonly issues: readonly number[]; readonly evidence: string; readonly override: string | null }
  /** `refute --dod` mints the FAILING command as the row's bar in the same call that returns it to
   *  Ready — red-first is satisfied by the very failure being reported (#923). */
  | { readonly kind: "refute"; readonly issues: readonly number[]; readonly evidence: string; readonly dod: string | null }
  /** Re-mint (or first-mint) a row's DoD: red-first run, body-block upsert, Project stamp — the ONLY
   *  writer of the DoD field besides `file --dod` (`set` refuses it). `command` null = ADOPT the body's
   *  existing block (#923 P5 — the issue-form ingress), red-first, stamping without a body write. */
  | { readonly kind: "dod"; readonly issues: readonly number[]; readonly command: string | null }
  | { readonly kind: "park"; readonly issues: readonly number[]; readonly wake: string }
  | { readonly kind: "block"; readonly issues: readonly number[]; readonly blocker: number }
  | { readonly kind: "unblock"; readonly issues: readonly number[]; readonly blocker: number }
  /** `land` = the closing half of a row's lifecycle in ONE call: claim-if-needed → review → verify → done,
   *  with ONE `--evidence` satisfying the same-receipt rule `done` already enforces. It composes the
   *  EXISTING verbs (never a parallel path), so every guard, refusal and rerun property still holds. */
  | {
      readonly kind: "land";
      readonly issues: readonly number[];
      readonly lane: string | null;
      readonly evidence: string;
      readonly commentFile: string | null;
      /** The `--force-close --reason` text — same loud-override semantics as `done` (#923). */
      readonly override: string | null;
    };

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
  /** RED-FIRST at file time (#923): the command runs BEFORE any GitHub call and a green run REFUSES
   *  the row — a bug whose reproduction already passes is no bug, or the bar is wrong. */
  readonly dod: string | null;
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
  readonly body?: string;
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
