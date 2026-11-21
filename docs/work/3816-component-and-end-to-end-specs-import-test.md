---
kind: tooling
status: open
updated: 2026-11-21
priority: P3
area: tooling
plan: unwired-code
---

# Component and end-to-end specs import test from the shared bases

## What

Coverage collection for 3809 rides an auto fixture on the shared test bases (@orb/testkit/ct-corpus and the e2e corpus and surface bases). CT and e2e spec files that import test straight from @playwright/test run without that fixture, so their runs collect no coverage.

## Why

A spec outside the bases makes its code look never executed in the coverage report.

## Done when

A codemod under tooling/src/codemods moves every CT and e2e spec import of test to its shared base, a restricted-import lint rule refuses a direct @playwright/test test import in those specs at zero, and the affected CT and e2e suites pass.

## Evidence

Filled at landing: what ran and where its output is.
