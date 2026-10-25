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

Implemented alias-aware lookup and class-write rules in `tooling/src/eslint/ui-dom.ts`. `DOM_LOOKUP_HOMES` binds a function path, receiver, method and selector; it no longer excludes files. The rule covers every client source tier and rejects duplicate, stale and additional operations. Dynamic selector normalization preserves meaningful CSS whitespace.

Static styles include module members, memo initializer returns, prop defaults and authored React CSSProperties objects. Render layout reads include memo, state and reducer initializers. Sealed-selector controls distinguish prose and class-name lookups. Browser event checks use native DOM receiver types and BCD event records; settings guards scrollend and retains its existing timer fallback.

The gallery popup, message column, Home grid, settings content pane, connection picker and FaceStrip use explicit refs. The settings arrival effect waits for the selected band's ref; the retained-content predicate runs after commit. No timer or retry was added.

Old-source controls failed for the reported gaps. Current DOM controls pass 82 cases; browser support passes 45. Native CTs cover Select focus and cleanup, FaceStrip rename/removal, row-edit footprint, gallery viewport fit, Home coarse-pointer columns, settings arrival and jumps. Final affected compiler and scoped ESLint checks pass. The CSS lane owns the exposed artwork-style migrations; main owns the integrated whole-client verdict. Full commands, failures, corrections and limits are in `docs/reviews/dom-closeout.md`.

Independent review correction: locally held apply arrays and untagged class-name templates now use the shared static method/argument reader. Red controls report 6 failed and 86 passed before implementation; the corrected DOM suite passes 100. Sibling controls cover aliases, TypeScript wrappers, known array spreads, holes, opaque leading spreads, call/apply/bind templates, public names and the inert marker. No product behavior changed.

The independent review correction passes scoped ESLint, Biome with --error-on-warnings and the tooling compiler. The reviewer confirms both original probes and the bounded correction diff.

Integration finding: follow-yield registers wheel and touch as alternate input modalities. Each now checks its own event-handler property; keydown and cleanup are unchanged. The browser-floor rule retains its findings without waivers. Public MessageList simulated API profiles pass callback dispatch and cleanup for wheel-only, touch-only and combined availability. Reduced profiles fail on the unmodified producer while the combined control passes. Browser-support controls pass 51 cases; affected compiler programs and production lint pass. These simulations are not real Safari hardware qualification.
