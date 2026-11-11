---
kind: bug
status: doing
updated: 2026-11-11
priority: P3
area: docs
lane: wt/agent-a30ee1d42d1997dfe
---

# The knowledge-cluster law says discovery never calls search while its dossier seam is wired to search

## What

The knowledge-cluster law doc states that discovery does not call search in the built slice, as a note under the two-cosine-access-patterns invariant. Discovery reads character-dossier neighbours from the search domain through an injected seam: the composition root binds it to search's similar-characters op, the dossier verb calls it, and the discovery service contract header records the seam. The law sentence was written after that wiring already existed, so it has been false of the built slice since the day it landed. Source: reports/codebase-review/units/dom-discovery.md.

## Why

This is the law sentence describing an architectural boundary that never described the code. A reader settling whether discovery may depend on search answers wrong, and the answer they get forbids a seam three files already rely on. The note can carry its real principle — analytic cosine stays in-RAM and never routes through search, while a delegated top-k retrieval is search performing search — which is the same delegation the note already grants memory.

## Done when

The knowledge-cluster law note distinguishes discovery's in-RAM analytics from the delegated top-k dossier read, names the injected seam as the one search dependency, and no sentence claims discovery never calls search. The discovery contract header and the composition root need no change.

## Evidence

Filled at landing: what ran and where its output is.
