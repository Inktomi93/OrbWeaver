---
kind: bug
status: doing
updated: 2026-10-12
priority: P1
area: tests
lane: wt/agent-a7d3f16c6a2229878
plan: test-mirror
---

# Test fixtures call production logic instead of copying it

## What

Fixtures re-implement server rules: chat list paging and search (chat/fixtures.ts:46-77), character list sort cursors (character/fixtures.ts:179-221), databank phase rules with an impossible indexing state and a golden built on it (databank/fixtures.ts:96-173, databank-library-surface.ct.tsx:299), connection label minting without the collision suffix (\_connection-fixtures.ts:162-176), rpg effective delivery (rpg/fixtures.ts:35-40), cookie auth mode (auth-config-fixtures.ts:10-28), the settings shallow merge versus the server deep merge (autosave-convergence.suite.test.ts:45-53), context tab defaults (app-shell/\_ct-stories.tsx:1071-1073), and a greeting studio harness that wires a character.update path production never takes. Move each pure rule to @orb/contracts or @orb/kit and call it from both sides; fold in the server and remaining-region audit findings in the same category.

## Why

A copied rule keeps the test green whatever production does; item 879 shipped a copied SQL query in a harness for the same reason.

## Done when

Every category A row in the test-mirror audit inventories is fixed by calling the production rule or deleted; each fix shows a red when the production rule is changed; no fixture can mint a state the server cannot produce.

## Evidence

Scope closed by owner ruling: the in-flight legs finish and are verified, then this item closes. Rows driven by legacy test files (list paging and sort cursors through stub responders, the remaining server harness rows) are not chased; they become e2e cases or composition-root tests under the test-foundation plan, and compose closures become exported factories under item 958.

Filled at landing: what ran and where its output is.
