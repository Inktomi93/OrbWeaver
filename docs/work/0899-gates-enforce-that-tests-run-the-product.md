---
kind: tooling
status: doing
updated: 2026-10-12
priority: P1
area: tooling
lane: wt/agent-ab0cbbdca22723bff
plan: test-mirror
---

# Tests mirror directories, prove presence by reach, and gates enforce that tests run the product

## What

Owner ruling: the one-to-one file mirror ends. Rewrite Core-0-Architecture-and-Structure section 5 and Spine-Testing sections 2 and 5 together with their gates: tests live in their feature's mirrored directory and are named by behaviour; presence means every verb, router and exported module is reached by some test through the import graph or a declared @subject header, not that a file exists at a computed path. Replace the file-name checks in test-layout, test-presence and test-presence-inference with that reach gate (design and false-positive classes in the tooling and gates test-mirror audit report in the owner archive, orbweaver-reviews). No mass move: existing files stay; thin per-file tests that never reach their subject fold into the feature suite or are deleted as lanes touch an area. Then turn Spine-Testing section 10 into hard gates with planted controls: e2e and CT support may not hand-declare a type whose name a contract or production module exports; CT harness and story registries must equal the production door lists in order (extends ct-config-mirror-parity to tool renderers, chat surfaces, home tiles, chrome widgets, slash commands and palette sources); a test-side function structurally matching an exported production function is flagged; a test file size cap with a reviewed exception list; a tests-only CPD ratchet at the measured baseline (jscpd over tests with the source settings measured six to seven percent duplicated lines). Take the gate design from the tooling and gates test-mirror audit when it reports.

## Why

Owner cannot hold these rules in memory; the law only holds if a gate reds the first copy.

## Done when

Core-0 section 5 and Spine-Testing sections 2 and 5 state the directory mirror and the reach rule; the file-name presence checks are gone and the reach gate reds a planted unreached verb; each section 10 rule has a gate in check:structure with a planted failing control and a passing control; the existing tree is either fixed or listed with exit conditions; Spine-Testing section 10 names each gate.

## Evidence

Filled at landing: what ran and where its output is.

First half merged ad36014aa8 (lane wt/agent-afd7721dddc0bd175, since swept). Open: the second half, the gates for Spine-Testing section 10; the mock-through-barrel reach limit moved to 914.
