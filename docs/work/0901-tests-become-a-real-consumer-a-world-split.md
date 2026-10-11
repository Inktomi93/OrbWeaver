---
kind: work
status: open
updated: 2026-10-11
priority: P1
area: tests
plan: test-mirror
---

# Tests become a real consumer: a world-split testkit package and test-only seams

## What

Owner-ruled direction (law change to Core-0 sections 5 and 9, Spine-Testing section 2). Keep the central tests tree. Turn tests/support into a testkit package that sits above the cake beside tooling, with three world subpath exports matching today's support split: node, browser and iso, each compiled under its own world program, with no root entry; the test-helper-world-direction rule carries over keyed on the subpaths. Product logic that tests copy moves down to the layer that owns it and is exported through that package's normal public API, for example ownership checks out of entry compose closures into domain; production and tests both call it. A package-level testing door holds only genuinely test-only seams such as fake clocks, in-memory stores, recorders and minted-id helpers, never product logic. Two named exceptions instead of copies: the browser testkit may import the client compose door lists (a reviewed exception in client-compose-door-only), and the node testkit takes AppRouter types through the existing type-only bridge. Tests and testkit may import a package's public entry or its testing door; a raw subpath reach into a package's internals needs a reviewed grant.

## Why

Tests sit outside the cake with access to everything and no rule to use what they see, so harnesses copied private compose logic and registries; the support code also had to stay world-pure, which a single merged package would break.

## Done when

The testkit package exists with node, browser and iso exports and no root entry; each world compiles under its own program and the direction rule fires on a planted node-to-browser import; the copied server compose closures named in the test-mirror plan are moved to their owning layer and called by both sides; the two door exceptions are explicit rules with planted pins; Core-0 and Spine-Testing describe the shape.

## Evidence

Filled at landing: what ran and where its output is.
