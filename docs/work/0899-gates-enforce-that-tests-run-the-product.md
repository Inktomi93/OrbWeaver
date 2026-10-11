---
kind: tooling
status: open
updated: 2026-10-11
priority: P1
area: tooling
---

# Gates enforce that tests run the product

## What

Turn Spine-Testing section 10 into hard gates with planted controls: a mirrored test must import its mirrored module and reference one of its exports; e2e and CT support may not hand-declare a type whose name a contract or production module exports; CT harness and story registries must equal the production door lists in order (extends ct-config-mirror-parity to tool renderers, chat surfaces, home tiles, chrome widgets, slash commands and palette sources); a test-side function structurally matching an exported production function is flagged; a test file size cap with a reviewed exception list; a tests-only CPD ratchet at the measured baseline (jscpd over tests with the source settings measured six to seven percent duplicated lines). Take the gate design from the tooling and gates test-mirror audit when it reports.

## Why

Owner cannot hold these rules in memory; the law only holds if a gate reds the first copy.

## Done when

Each rule has a gate in check:structure with a planted failing control and a passing control; the existing tree is either fixed or listed with exit conditions; Spine-Testing section 10 names each gate.

## Evidence

Filled at landing: what ran and where its output is.
