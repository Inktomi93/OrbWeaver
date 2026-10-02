---
kind: adr
status: active
updated: 2026-10-02
supersedes: docs/adr/0222-docs-plans-adrs-no-archive.md
---

# Documentation lifecycle permits bounded publication editorial corrections

## Context

Documentation decisions must retain their authority while the owner-approved publication scrub removes private material and editorial wording.

## Decision

Docs remain markdown in docs/law, docs/adr, docs/plans and docs/work, plus the mission document. Standing law, decisions, program designs and work items retain their separate homes. Agent run output stays outside the governed documentation tree. Vendored documentation stays outside the tracked tree.

Agents edit prose. Use pnpm doc for numbering, frontmatter, status, supersession, work transitions, deletion and generated indexes. The tool rewrites frontmatter or generated files, never prose. Its deletion guard must refuse unresolved citers.

An ADR retains its D number and records a contested or expensive-to-reverse decision. Semantic changes require a successor ADR and tool-written supersession links. Preserve every still-binding constraint in the successor. ADR status lives only in frontmatter.

The owner-approved current-tree publication scrub permits a bounded editorial exception. Remove private identities and apply the supplied neutral replacements without changing a decision's technical meaning. This exception covers the recorded privacy inventory and the exact neutral spans for ADRs 0018, 0044, 0047 and 0049. Preserve their identifiers, authority, requirements and neutral attribution. Record the changed spans and review their semantic equivalence. Other ADR body edits remain prohibited. Git history rewriting and publication remain separate operations.

pnpm check:agents checks documentation structure, required sections, size limits, indexes, paths and writing rules. The canonical rules remain in tooling/src/doc/lib/rules.ts and tooling/src/\_shared/prose-rules.ts; prose style remains in .claude/rules/writing.md.

Every cited path, symbol, heading and decision identifier must resolve. pnpm doc due reports source drift as a warning, not a failed gate. Keep only the updated review date for freshness; use pnpm doc review rather than adding hashes or commit pins.

Work items retain open, doing, blocked and legacy done states. Any work transition is legal; the checker validates only its final shape. Lanes do not change board state. Their closing trailers let the main merge hook land work and commit the resulting board changes. The main hook commits its board writes under the standing commit contract with the pre-commit check excluded. Plan task indexes remain generated from work items.

A plan with no open work has finished. Move its lasting knowledge into law or an ADR, then remove it through pnpm doc. Git retains its history; do not add an archive home under docs. Retain the current checker until a legacy home migrates, and require migrated files to pass current rules.

## Consequences

The structural writer, checker, review-date model and decision authority remain unchanged. Publication cleanup cannot be used to reverse a technical ruling or weaken proof.

## Alternatives rejected

Broad permission to rewrite ADRs is rejected. Deleting decision authority to remove editorial wording is rejected. A second documentation store or checker remains unnecessary.
