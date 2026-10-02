---
kind: adr
status: active
updated: 2026-10-02
---

# User docs live in the GitHub wiki

## Context

D139 forbids a GitHub wiki because a wiki beside the work graph would become a second authority for status and law. End-user documentation answers a different question: how a person installs and uses the app. It holds no status, no decisions and no rules for agents.

## Decision

End-user documentation lives in the repository's GitHub wiki. The D139 ban covers status, work tracking and law, and it stays in force for those. The wiki holds how-to guides and explanations for users, plus dated artifacts such as the features page. It never holds work state, decisions or agent rules. The standing rules for the wiki are in docs/law/user-docs.md.

## Consequences

User docs do not version with releases, so pages describe tasks and outcomes rather than exact layout. Search engines index a GitHub wiki only after the repository reaches the star threshold GitHub sets, so early readers arrive through links. The pages are plain markdown and can move to GitHub Pages without a rewrite.

## Alternatives rejected

A user-docs folder under docs/ was rejected: that tree is agent law, and its gates and writing rules are the wrong bar for user guides. A separate docs site was rejected for launch: it adds a build and hosting for a handful of pages.
