// The doc tool's closed vocabularies and tree coordinates — one home, so a new frontmatter kind or
// governed tree is a single reviewed edit.

export const ADR_KIND = "adr";
export const PLAN_KIND = "plan";
/** A plan waiting on something: it carries a `blocked` wake condition in the item blocker grammar. */
export const PARKED = "parked";
export const ITEM_KINDS = ["bug", "work", "decision", "tooling"] as const;
/** The four work-item states. Any transition is legal; the `doc` tool validates only the final shape. */
export const ITEM_STATES = ["open", "doing", "blocked", "done"] as const;

export const DATE_RE = /^\d{4}-\d{2}-\d{2}$/u;

/** The D-numbers reserved by the ledger's renumbering window; `pnpm doc new adr` never mints into it. */
export const FIRST_RESERVED_RULING = 79;
export const LAST_RESERVED_RULING = 105;

/** The trees the `doc` tool governs, checked by `ops/check.ts`. The formatter owns them too
 *  (`ops/format.ts`). One home for the four paths. */
export const DOC_TOOL_TREES = { adr: "docs/adr/", plans: "docs/plans/", work: "docs/work/", law: "docs/law/" } as const;
export const DOC_TOOL_TREE_PREFIXES: readonly string[] = Object.values(DOC_TOOL_TREES);

/** The instruction files `.claude/rules/writing.md` governs beside the docs; the writing rules alone run over
 *  their Markdown (`ops/check.ts`). A trailing `/` marks a tree. `.claude/` is never one: it holds the worktrees. */
export const INSTRUCTION_PATHS: readonly string[] = ["AGENTS.md", ".claude/agents/", ".claude/rules/", ".claude/skills/"];
