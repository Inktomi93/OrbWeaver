---
kind: work
status: doing
updated: 2026-10-25
priority: P3
area: ui
lane: closeout/dom
---

# UI primitives carry no meaning in a native title

## What

Item 1317 cleared native `title` from the client. In `@orb/ui`, `ListRow` forwards `title`, `fullTitle`, `subtitle` and `subtitleReveal` to native titles, `SeriesRow` does the same with `label` and `detail`, and `ImmersiveCard` has a span whose only meaning is the title "Auto-rendered from raw HTML". `fullTitle` can carry text that is not visible.

Also from the 1317 review: `orb/no-native-title` cannot see a title authored into an object typed as React's own DOM props (`const p: HTMLAttributes<HTMLSpanElement> = { title }; <span {...p}/>`); no client site does this today. The comment at `packages/client/src/features/rpg/lib/rpg-context-section.tsx:128` still says the Map tab carries its reason on `title`.

## Why

A native title is invisible on touch and is not the accessible name.

## Done when

`orb/no-native-title` covers `packages/ui/src` with the same type-aware test; each forward becomes visible or announced text (the Tooltip primitive with `aria-describedby`, or a visually hidden description); a planted control fails; the rule also flags a `title` property authored into a DOM-props-typed object, with a control; the stale rpg comment is fixed.

## Evidence

`orb/no-native-title` now runs on `packages/ui/src` (`eslint.config.ts`) and flags a `title` property authored into an object the checker types as React's DOM props (`tooling/src/eslint/native.ts`). `tests/tooling/eslint-native-title.test.ts`: the two object-literal controls failed before the rule change (2 failed, 13 passed) and pass after (15 pass), with a ui-population control and a non-DOM-props object control. ListRow `fullTitle` is now a visually hidden description wired into `aria-describedby`; the ListRow title, subtitle and reveal, the SeriesRow label and detail, the ImmersiveCard icon buttons and the OptionStrip item `title` lost their native titles; the ImmersiveCard `auto` badge carries hidden text. `pnpm lint:eslint packages/ui/src packages/client/src` reports the same 402 errors as before, none from this rule. Rule cost under `TIMING=all`: `orb/no-native-title` 68 ms, 0.1% of the run. CT: `list-row/rail-carrier`, `classname-drain-props` and `accessible-name-quality.suite` pass (55).

Follow-up: ListRow `fullTitle` also opens as a Tooltip on the title (owner ruling O-7 stands; the popup is aria-hidden, the hidden description stays the accessible path). The ImmersiveCard icon buttons keep a pointer hint through the Tooltip. The rule also flags a computed or quoted `title` key, a title cast to DOM props inside a spread, `props.title = x` and `createElement("span", { title })`, and reports a `satisfies` DOM-props object once. CT: `list-row/rail-carrier` (hover opens the popup, `data-open`; the row's accessible description is the full title) and `immersive-card-chrome`. `TIMING=all`: `orb/no-native-title` 132 ms, 0.1%.

Closeout: configured native-title controls pass 23 cases, including DOM-object authoring and UI population. Existing primitive title migrations remain unchanged.
