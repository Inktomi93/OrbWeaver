---
kind: work
status: doing
updated: 2026-11-27
priority: P3
area: workloads
lane: wt/agent-aa8988717799db7a7
plan: unwired-code
---

# A schedule row says when it last ran

## What

advanceSchedule (packages/server/src/domain/workloads/persistence/schedule-queries.ts) writes lastRunAt on every run and workloadScheduleViewSchema (packages/contracts/src/workloads/views.ts) serves it, but the schedule row in schedules-section.tsx shows only the next run or the refusal. The view also serves createdAt and updatedAt, which no screen reads and no commit gave a reason for.

## Why

A holder cannot tell whether a schedule has ever fired or when it last did.

## Done when

The schedule row shows the last run beside the next run, and a never-run schedule says so; createdAt and updatedAt leave the view schema and its query; a CT covers a run and a never-run schedule.

## Evidence

Filled at landing: what ran and where its output is.
