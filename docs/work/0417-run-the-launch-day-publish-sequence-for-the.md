---
kind: work
status: open
updated: 2026-10-07
priority: P1
area: launch
---

# Run the launch-day publish sequence for the repo, SDK release, template repos and wiki

## What

Prepare and execute the owner-approved launch sequence for repository visibility, SDK release, starter repositories, wiki and storefront updates. Coordinate existing release and template items rather than duplicating them.

## Why

Public starters and documentation must not point at inaccessible dependencies or pages.

## Done when

Keep publication blocked until explicit owner authorization. Then verify release downloads, clean starter installs and public wiki links from an unauthenticated context. Retain existing SDK and template acceptance.

## Evidence

Delegated source audit: `/tmp/claude-launch-punchlist/items.json`, proposal `27`. The report contains exact source paths, coupled tests and independent skeptic findings. Runtime and implementation acceptance remain required.

Plugin authoring is included in this launch. The SDK release and clean standalone starter acceptance are release requirements, not optional follow-up. Prepare them before publication; retain the owner gate on actual publication and pushes.

Launch priority groups are privacy and assigned completion, truthful imports and speaker behavior, prerequisite and default readiness, and public authoring distribution. P1 marks these release requirements. P2 marks non-blocking product follow-up; P3 marks optional cleanup and parked scope. Priority changes do not authorize new implementation assignments.

Before publishing, read the completed main integration barrier and ratchet results, reconcile required reviews, and confirm no assigned work remains unmerged in owned worktrees or stashes. Do not infer release readiness from the AST audit count. Query-worker resource changes remain owner-parked.

The owner selects main for development and release for stable distribution, with queued release automation and channel-aware update work. Include the approved local archival-tag cleanup in coordinated history preparation after all owned work is accounted for. Inventory the archive/wt/agent-\* and shelf/\* tag targets before removing only those obsolete local tags. Never push all tags; public publication still requires explicit authorization.
