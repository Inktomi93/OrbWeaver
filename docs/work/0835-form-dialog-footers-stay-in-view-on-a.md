---
kind: bug
status: open
updated: 2026-10-10
priority: P2
area: client
---

# Form dialog footers stay in view on a phone

## What

On a 430x740 phone, Add a document and Add a connection put their footer actions inside the dialog's own scroll body (packages/client/src/components/form-dialog.tsx:115-123), below the viewport. Source: ~/Archives/orbweaver-reviews/phone-pass-oct10.md P2 item 1.

## Why

A phone user cannot see how to finish or leave the dialog.

## Done when

The form dialog footer is pinned outside the scroll body on every form dialog; CT asserts the footer is within the viewport at 430x740.

## Evidence

Filled at landing: what ran and where its output is.
