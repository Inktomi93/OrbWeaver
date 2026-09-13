---
kind: review
status: active
updated: 2026-09-02
---

# CT corpus audit — leg 4, shard (c): UI primitives (#1229)

Lane `cb-ct-audit-4c`. Parallel shard alongside two siblings running the same campaign method
(rubric + taxonomy from `docs/reviews/stickler/2026-09-02-ct-corpus-audit-leg1.md`, read in full).

**Deviation from the brief:** the brief names `2026-09-02-ct-corpus-audit-leg3.md` for the §5 shard
map + §6 quality bar. That file does not exist on this tree — only leg1 and leg2 exist
(`docs/reviews/stickler/` listing: `2026-09-02-ct-corpus-audit-leg1.md`,
`2026-09-02-ct-corpus-audit-leg2.md`). It is presumably being written concurrently by a sibling shard
and had not landed at the time I read. This did not block the work: the brief's own task text fully
enumerates my 17-primitive shard list, and leg1's rubric + taxonomy (read in full) is the governing
method. I cross-checked leg1's Appendix A and leg2's per-file verdict headers for overlap with my list —
none of my 17 files are marked `[READ-LEG1]` or appear in any leg2 chunk, so nothing here is a re-read.

## Shard — files read (all 17, in the order given, all full-read top to bottom)

| # | Primitive | Path | Lines | Verdict |
| - | - | - | - | - |
| 1 | switch | `tests/ui/primitives/switch/switch.ct.tsx` | 559 | CLEAN |
| 2 | select | `tests/ui/primitives/select/select.ct.tsx` | 312 | CLEAN |
| 3 | macro-textarea | `tests/ui/primitives/macro-textarea/macro-textarea.ct.tsx` | 228 | **F1** at :206-208 |
| 4 | toggle | `tests/ui/primitives/toggle/toggle.ct.tsx` | 129 | CLEAN |
| 5 | text | `tests/ui/primitives/text/text.ct.tsx` | 105 | CLEAN |
| 6 | icon | `tests/ui/primitives/icons/icon.ct.tsx` | 178 | CLEAN |
| 7 | command | `tests/ui/primitives/command/command.ct.tsx` | 215 | CLEAN |
| 8 | popover | `tests/ui/primitives/popover/popover.ct.tsx` | 290 | CLEAN |
| 9 | drawer | `tests/ui/primitives/drawer/drawer.ct.tsx` | 233 | CLEAN |
| 10 | table | `tests/ui/primitives/table/table.ct.tsx` | 205 | CLEAN |
| 11 | avatar-stack | `tests/ui/primitives/avatar-stack/avatar-stack.ct.tsx` | 127 | CLEAN |
| 12 | selection-bar | `tests/ui/primitives/selection-bar/selection-bar.ct.tsx` | 171 | CLEAN |
| 13 | stream-text | `tests/ui/stream/stream-text.ct.tsx` | 62 | CLEAN |
| 14 | art-bleed | `tests/ui/art/art-bleed/art-bleed.ct.tsx` | 63 | CLEAN |
| 15 | weave-veil | `tests/ui/art/web-weave/weave-veil.ct.tsx` | 57 | CLEAN |
| 16 | stack | `tests/ui/layout/stack.ct.tsx` | 58 | CLEAN |
| 17 | layer | `tests/ui/layout/layer.ct.tsx` | 58 | CLEAN |

