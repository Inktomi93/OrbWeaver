---
kind: work
status: doing
updated: 2026-11-08
priority: P3
area: client
lane: wt/agent-acaf86636920912a1
plan: cross-surface-consistency
---

# Settings P3 bundle from acceptance part 1

## What

Prose paragraphs lack the prose cap in Admin, Connections Saved keys, Plugins install and distribute, and the Backup import gloss. Enable switches use three layouts. The Jobs Bulk chip has two tones. The settings list scroll-spy highlights the last section on short tails and overrides an explicit goto. The Appearance theme picker's current meta is 10.5px and its ellipsis covers the preview on a phone. The Automation empty state has two near-named doors and no primary. The phone Context tab strip hides the selected Plugins tab under its overflow control.

## Why

Each breaks the settings family's shared composition found in acceptance.

## Done when

Each finding is fixed with a capture, or answered with a cited reason in this item's Evidence. Source: acceptance part 1 report.

## Evidence

Verdicts per finding from the acceptance part 1 report (the design-audit confirmation is the next ux-reviewer pass).

- Prose cap: Admin approvals and Link SSO (`cap="prose"` on the intro `Text`), Model catalog and Card embeddings (`admin-ops-section.tsx`), Connections Saved keys (`connections-keys-section.tsx`), Backup import gloss (`import-library-section.tsx`) and every unpaired `prose={true}` in the Plugins management components. The plugin half ran through the new codemod `tooling/src/codemods/text-prose-cap-pair` (fixtures `rewrites` and `untouched`; 9 files; dry-run list matches an independent `rg` of `prose={true}` without `cap=`; rerun reports zero). It excludes the three guest-surface renderers (`plugin-surface-renderer.tsx`, `plugin-scripted-surface.tsx`, `plugin-leaf-nodes.tsx`) because they draw plugin-authored nodes. The named non-plugin sites are single judged nodes, hand-edited. No CT: the claim is a measure, audited by `line-length` in the next pass.
- Enable switch grammars: the Plugins card now carries "Enabled" and "Show ... panel in chat" as captioned rows on one `SettingRowGroup` track (`plugin-row.tsx`), CT `tests/client/features/plugin/components/show-in-chat-switch.ct.tsx` asserts both switches share an x. The Connections list keeps its trailing captioned switch: the report itself ruled "an item-level enable at the trailing edge is a fair task difference". The accessible name of the Plugins enable switch changed from "Turn X on/off" to "Enabled" with the checked state; `plugin-macro-browser.ct.tsx` follows.
- Jobs Bulk chip: Schedules rows now use the neutral `Badge` the Runs rows use (`schedules-section.tsx`). Default fork: neutral over amber. No CT, the claim is a tone.
- Scroll-spy: `use-config-scroll-spy.ts` holds the lit section a jump named until the reader scrolls. CT `tests/client/features/config/surfaces/config-scroll-spy-goto.ct.tsx`: red on main (lit "tuning", expected "schedules"), green after.
- Appearance theme picker meta: `PickerCell` meta uses the description's label step instead of the micro datum voice (`picker-cell.tsx`). CT `tests/ui/primitives/radio-group/picker-native-parts.ct.tsx` "a cell's meta reads at the description's step": red (10.5 against 13), green after. The overflow menu glyph over the preview's top-leading corner is a fork, not changed: the placement is the Looks section's recorded design (`appearance-looks-section.tsx` comment, `UI-Theming-and-Content.md` Looks sentence) and moving it needs an owner call. Default: keep, flag.
- Automation empty state: "Add a rule" is the solid primary and the other door reads "Write your own" (`rule-preset-picker.tsx`, `rule-manager.tsx`). No CT: variant and copy only.
- Phone Context tab strip: the active tab now scrolls into view when it becomes active (`revealSelectedTab` in `context-rail.tsx`), clearing the fade through the strip's existing scroll-padding. NO red CT: a corpus Context at 390px did not reproduce the hidden tab, either from a click or from the overflow menu, so the fix is unproven here. The Chat Context with the Plugins tab is the repro the next ux-reviewer pass must check.
