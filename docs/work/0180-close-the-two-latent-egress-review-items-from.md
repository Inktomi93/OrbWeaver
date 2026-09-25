---
kind: bug
status: open
updated: 2026-09-25
priority: P2
area: network
---

# Close the two latent egress review items from 0177

## What

Two latent items the 0177 review left for a human. (1) A zone literal as a connect target: node skips the DNS lookup for anything it reads as an IP, so a hostname containing a zone (such as fe80::1%eth0) that ever reached the global connector would be dialled without the lookup check. WHATWG URL refuses zones, so no path reaches it today; refuse any hostname containing a percent sign at the connector. (2) TRUSTED_PRIVATE_RANGES is a bare string with no boot validation, so an entry matchesCidr cannot read silently blocks nothing; refuse such an entry at boot in foundation/env.

## Why

Both are fail-open shapes in the internal-dial guard. Neither is reachable today, and both are cheap to close before a new input path makes one reachable.

## Done when

A test pins a zone-literal hostname refused at the connector, and a boot test pins an unreadable TRUSTED_PRIVATE_RANGES entry refused, each red on the current source first.

## Evidence

Filled at landing: what ran and where its output is.
