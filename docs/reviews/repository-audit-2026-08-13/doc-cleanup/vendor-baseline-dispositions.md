---
kind: history
status: active
updated: 2026-08-14
---

# Vendor and test-baseline dispositions

| ID | Disposition | Current receipt | Change / rationale | Verification receipt |
| - | - | - | - | - |
| DOC-CUR-01 | fixed | `docs/test-baseline/manifest.json:2` | Regenerated with the official tracked-test inventory writer; `testFiles` is now 1,693 and the preserved deletion ledger has 18 entries. | Before: 1,687 manifest / 1,693 tracked. `pnpm tsx scripts/check/gen-test-baseline-manifest.ts` wrote 1,693 / 18. |
| docs-vendor-baseui-a-m-01 | needs-owner | `docs/vendor/base-ui/components/accordion.md:592`; `docs/vendor/base-ui/INDEX.md:3-8` | 333 retained `/react/**` site-root links need a corpus URL/offline-routing policy. The index names the source pattern but does not define a lawful rewrite mapping. | Current full-corpus Base UI root-link inventory: 333. |
| docs-vendor-baseui-a-m-02 | archive-no-action | `docs/vendor/base-ui/INDEX.md:3-5` | The premise is false at the correct corpus home: source pattern, retrieval date, and installed 1.7.0 are recorded once. Per-page duplication would violate the one-home rule. | Full index read; five-entry index log inspected. |
| docs-vendor-baseui-n-z-01 | needs-owner | `docs/vendor/base-ui/components/select.md:499`; `docs/vendor/base-ui/INDEX.md:3-8` | Corpus provenance is already one-home at the index; the remaining defect is the same 333 unresolved site-root links, which requires an owner-selected mapping. | Same full-corpus root-link inventory: 333. |
| docs-vendor-baseui-rest-01 | needs-owner | `docs/vendor/base-ui/handbook/forms.md:15`; `docs/vendor/base-ui/utils/merge-props.md:356` | Preserved `/react/**` links are not checkout-local. No current corpus navigation policy selects local rewrites versus upstream absolute links. | Current full-corpus root-link inventory: 333. |
| docs-vendor-baseui-rest-02 | needs-owner | `docs/vendor/base-ui/INDEX.md:3-5` | The index directs refetching to git history; no current repository-local refresh producer was found. Recreating one would choose source/pinning behavior and can require network authority. | Current scripts, manifests, and tests search found no Base UI producer. |
| docs-vendor-vite-guide-01 | needs-owner | `docs/vendor/vite/guide/api-plugin.md:12,261`; `docs/vendor/vite/INDEX.md:12-14` | 173 root-relative and 255 relative Vite-site links require a site-route/extension rewrite policy absent from the corpus contract. | Current full-corpus Vite root/relative inventories: 173 / 255. |
| docs-vendor-vite-guide-02 | archive-no-action | `docs/vendor/vite/INDEX.md:3-10` | The premise is false at the corpus home: source list, retrieval date, upstream 8.2.1 context, and installed 8.1.2 range are recorded once. Per-page copies are not an authority requirement. | Full index read; five-entry index log inspected. |
| docs-vendor-vite-rest-01 | needs-owner | `docs/vendor/vite/config/preview-options.md:11`; `docs/vendor/vite/guide.md:16` | Same unresolved corpus navigation policy as the guide finding; no minimal mapping is documented. | Current full-corpus Vite root/relative inventories: 173 / 255. |
| docs-vendor-vite-rest-02 | needs-owner | `docs/vendor/vite/INDEX.md:3-14` | The index records a source page list but no immutable revision, retained input, or current fetch command. Adding one requires owner authority over snapshot provenance and refresh behavior. | Current producer search found no Vite mirror fetch command. |
