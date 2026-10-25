---
kind: tooling
status: doing
updated: 2026-10-25
priority: P2
area: tooling
lane: closeout/dom
---

# The DOM-lock rules cover aliases, render initialisers and per-site homes

## What

Review of the DOM-lock rules found gaps. Aliases pass: document.querySelector.bind(document), .call(document, ...), a classList held in a local, classList.value writes and setAttribute('class'). orb/no-static-style-prop misses a module-constant member, a static useMemo object and a prop default (live: FallbackLetter in art-slot.tsx), and the skin-table style constants in art-decorations.ts and message-row-variants.ts. no-render-layout-read misses layout reads in useMemo and useState initialisers. no-sealed-library-internals flags prose and misses getElementsByClassName('cm-line'). The closest('\[inert]') exemption matches only the literal string. DOM_LOOKUP_HOMES is a whole-file ignores list, so new lookups in large homes pass; message-actions-row\.tsx, home-quick-picks-tile-body.tsx, gallery-lightbox.tsx and config-list-surface.tsx are ordinary components with one closest(). Lookups moved into unchecked tiers: components/skip-to-first-row\.tsx, forms/editor/focus-invalid-field.ts, stats/lib/leaderboard-row-focus.ts, labels-focus-targets.ts. orb/browser-support does not check addEventListener event names, so scrollend on the safari18 floor passed.

## Why

The owner asked that every finding be enforced; a rule with alias holes and whole-file homes reads as coverage it does not give, and the scrollend regression reached review because no rule saw it.

## Done when

Each gap has a planted red case in the rule tests; homes exempt named call sites, not whole files; the ordinary components use refs; event names are checked against the browser floor; whole-tree ESLint is 0 with no waivers.

## Evidence

Filled at landing: what ran and where its output is.
