---
kind: reference
status: active
updated: 2026-07-13
---

# Orbweaver — Path/Home Registry: D66

> Split-sibling of `Core-Laws-and-Precedents.md` §7. Decision **D66**: the UI-cohesion program — one
> active UI work doc, one north-star rail entry (Chats), four explicit amendments to D62 rulings.

---

- **D66 — The UI-cohesion program (2026-07-13). AMENDS D62 (four rulings); consolidates the UI doc set.**
  A live-app design review (2026-07-13, snaps in `reports/snaps/`) found the four panes don't read as
  one frame: no shared chrome baseline, unrationed ember, always-on action strips, triple-duplicated
  actions, token-count noise. Root cause was partly DOC SPRAWL — 8+ quotable UI sources at 4 authority
  levels let each spawned agent cherry-pick. **The program:**
  [`../proposed/ui-cohesion-north-star.md`](../proposed/ui-cohesion-north-star.md) is now **THE one
  active UI work doc**, and `proposed/` holds exactly ONE active program doc at a time (its README is
  the rule + the map). `ui-polish-punchlist.md`, `ux-flow-revamp.md`, and `DESIGN-REVIEW-2026-07-01.md`
  are ARCHIVED to `../history/` (their open remainders ported to the program doc §6 — UIP-404, UIP-405
  (blocked #50), the §8 slivers, J10/J11/L7); `ui-package-design.md` and `motion-and-animation-guide.md`
  are PROMOTED to `core/` as `kind: law` (ui-package-design's §-numbers stay stable); every unbuilt
  design set moved OUT of the repo to `../orbweaver-proposed-staging/` (sibling dir); the four
  root-level `FINAL-*.md` design-competition docs are RETIRED (deleted; git history keeps them —
  everything but the two chat ones had fully landed, and the chat ones are superseded by this
  program); the gitignored
  `reference/` copies (neo-tavern, design mockup) were deleted (real checkouts live in the development
  folder). Same day, a fleet comment-diet pass removed port-era narration/doc-citations from code
  comments (keep-list: functional directives, ≤3-line file headers, one-line constraint WHYs,
  FLAG[PD-n]).
  **Build strategy: north star first** — the Chats rail entry is polished end-to-end (program doc §4
  N1–N5) and gates every other section's lane; sections then copy a working example, not prose.
  **The four amendments** (full text + why: program doc §3):
  **A1** (amends D62 UIP-202) — the LIST panel gets a real `.shell-panel-header` band on the shared
  `--dimension-chrome-row` baseline; the triple-title fix is preserved (the band REPLACES the surface's
  own title row).
  **A2** (amends D62 UIP-302) — the list-header **New** is the panel's ONE `primary` button, not a
  ghost `+` (P2 ownership: the list owns create; the landing-hero ember duplicate is demoted instead).
  **A3** (amends the D62 §B.1 dim-at-rest posture, `message-actions-reveal.ts`) — message-action
  clusters rest HIDDEN (`opacity-0 pointer-events-none`), reveal on hover/`focus-within`;
  `pointer-coarse:opacity-100` and the `messageActions=expanded` pref stay honored; the Wave-1
  opacity-0 flex-starvation P0 re-checked and absent (cluster keeps its box; measured slack in the
  geometry CT).
  **A4** (amends the D62-era button-gated save model) — AUTOSAVE EVERYWHERE (program doc §7): no
  Save/Set/Discard on any editor; one `Saved/Saving…/Save failed — retry` micro status; chat-overrides
  autosave is the precedent; client-side wiring only (no server change); the orphaned `save-bar` /
  `DirtyPill` primitives stay in the package pending a separate removal decision.
  Everything else in D62 (region law §4.2/§4.3, P rulings, pointer-conditional control heights,
  focus-ring cluster, micro-caps voice) STANDS. Presets remain a rail section (settles the
  presets-placement question ux-flow L7 was pending on; Connections goes to Settings per J11).
  (Nate — chose Chats as the north star + full doc consolidation over minimal, 2026-07-13.)
