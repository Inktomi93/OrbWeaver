---
kind: work
status: open
updated: 2026-11-27
priority: P3
area: client
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

Isolated stage cloned from the owner container db, `pnpm snap / --isolated --stage-db <clone> <target> --design-audit`, desktop and `--mobile`; every run exits 0 with population-verdict complete, no P0 to P3 finding, and no duplicate-action-door finding. Config list (`--goto config`): desktop `reports/runs/snap/agent-a8a76b60ece6b02c7-25069-2026-11-27T17-08-03-618Z`, mobile `reports/runs/snap/agent-a8a76b60ece6b02c7-34129-2026-11-27T17-09-32-736Z`. Config group Connections (`--goto config:connections`): desktop `reports/runs/snap/agent-a8a76b60ece6b02c7-43540-2026-11-27T17-11-00-905Z`, mobile `reports/runs/snap/agent-a8a76b60ece6b02c7-53647-2026-11-27T17-12-52-065Z`. Character editor (`--open-character Kohaku`): desktop `reports/runs/snap/agent-a8a76b60ece6b02c7-62435-2026-11-27T17-14-27-082Z`, mobile `reports/runs/snap/agent-a8a76b60ece6b02c7-73134-2026-11-27T17-16-31-301Z`. The rule registry carries no rule named duplicate-field; the run files no finding of any rule.
