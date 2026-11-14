---
kind: bug
status: open
updated: 2026-11-14
priority: P1
area: tests
plan: test-foundation
---

# The streamed body-limit proof gives each buffered intake route its own case

## What

tests/server/entry/http/body-limit-population.int.test.ts streamed every buffered common intake route through one case. A streamed refusal reads the route's whole cap first, and Hono's bodyLimit buffers what it reads, so the one case allocated and copied about three gibibytes (two import-tree routes at a gibibyte each, three import routes at a quarter each) and timed out on the hosted two-core runner. Each route is now its own case; the two import-tree streamed cases carry the slow tag with the measured reason in the file.

## Why

The case's runtime was the sum of the production caps times the host's copy rate, so a slower runner failed it with nothing wrong in the product.

## Done when

Each route's declared and streamed refusal is its own case, the file passes three times in a row pinned to two cores with two workers, and no case but the two tagged ones passes half the default budget there.

## Evidence

Filled at landing: what ran and where its output is.
