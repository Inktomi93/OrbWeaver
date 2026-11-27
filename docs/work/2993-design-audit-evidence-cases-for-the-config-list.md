---
kind: work
status: doing
updated: 2026-11-27
priority: P3
area: client
lane: wt/agent-a8a76b60ece6b02c7
plan: cross-surface-consistency
---

# Design-audit evidence cases for the config list and character editor need a live run

## What

2392 and 2393 each end on a clause that a design-audit run no longer files duplicate-action-door (Config) and the duplicate-field finding (character editor). No CT asserts either finding.

## Why

The rendered CTs prove the cause (distinct names, one editor) but not the finding the item names.

## Done when

A live `pnpm snap <route> --design-audit` run (desktop and --mobile) on the Config list and the character editor shows neither finding; its output is cited on the items.

## Evidence

Filled at landing: what ran and where its output is.
