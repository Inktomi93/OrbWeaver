---
kind: bug
status: open
updated: 2026-11-10
priority: P2
area: client
plan: cross-surface-consistency
---

# The toast stack blocks message actions under it

## What

The walk at 200 and 300 percent text reports Edit message, Fork chat here and Add a reaction covered at their centre by the toast stack container, which turns pointer-events on whenever it holds a toast (has-data-\[slot=toast-root]:pointer-events-auto) and so takes clicks across its whole box. Seen on config-library-setting-changed; evidence in reports/cb-walk-text/geometry-by-kind.md.

## Why

A control the person can see but cannot click while a toast shows is a broken action.

## Done when

Only the toasts themselves take pointer input, the stack container never covers a control outside a toast, and a CT clicks a message action under the stack while a toast shows.

## Evidence

Filled at landing: what ran and where its output is.
