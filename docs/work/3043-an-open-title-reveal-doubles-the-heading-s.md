---
kind: bug
status: open
updated: 2026-11-14
priority: P3
area: client
plan: cross-surface-consistency
---

# An open title reveal doubles the heading's accessible name

## What

While a TitleReveal popup is open, Base UI renders an aria-owns owner span beside the trigger, so the popup's text joins the heading's name. A dialog labelled by its title reads its title twice until the reveal closes. The same applies to the list pane, topbar and chat header titles.

## Why

The law says the heading keeps the whole title as its accessible name; doubling it while the reveal is open is a name that is wrong for that window.

## Done when

With a reveal open, the dialog, the form and the heading each keep the whole title once as their name, proven by a component test that reads the names while the reveal is open.

## Evidence

Filled at landing: what ran and where its output is.
