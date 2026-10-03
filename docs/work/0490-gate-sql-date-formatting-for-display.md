---
kind: work
status: open
updated: 2026-10-03
priority: P3
area: verify
---

# Gate SQL date formatting for display

## What

No structure gate stops a display-grouping strftime or date() in server SQL; the timezone rule is enforced only by review. Add a gate that fails strftime, date(, datetime( and julianday( in server SQL outside an allowlisted home, with a reason per exemption.

## Why

Keeps the UTC-epoch-on-the-wire rule from regressing.

## Done when

The gate fails a planted strftime in a domain read and passes the tree.

## Evidence

Filled at landing: what ran and where its output is.
