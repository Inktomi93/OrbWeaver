---
kind: work
status: open
updated: 2026-11-13
priority: P2
area: tests
plan: test-foundation
---

# No test builds its expected label by calling the label function it tests

## What

The label census lists calls to production label functions inside the name an assertion expects. Where the test's subject is which output that function gives, the assertion cannot fail. The census prints these as candidates in two classes, a function that branches and a function that fills a template; it cannot tell which are defects.

## Why

A test that agrees with the function under test by construction keeps passing when the label is wrong.

## Done when

Every candidate in the branching class is read and either states its expected name independently or is recorded as not a defect in a list the census reads; the template class is sampled per feature and gets the same pass where the sample finds defects; the census then prints no unjudged branching candidate.

## Evidence

Filled at landing: what ran and where its output is.
