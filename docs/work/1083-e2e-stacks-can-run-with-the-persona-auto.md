---
kind: work
status: open
updated: 2026-10-19
priority: P3
area: tests
plan: test-mirror
---

# E2E stacks can run with the persona auto-seed off

## What

The persona seeder creates a default persona whenever E2E_HARNESS is on (header of domain/persona/seeder/default.ts), so the first-run persona ask is unreachable in e2e. Owner ruling: add an explicit e2e setting that turns the auto-seed off for the specs that need it, keep the auto-seed on by default for every other spec, and move the joiner-with-no-persona CT case to e2e.

## Why

The joiner-with-no-persona case can only leave CT if an e2e stack can run with the auto-seed off.

## Done when

A spec opts out of the auto-seed through the e2e mode configuration, the joiner-with-no-persona case runs as an e2e spec and its CT case is deleted, and every other spec keeps the seeded persona.

## Evidence

Filled at landing: what ran and where its output is.
