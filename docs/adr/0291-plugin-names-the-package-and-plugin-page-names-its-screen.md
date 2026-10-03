---
kind: adr
status: active
updated: 2026-10-03
---

# Plugin names the installable package and plugin page names a screen it contributes

## Context

Users install add-on packages, and a package can contribute full-page screens that open from the rail. The rail section, the Settings shelf and the page copy used related words with no ruling on which word names which concept. SillyTavern users read Extension as their own extensions and expect them to run here.

## Decision

Plugin is the user-facing word for the installable package: the Plugins shelf in Settings, install, update and remove copy, and every message about the package. Plugin page is the word for one full-page screen a plugin contributes, and Plugin pages names the rail section that lists them. Extension never names either concept in user-facing copy or in-app help; it stays only where the copy means a SillyTavern extension or a file extension. The code spelling keeps `extensions` as the section id, the config shelf id and the `extensions-*` file and testid family. Homes: the plugin rows in `docs/law/vocabulary-map.md`, and the copy constants in `packages/client/src/features/plugin/lib/extensions-copy.ts` and `packages/client/src/features/plugin/lib/extensions-section-label.ts`.

## Consequences

A reader sees one word per concept: they install a plugin and open its plugin pages. Copy for any other contributed surface, such as a panel inside a chat tab, names that surface and does not borrow plugin page. Renaming the extensions code family is a separate change; it is not required by this ruling.

## Alternatives rejected

Extension for the package: SillyTavern users expect their own extensions to run. Plugin for both concepts: the rail lists screens, not packages, so one word would hide which one a control acts on. Renaming the code identifiers to match: the churn buys no user-facing change.
