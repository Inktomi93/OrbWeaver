---
kind: work
status: open
updated: 2026-10-11
priority: P3
area: client
---

# Merged UI side-eye P3 bundle

## What

P3s from the merged-UI side-eye (~/Archives/orbweaver-reviews/merged-ui-oct10.md): mixed 13px and 10.5px teaching copy in the rule card and Model roles; Add a document's textarea focus ring beside the footer and a 12px footer jump at scroll end; tall stacked tag-suggestion rows on phone and a wide name-to-action gap on desktop; model names breaking mid-word in the picker.

## Why

Polish findings below P2.

## Done when

Each P3 is fixed or ruled, with the ruling recorded here.

## Evidence

Each finding was re-measured on the current tree before it was touched. All four reproduced and all four are fixed; each fix has a rendered test that failed on the old source first.

- Mixed teaching copy. The connection slot's description reads at the label step through `prose`. The rule row's own summary and its rate-cap note (`rule-row.tsx`), the Utility preset note (`utility-preset-select.tsx`) and the built-in reranker hint (`connections-roles-section.tsx`) were plain gloss at the micro step beside it. They now take `prose`, so sibling sentences in one card or list are one size. Tests: `rules-section.ct.tsx` and `connections-roles-section.ct.tsx`.
- Add a document footer. The body wrapped its three modes, and so their sticky footer, in `padding="block"`, which held the footer 12px above the scroll region's edge until the scroll ended. The wrapper padding is gone; the popup's own inset already surrounds the region. Test: `add-document-body.ct.tsx`, "footer in a short dialog".
- Tag suggestion rows. The review cell wrapped Apply and Reject onto two lines, and the full-width table put the verbs at the far edge of the pane. The row no longer wraps and the table is `w-fit`. Test: `labels-list-surface.ct.tsx`, at phone and desktop widths.
- Model picker. The display name used `break-all`, which split words at the end of a line. It uses `break-words`; the catalog id keeps `break-all` because it has no break points. Test: `add-model-on-key-dialog.ct.tsx`, at every width the picker is tested at.

Not in this item and left alone: the other findings in the same review (the inline name field label, the wire viewer's empty settings and measure, the schema editor's name field). The name cell of a suggestion row still sits 13px in from its column header; that was named in the review but not in this item's What.
