---
kind: bug
status: open
updated: 2026-11-12
priority: P3
area: client
plan: authorization-and-visibility
---

# Workloads controls say why they are missing when the admin user list fails

## What

The workloads jobs and schedules sections decide which rows an admin may act on from the admin user list. When that read fails, an admin loses every control on other users' rows with no message (`packages/client/src/features/workloads/components/workloads-jobs-section.tsx`, `schedules-section.tsx`).

## Why

Controls vanish with no reason given; it is an availability fault, not a security one.

## Done when

A component test with the user list failing shows a stated reason or keeps the member-row controls, and the owner-row controls stay absent.

## Evidence

Filled at landing: what ran and where its output is.
