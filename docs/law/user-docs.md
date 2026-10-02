---
kind: law
status: active
updated: 2026-10-02
---

# User docs

How Orbweaver documents itself for the people who use it. [ADR 0282](../adr/0282-user-docs-live-in-the-github-wiki.md) records the decision.

## Home

User docs live in the repository's GitHub wiki. The wiki is its own git repository, `<repo>.wiki.git`; clone it and edit its pages as markdown. Nothing under `docs/` is a user doc, and the docs gates and `.claude/rules/writing.md` do not govern the wiki.

The wiki holds only user docs. Work state stays in `docs/work/`, decisions in `docs/adr/`, and agent rules in `docs/law/` and `.claude/`.

Restrict wiki editing to collaborators.

## What a page is

Each page is one of these:

| Kind | Answers | Examples |
| - | - | - |
| How-to guide | "How do I get this done?" | install, import from SillyTavern, connect a model |
| Explanation | "How does this work, and why?" | how memory recall works, how a turn is assembled |
| Dated artifact | "What is this app?" at one point in time | the features page, a launch post |

A page never mixes kinds. A how-to that stops to explain theory links to the explanation instead. A dated artifact is not kept current.

## Reference lives in the app

A setting's meaning has one home: its in-app help, the `teach` text of its `ConfigTeachView` in `packages/client/src/lib/registry-contracts.ts`. A wiki page never restates what a setting does. It names the setting and describes the task. When a page needs to explain a setting, fix the setting's `teach` text instead.

## Writing a page

- Describe the task and its outcome, never the layout. Write "open the Characters page", not "click the third icon in the top bar".
- Name every concept with its user-facing word from `docs/law/vocabulary-map.md`.
- Add a screenshot only where words fail. Render it from the live app with `pnpm snap`, so a new capture is one command.
- Write plain, friendly prose for a reader who has never seen the code. Leave out internal names, type names and file paths.
- Do not put version numbers or dates in a guide or explanation.

## Keeping pages true

Pages rot slowly because they describe tasks, not layout. When a reader reports a wrong page, fix that page. The wiki has no sync tooling, no review cadence and no version stamps.
