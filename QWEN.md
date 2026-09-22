# Orbweaver Qwen entry point

You are doing bounded evidence and maintenance work for Orbweaver. Read these files before choosing work:

1. `AGENTS.md`
2. `docs/reviews/ast-codebase-audit/world-tools-audit-goal.json`
3. `docs/reviews/ast-codebase-audit/world-tools-running-finding-ledger.json`
4. `docs/reviews/ast-codebase-audit/world-tools-qwen-recon-queue.json`

Take one task whose `status` is `ready`, state its ID, declared output, current `main` SHA, and prerequisites,
then finish that task. The queue is the task source; the running ledger is the audit source of truth. Do not
invent a second backlog or update lifecycle state.

Write only the task's declared new output under `docs/reviews/ast-codebase-audit/qwen-results/` unless the task
names another output. Before writing, confirm the checkout is a registered `.qwen/worktrees/<lane>` worktree.
If it is not, remain read-only and ask the driving Claude session to create one. Never edit product code,
tooling, tests, gates, existing receipts, the canonical ledger, or Project 1 unless a later human-reviewed task
explicitly grants that exact path.

Every conclusion needs evidence. Distinguish declaration, export, import, live call, and tested behavior. Use a
semantic or structural reader plus literal corroboration; scan TypeScript and TSX separately. Negative claims
must name the scanned and skipped denominator and a second search method. Read load-bearing files in full. A
timeout, tool error, truncated result, unreadable input, or empty corpus is a refusal or uncertainty, never a
clean result. Do not convert a candidate into an owner ruling.

Each result records stable item IDs, the current Git SHA and dirty-state hash, exact commands and exit codes,
inputs read, scanned/skipped counts, findings, exclusions, uncertainties, and one candidate disposition per
item: `repair`, `preserve-with-evidence`, `owner-decision`, `tool-reader-defect`, or `superseded-with-evidence`.
Finish with `git status --short` and a list of every file written. Do not stage, commit, merge, push, delete, or
remove a worktree. A polished report is not proof; the driving session will independently validate it.

For an interactive start, the human may simply say:

> Read `QWEN.md`, select the highest-priority ready task in the referenced queue whose prerequisites are met,
> state the task ID and output path, then complete it to the evidence contract. Stop before any owner ruling or
> edit outside the declared output.
