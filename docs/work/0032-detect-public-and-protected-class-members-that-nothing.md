---
kind: tooling
status: open
updated: 2026-09-23
priority: P3
area: verify
---

# Detect public and protected class members that nothing references

## What

Add a whole-program check to pnpm check that reports a public or protected class method, property or accessor when nothing in the TypeScript programs references it. Leave out members that implement an interface or abstract member, override a base member, or are called by a framework or library by name, and state each exclusion as an explicit rule in the check. Correct the knip.ts header comment so it no longer claims member-level analysis, since knip only checks enum and namespace members.

## Why

A dead private member is already an error: the compiler's noUnusedLocals setting raises TS6133 for both TS private and #-private members. A dead public or protected member is reported by nothing. knip no longer has a class-member issue type, and neither the compiler nor Biome judges non-private members. So an exported class can keep methods nobody calls, and the export-liveness view still reports the class as live.

## Done when

pnpm check runs the new check. A committed fixture with an unused public method and an unused protected property makes the check fail and names both members. A committed fixture where every public and protected member is referenced passes. A committed fixture where the only unreferenced member implements an interface member or overrides a base member also passes. The knip.ts header no longer claims member-level analysis.

## Evidence

Filled at landing: what ran and where its output is.