**17/17 files, 3,050 lines, full-read.** Skipped-as-already-read: none (verified against leg1
Appendix A + leg2's per-file headers — zero overlap).

## Finding

### F1 · P4 — an un-failable belt-and-suspenders assertion on `macro-textarea.ct.tsx`

`tests/ui/primitives/macro-textarea/macro-textarea.ct.tsx:200-208`

```ts
test("a 60-word ghost default never becomes the field's accessible name", async ({ mount, page }) => {
  // The exact defect shape: the accname algorithm's combobox arm fell through to the VALUE, so a template
  // editor announced its entire 60-word template as the field's own name, twice.
  await mount(<GhostDefaultStory />);
  const control = page.getByRole("textbox", { name: "Template" });
  await expect(control).toHaveAccessibleName("Template");
  await expect
    .poll(async () => await control.evaluate((el) => (el as HTMLTextAreaElement).labels?.[0]?.textContent ?? ""))
    .not.toContain("Forget all other previous instructions");
});
```

- The test's title and comment describe side-eye F-3 (2026-08-03): with `role="combobox"` applied
  unconditionally, the ARIA accname algorithm's combobox arm falls through to the control's *value*
  (or here, effectively the ghost `placeholder`), so the field's accessible name became the 60-word
  template text instead of its label.
- Line 205's `toHaveAccessibleName("Template")` is the correct, failable pin for that defect — it reads
  the actual computed accessible name via the accname algorithm, exactly the property the regression
  corrupts.
- Lines 206-208 read a DIFFERENT property: `el.labels[0].textContent` — the raw DOM text of the
  associated `<label>` element. `GhostDefaultStory` (fixtures.tsx:69-82) renders
  `<Field label="Template"><MacroTextarea placeholder="[Forget all other previous instructions…]" value={value} .../></Field>`
  with `value` fixed at `""` for the whole test (no typing occurs). The `<label>` element Field renders
  is built solely from the static `label="Template"` prop — its `.textContent` is `"Template"`
  regardless of `role`, `aria-label`, `aria-labelledby`, or any accname computation, because
  `HTMLElement.labels` is a native DOM relationship (`for`/ancestor) entirely independent of ARIA role
  or the accessible-name algorithm. No code state of `MacroTextarea` — regressed or fixed — can make
  this label's own text content contain the placeholder string; the placeholder text lives only in the
  `placeholder` attribute and (if typed) the textarea's `value`, never in the `<label>` node.
- Per the taxonomy's un-failable-negative shape: this is a pin whose target property structurally
  cannot carry the string being excluded, so the assertion passes on every possible source state,
  including the pre-fix regression this test's own comment names. It adds no coverage beyond line 205;
  it just always passes.
- Fix shape: delete lines 206-208 (line 205 already carries the whole defect proof), or, if the intent
  was to also guard the *rendered label text* against corruption, read something that could plausibly
  vary — e.g. compare `control`'s accessible name computation path directly rather than a static DOM
  property unrelated to it.
- Severity P4: it is dead weight beside a correct sibling assertion, not a coverage hole — F-3 is
  fully covered by line 205 alone.
- Law: leg1's taxonomy item "un-failable negative … the computed value falls back to the initial and
  the assert can never fail" (this brief's own wording, echoing leg1 F2's shape) — here the failure
  mode is a property that was NEVER coupled to the defect at all, rather than a property that fell back
  after a fix.

## Taxonomy sweep — this shard only (17 files, 3,050 lines)

All patterns cross-checked with a planted positive control in the same invocation
(`/tmp/cb-ct4c-control.txt`, all four patterns matched, file removed — `git status --short` unaffected,
it never touched the repo).

| Class | Result |
| - | - |
| Assertion-free tests | 0 (every `test(...)` body inspected during the full read; every one asserts) |
| Tautologies / literal `toBeTruthy()` | 0 (grep matched the control's planted `expect(true).toBeTruthy()`; zero real hits) |
| `test.skip/.fixme/.todo` | 0 (grep matched the control's planted `test.skip`; zero real hits) |
| `as unknown as` / `as any as` double-casts | 0 (grep matched the control's planted cast; zero real hits — no fabrication scaffolding needed anywhere in this shard, consistent with these being pure-rendered-DOM primitive seals with no browser-context probe slots) |
| Literal `reports/` screenshot writes | 0 (grep matched the control's planted literal; the shard's one screenshot site — `icon.ct.tsx:177` — correctly uses `storyShot("icon-seal-gallery")`, the sanctioned `tests/support/node/story-shot.ts` helper) |
| `FABRICATION-OK` markers | 0 (none present; consistent with the zero-double-cast result above) |
| `ONESHOT-OK` markers | 27 across 12 files (counts above). Every site sampled during the full read names a settled/static read (a resolved `evaluate()` off a completed mount/click, a static CSS declaration, or a positive-control sentinel check) — none racing an async effect. None share the leg1-flagged 41-`tests/ui/` boilerplate reason verbatim; several (`selection-bar.ct.tsx:164,166,168`) carry file-specific reasons naming their own positive control |
| `getByRole(name:)` without `exact` | present at scale (not counted — same as leg1's judgment: majority correct substring use); one deliberate `exact: true` accname-trap avoidance found and verified correct: `select.ct.tsx:255` (`{ name: "Beta", exact: true }`, guarding against the option's own gloss text bleeding into the name), and `command.ct.tsx` uses no glossed items so no trap exists there |
| Stand-in-children fences (a budget/layout proof using cheaper children than the real control) | 0 — `selection-bar.ct.tsx:92-171`'s two width-budget pins (#843, #1137) explicitly mount the REAL `@orb/ui` `<Button>` at the real size, with an in-file comment explaining why a bare `<button>` would not reproduce the defect (~40% narrower) |
| Tabs/panels accumulating on visit | N/A — none of the 17 primitives in this shard are tab/panel hosts |
| Shared-render-tree reads breaking siblings | N/A — every file mounts fresh per test via `mount()`; no shared fixture state read across tests |
| Wrapped ONESHOT-OK marker window (must be exactly `expect`'s own line or line-1) | Spot-checked every non-adjacent-comment site (all 27); every marker sits directly above its `expect(...)` call, no wrapped multi-line markers found |
| Anchor/fence self-labelling on pins that pass against the unmodified tree | The shard's anchors are heavily self-labelled: `switch.ct.tsx`'s whole `#1109`/`#424`/`#1090`/`#1170` block explicitly narrates FENCE vs defect-proof for each pin (":449-463" is the clearest instance — states outright which half is a FENCE and why); `art-bleed.ct.tsx`'s geometry pins are relation-based (not literal), self-evidently anchors against the live token, and their comments say so; no pin found reading as a defect proof without stating which it is |

## Premise currency (spot-verified)

- `packages/ui/src/primitives/macro-textarea/macro-textarea.tsx:144-155` — confirmed the F-3 fix is
  live on today's source: the file header states the native-`textbox`-role fix and its three-defect
  rationale verbatim-consistent with the CT's comment; `role="combobox"` is gone (grep for `role=` in
  that file shows only `role="listbox"`/`role="option"`/`role="presentation"` inside the suggestion
  popup, never on the control itself).
- `packages/ui/src/primitives/macro-textarea/macro-textarea.fixtures.tsx:69-82` — confirmed
  `GhostDefaultStory`'s shape backing F1's finding (placeholder carries the ghost text, `value` starts
  and stays `""`).
- All `data-slot` selectors sampled during the reads (switch-thumb, select-popup/positioner/arrow,
  command-root/group-heading, popover-popup/backdrop/viewport, drawer-popup/backdrop/indent/swipe-area,
  avatar-stack-item/overflow/fallback, selection-bar-root/count/clear, art-bleed, macro-textarea-status/
  helper/arg-hint) are role/selector names asserted against; none read as stale on inspection (all
  match the file headers' own vocabulary and, where cross-checked against source above, the current
  component).

## Coverage — top gaps (none load-bearing enough to warrant a new pin; noted per the brief's "top gaps only")

- None found. Every primitive in this shard has a rendered-geometry or token-derived pin for its
  load-bearing behavioral contract (open/close, keyboard nav, selection/multi-select, focus trap,
  token-riding paint, touch-floor, a11y naming) — this matches leg1's headline ("the corpus is in
  exceptional condition") and the file headers' own stated intent (most are explicit "seal" CTs written
  to close a specific side-eye/owner-ruling defect, so their coverage is defect-driven and dense).

## Run budget

**0 of 2 permitted `pnpm ct:scoped` runs used.** Every verdict above is read-derived (source inspection

- grep sweeps with a planted positive control), matching leg1/leg2's precedent that 0 runs sufficed for
  the whole campaign so far.

## What I did not reach

Nothing in my named shard — all 17 files are full-read and tabled above. I did not touch any file
outside this list, the catalog, or `reports/*.json` (per the fence instructions). I did not read the
sibling shards' scope (switch/select/etc. neighbors like `accordion`, `alert-dialog`, `checkbox`,
`radio-group`, `menu`, `tooltip`, `combobox`, `autocomplete`, `field`, `dialog`, `fieldset`, and the
rest of `tests/ui/primitives/**` / `tests/ui/charts/**` / `tests/ui/content/**` — those belong to other
shards or remain unassigned).

## Verified clean — what this shard's silence covers

- The 17 named files' internal honesty/harness quality in full (Phase B-equivalent read, this leg).
- Zero stale `data-slot`/role selectors in this shard (spot-verified against current
  `packages/ui/src/primitives/**` source for the two files whose defect-history comments made currency
  load-bearing: `macro-textarea` and `switch`; the rest read consistent with their own file headers and
  were not independently re-derived against source line-by-line beyond that).
- Taxonomy classes tabled above, each corroborated by a planted positive control in the same
  invocation.

## Proposed memory lesson (orchestrator owns the write)

- `[dom-label-vs-accname](dom-label-textcontent-is-not-the-accname.md)` — `el.labels[0].textContent`
  reads a static DOM relationship (`<label for>`/ancestor), never the computed ARIA accessible name; a
  pin guarding an accname-computation regression (role override, `aria-labelledby` swap, combobox
  fallback-to-value) must read `toHaveAccessibleName`/the accname algorithm, not `.labels[]`, or the
  assertion is structurally un-failable no matter what the regression does. **Why:** found live at
  `tests/ui/primitives/macro-textarea/macro-textarea.ct.tsx:206-208`, a redundant belt-and-suspenders
  check beside an already-correct `toHaveAccessibleName` pin two lines above it. **How to apply:** when
  auditing an a11y-naming CT, check that every assertion actually reads the SAME property the named
  defect corrupted — a DOM-adjacent-but-uncoupled property reads as coverage and provides none.

## Issue summary (for #1229 — paste verbatim)

> **CT corpus audit leg 4, shard (c) — UI primitives (cb-ct-audit-4c): 17/17 named files full-read
> (3,050 lines): switch, select, macro-textarea, toggle, text, icon, command, popover, drawer, table,
> avatar-stack, selection-bar, stream-text, art-bleed, weave-veil, stack, layer. Verdict: 16 CLEAN, 1
> P4 finding — `macro-textarea.ct.tsx:206-208` carries a redundant, structurally un-failable assertion
> (`el.labels[0].textContent` cannot ever contain the accname-regression's ghost text; the correct pin
> two lines above, `toHaveAccessibleName`, already covers the defect fully). Taxonomy sweep across the
> shard: zero stale selectors, zero assertion-free/tautological tests, zero skip/fixme, zero
> fabrication-cast/reports-write violations (all corroborated against a planted positive control in the
> same invocation); 27 ONESHOT-OK markers sampled all-true. 0 of 2 permitted CT runs used — every
> verdict read-derived, matching leg1/leg2's precedent. Note: the brief's cited
> `2026-09-02-ct-corpus-audit-leg3.md` does not exist on this tree (only leg1/leg2 do); this shard used
> leg1's rubric directly and the brief's own inline file list. Report:
> `docs/reviews/stickler/2026-09-02-ct-corpus-audit-leg4c-primitives.md`.**
