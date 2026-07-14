---
kind: history
status: superseded
updated: 2026-07-13
---

# UI-Architecture-and-Layout — archaeology record

> Frozen 2026-07-13, extracted from UI-Architecture-and-Layout.md. The origin narration and the
> superseded design-seed iterations that justified the client's shape while the redesign was in flight.
> The layout landed; this is why-we-got-here, not current law. Live UI law is
> `../core/UI-Architecture-and-Layout.md` (+ the rest of the `UI-*` set).

## Where this came from (the two prior-art inputs)

Two inputs, both *prior art*, not law: (1) the Phase-4b neo-tavern client critique (the single-route
`this_chid` jank, the cross-lib footgun cluster); (2) the Claude-Design redesign handoff (the
intent-token system, surfaces/anchors doctrine). The core doc is the law that resulted from them.

## The design-seed "modes" saga (cut)

The Claude-design handoff shipped a `Hearth`/`Loom`/`Pocket` "modes" concept and a VS-Code-style
"Work mode." Neither did the structural work it claimed; both were **CUT** (amended D62). The ruling
that survived is now §4.1/§12.1 law: **themes are color palettes only — there is NO structural mode**;
the rail + panels render identically under any palette.

What was kept from the seed corpus (the since-deleted, gitignored `reference/design/`): the palette
(OKLCH ramp + **Ember** + **Geist**, the §3 token seed) AND — added by D62 — its **visual grammar as
reference** (control metrics, popover chrome, micro-caps/mono voice, empty-state style; the D62 program
docs cited it file-by-file). The `reference/` mockup copies were deleted under D66 (real checkouts live
in the development folder), so the seed survives only as the tokens and grammar already folded into the
core law.
