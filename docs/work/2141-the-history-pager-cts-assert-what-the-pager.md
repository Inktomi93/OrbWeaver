---
kind: work
status: doing
updated: 2026-11-08
priority: P2
area: client
lane: wt/agent-a9d600876102df860
plan: test-foundation
---

# The history pager CTs assert what the pager shows

## What

A CT mutation sample on HistoryPager left survivors that the hand check judged true gaps: its CTs do not assert the pager's status line and range edges. The survivors are listed in the 2048 lane report. Add the missing assertions on the rendered pager.

## Why

HistoryPager is a frequently fixed client file, and a mutant that changes what the user reads survives every current test.

## Done when

Each true-gap survivor from the sample has a CT assertion that fails under that mutant, checked by planting each mutant by hand.

## Evidence

Filled at landing: what ran and where its output is.
