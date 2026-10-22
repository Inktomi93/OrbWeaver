---
kind: work
status: open
updated: 2026-10-21
priority: P2
plan: test-foundation
---

# Testing law holds in the test kit

## What

Qualify deterministic data, production composition, scripted external edges and joined resource lifetimes in maintained testkit support. Qualify provider recipes, cancellation reporting and software snapshots through selected cases. Remove copied assemblies from maintained support with their replacements.

## Why

Rebuilt tests need stable inputs and the actual production graph, not copied domain behavior.

## Done when

Maintained support uses production-derived data, seeded IDs and injected business time. Protocol and physical timing follow Spine-Testing section 3. Real-root controls prove deterministic behavior and joined cleanup. Provider recipes, cancellation reporting and software snapshots preserve observable outcomes. Copied assembly helpers leave with qualified replacements.

## Evidence

The server harness exposes business clock, ID, random and timer seams. Existing support has selected runtime qualification; that does not establish complete replacement coverage.

[D319](../adr/0319-native-protocol-time-in-scripted-test-edges.md) preserves native signed-protocol timestamps and verification. It does not authorize ambient business clocks.

## Selected asset and imagery cases

This comparison covers `materialization-boundaries.test.ts` and `generation-policy.test.ts`. The selected replacements pass through production composition. This does not qualify either domain completely.

The replacements are [materialization boundaries](../../tests/server/domain/assets/verbs/materialization-boundaries.int.test.ts) and [generation policy](../../tests/server/domain/imagery/verbs/generation-policy.int.test.ts). Domain behavior runs through production composition. Canonical pure resolvers supply expected instruction text.

| Original behavior and assertions | Decision and maintained evidence |
| - | - |
| Background store fixes kind and magic; optional cap reads change between calls. | Rebuild live-cap changes through `settings.addExternalBackground`, actual egress and CAS. Assert stored kind, MIME and bytes. Keep [seed art](../../tests/server/domain/assets/verbs/seed-art.int.test.ts) for storage magic refusal. Drop exact forwarded argument objects and omitted-option checks. |
| Generated store preserves kind; owner-id storage resolves Principal and reads changing caps. | Keep actual generated ownership and MIME in [native inline images](../../tests/server/domain/chat/engine/inline-reply-images.suite.int.test.ts). Rebuild live cap changes through native chat generation. Drop fake Principal-resolution and forwarded-kind argument assertions. |
| Background and inline URL downloads use public policy, sniff MIME and preserve the supplied owner. | Rebuild background private-DNS refusal with a public success control, real egress and CAS. Keep the [public egress matrix](../../tests/server/infra/network/egress-public-policy.int.test.ts) for redirect and configured-endpoint permutations. Native base64 output proves generated ownership and MIME sniffing. Drop the fabricated inline URL delivery permutation; the inspected native providers supply data files, not URL files. The compatibility downloader branch remains unqualified. |
| SVG, byte cap and excessive dimensions refuse background, inline base64 and inline URL before storage. | Rebuild background and native-base64 live caps and dimensions with unchanged actual asset rows. A native PNG carrying an SVG MIME claim still stores as PNG. Keep native inline bad-magic/no-link/prose assertions and [surface outputs](../../tests/support/node/corpus-surface-outputs.int.test.ts) for background bad-image refusal. Inline URL-only permutations remain outside qualified producer coverage. |
| Non-success responses dispose unread; thrown download details stay off results; no storage occurs. | Rebuild background raw response cancellation and physical fetch rejection through actual egress. Assert sanitized refusal and unchanged assets. Inline URL-only lifecycle remains unqualified without a production supplier. Drop the warning-spy call assertion: operator logging is not a user-result contract. |
| Gallery refusal propagates exact owner and character arguments. | Drop fake-error forwarding. Keep seed-art foreign-subject refusal, owned placement and deduplication; surface outputs also prove foreign asset and subject refusal. |
| Image resolution uses run-as; capability, image, warning and usage forwarding remain unchanged; thrown execution rejects. | Keep [image variants](../../tests/support/node/corpus-image-variants.int.test.ts) for positive image warnings, parsed accounting, stored connection/model and owner. Rebuild negative warning filtering through actual `imagery.generatePicture`. Native Google emits an unsupported-count warning; the avatar gate supplies the positive dropped-edit warning. The actual inference executor provides a warning-producer control only. Keep [credential authority](../../tests/server/domain/embeddings/verbs/runtime-credential-authority.suite.int.test.ts) for real imagery auth rejection and revoked-key no-spend. Rebuild distinct run-as selection through real imagery generation. Drop object-reference equality and exact request-forwarding assertions. |
| Caption uses run-as Utility binding and preset, sends instruction/image/posture, trims text and retains cost. | Rebuild through actual imagery preview, persisted Utility settings/preset and physical provider requests. Assert live model/temperature/instruction/image, parsed cost and normalized prompt. Use distinct host/member settings and actual binding refusal with no additional physical request. |
| Caption accepts an injected empty items array as empty text and null cost. | Drop the fabricated result state. Native summarize produces an item for each supplied input. Rebuild the useful empty-reply purpose with a supported physical empty completion and the public preview refusal. |
| Template, caption and negative defaults and overrides load only run-as settings. | Rebuild through real settings writes, imagery preview/generation and physical requests. Derive defaults from canonical resolvers. Distinct member settings must not replace host instructions or negative prose. |

Use `createServerHarness` and the existing native image supplier. Script only DNS, physical fetch and provider response bytes. Keep storage, identity, connection admission, funding, preset resolution and accounting in production.

Do not assemble domain factories in these tests. The inline URL compatibility branch needs a real producer before application-path qualification. Keep that limitation explicit instead of creating a test-only service path.

The replacement suites and selected maintained cases pass. Isolated production defects in live caps, dimension checks, response cancellation and Utility preset selection fail their intended assertions. Mutation targets are restored exactly. Affected compiler, lint and import checks pass. Inline URL-only producer compatibility remains unqualified.
