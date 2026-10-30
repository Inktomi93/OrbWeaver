---
kind: tooling
status: open
updated: 2026-10-30
priority: P3
area: ui
---

# Close the remaining raw font-size lint gaps

## What

Review of the type-ramp rule found gaps: an arbitrary value through '@apply' in CSS passes stylelint and ESLint; non-literal font writes (template 'ctx.font', 'style.cssText', 'setAttribute("style")', a 'font' shorthand in a ui style object) pass ESLint; an uppercase 'FONT-SIZE' passes stylelint; the root font-scale value is admitted on any selector, so a nested use would compound the scale; 'fontSize: "var(--text-…)"' in a ui style object is flagged though it names a token.

## Why

Each gap lets a size bypass the ramp or the font-scale setting without a finding.

## Done when

Each gap has a planted failing case and a passing control in the lint tests, the rules refuse it at zero findings, and legitimate token-resolved canvas fonts still pass.

## Evidence

Filled at landing: what ran and where its output is.
