---
kind: work
status: open
updated: 2026-11-14
priority: P3
area: client
---

# A customized template row and a card action row have no enlarged-text reflow case

## What

The preset Actions tab pairs a Customized badge with an edit button inside one wrapper row, and the chat control card puts its action buttons in a row that does not wrap. Neither has a component test at enlarged text on a phone, because mounting them needs a preset with an overridden template and a plugin guest that raises a card. Build the two mounts through the production verbs and add the reflow cases.

## Why

An untested row that holds several controls can run past the row at enlarged text without any check saying so.

## Done when

Each row has a reflow case at enlarged text on a phone, red before any fix it needs and green after.

## Evidence

Filled at landing: what ran and where its output is.
