---
kind: work
status: open
updated: 2026-10-11
priority: P3
area: chat
---

# Chat styles P3 bundle from the mobile pass

## What

Residual P3s from the 829-831 side-eye rounds: with the soft keyboard up the transcript keeps 134px (composer 185px with the plugin button row and refusal line); document's pinned chip on the last message covers the end of the line passing under it; echo on phones reserves about 105px beside the text for the whole message while the art fills only its top 250px; tide's user header strip is wider than a short user pill; Send sits mid-height rather than by the last line of a long draft; the empty phone composer's top row has a dead middle.

## Why

Each is a visible rough edge in the reworked chat styles the owner asked to feel right on a phone.

## Done when

Each item is fixed or ruled with a reason in Evidence, with snap evidence on phone and desktop and CTs where a measurement pins it.

## Evidence

Fixed: Send by the last line of a long draft. `composer-guided-cluster.tsx` bottom-aligns the Send controls in the input row, so Send rides the row's bottom edge: level with the lower menu door on a short draft, by the last line on a long one. `composer.ct.tsx` pins both cases. The coarse-layout pin that held Send at the row centre now holds it level with the lower door, because the new layout is the better one: Send follows the draft as it grows.

Ruled, no change:

- Keyboard-up transcript height. The plugin flank is hidden and the refusal keeps to one line while the keyboard is up. The remainder is the two-row composer, which the owner ruled. The refusal line is the only place a phone shows why Send is off, so it stays.
- Document's pinned chip over the line end. The chip is a floating control by design, and the third side-eye pass judged it a note, not a defect. Document matches stock SillyTavern, so the chip stays over the text.
- Echo's phone column. Chat styles match Moonlit Echoes on mobile as well, and the side-eye passes compared the phone column with Moonlit and found it close. Reflowing the text under the art would depart from Moonlit.
- Tide's user header width. The header strip holds the name, timestamp and actions, and those set its minimum width. It shares the pill's trailing edge, so it only extends away from the chip, and shrinking it to a short pill would clip the actions.
- The composer's empty top row. Impersonate sits left and the reply controls sit right by the owner's two-row layout, which `composer.ct.tsx` pins as space-between. Filling the middle would need a control that does not exist.
