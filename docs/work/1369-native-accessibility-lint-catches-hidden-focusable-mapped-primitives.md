---
kind: tooling
status: open
updated: 2026-10-25
priority: P2
area: client
---

# Native accessibility lint catches hidden focusable mapped primitives

## What

The installed Biome rule catches an aria-hidden native button but misses a mapped Button. The native jsx-a11y/no-aria-hidden-on-focusable rule catches that mapped control with the effective component mappings. A hidden input without tabIndex produces a plugin false positive; legitimate Base UI hidden inputs require explicit adjudication before enabling the rule.

## Why

A focusable control hidden from assistive technology is unreachable through its accessibility tree. Primitive composition must not hide this defect from native lint.

## Done when

Census actual client and UI sites with the installed rule and effective component mappings. Add failing mapped-control and passing legitimate hidden-input controls. Enable the native rule where correct; fix real findings and narrowly document verified false positives. Add no baseline, blanket exclusion or new custom accessibility framework. Record the exact enforced scope.

## Evidence

Enforced scope: `jsx-a11y/no-aria-hidden-on-focusable` is `error` in the `REACT_SOURCE` block of `eslint.config.ts`. That block covers `packages/client/src/**` and `packages/ui/src/**`, `.ts` and `.tsx`, and resolves a mapped control through the block's `components` map. Biome's native rule stays for native elements.

Census: `pnpm lint:eslint packages/ui/src packages/client/src` with the rule on reports no finding. The one hidden native input in source, `packages/ui/src/primitives/file-trigger/file-trigger.tsx`, carries `tabIndex={-1}` and passes. Base UI renders its hidden inputs inside the library, not in source. No real finding, so nothing was fixed at a site.

Proof: `tests/tooling/jsx-a11y-control-label-policy.int.test.ts` (run with `pnpm test:tools`) lints fixtures through the real `eslint.config.ts`. A hidden mapped `Button` and a hidden native `button` are reported. With the rule off both cases read empty, which is the red. A `Button` with `tabIndex={-1}`, a plain `span` and the file-trigger input shape pass.

Verified plugin false positive: `<input type="hidden" aria-hidden>` is reported although it is not focusable. No source site spells it, so a case pins the behavior and the rule gets no suppression, baseline or exclusion. A site that ever needs it is adjudicated there.

Cost: whole-tree ESLint with `TIMING=1` over both directories does not list the rule in the slowest-rule table.
