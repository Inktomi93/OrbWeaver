---
kind: work
status: open
updated: 2026-11-25
priority: P3
area: plugin
plan: test-foundation
---

# Plugin consent and membrane suites pin the fail-closed grant echo, cross-surface frame caps and the widening card's Approve

## What

Three controls are right in code with no red test (the second plugin security review): setGrant with no echo at the domain approves nothing, yet a mutant that skips the check when the echo is absent survives every suite; the frame count across orb.host surfaces survives because the registrations case leaves out ui.registerFrame; and no CT clicks Approve on a provider or automation widening card. A failed host-error build on the async settle path (membrane settleGuestPromise) is covered only by the plugin-host suites passing.

## Why

A control no test pins can be removed by a later edit with every suite green.

## Done when

A case each, red against the mutant the review names: a domain setGrant without an echo leaves the row unchanged, a second orb.host(1) surface is refused a frame past the cap, and a CT approves a provider and automation widening card and reads the cleared state. A failed host-error build on the async settle path disposes the deferred, with a deterministic case.

## Evidence

Filled at landing: what ran and where its output is.
