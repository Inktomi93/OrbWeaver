---
kind: bug
status: open
updated: 2026-11-11
priority: P3
area: client
plan: surface-walk
---

# Buttons on the phone keep one line wider than the column at enlarged text

## What

At enlarged text on a phone, buttons on character Context and Look, Chat Context disclosures and regex rows, home Also-open and Quick picks, corpus selected context, the persona editor, composer Imagine modes, the refinery scope dialog, preset panes and Config appearance paint past their column (verdict kinds K1, K22, K23). Evidence: the enlarged-text verdict table under reports/cb-walk-text.

## Why

A control cut at the column edge cannot be read or pressed whole.

## Done when

Those buttons wrap or stack inside their column, proved by a component test at the phone width and both text sizes, and the walk lists no clipped-on-x button on those checkpoints.

## Evidence

Filled at landing: what ran and where its output is.
