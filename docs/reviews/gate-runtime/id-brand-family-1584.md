---
kind: review
status: active
updated: 2026-09-05
---

# ID brand flow family checkpoint for #1584

The identity family shares compiler-resolved canonical brand identity from
`packages/kit/src/ids/index.ts`. A spelling such as `ChatId` is not evidence by itself: the resolved type
must carry the canonical `[brand]` property, whose literal value identifies the brand. The shared
`lib/id-brand.ts` reader is consumed by the Drizzle schema fact and source-position policy.

## Implemented

- `schema-branding` requires primary entity ids to carry a canonical brand and every FK child brand to equal
  its parent column brand. Arbitrary `$type<string>()`, missing brands, and cross-brand FKs fail.
- `brand-in-name-position` derives 71 lower-camel signature positions from the canonical kit types and checks
  parameters, property signatures, and property declarations through the final shared visitor pass.
- The legacy `@foreign-id-ok` parser, three private descendant walks, module-global pass state, file grant
  table, and local marker-staleness logic are gone.
- All live foreign-wire exceptions use the final central grammar:
  `@orb-waive brand-in-name-position(<position>): <reason and end condition>`.

The migration found 73 live markers across 19 product/test-support files, rather than the older 70-row
census. The first real pass consumed 67 and exposed six return-value comments attached inside request
objects. Those comments now sit on the exact returned `assetId`/`characterId` properties. The repeated real
pass produced 73 raw findings, 73 exact waivers, zero effective findings, zero waiver alarms, and zero policy,
fact, or authority errors.

The repeated run loaded 7,132 sources. Under heavy concurrent host load, policy visitor time was 30.84 s and
process wall was 61.37 s. This is not accepted as a final performance baseline: the final runtime shares one
physical walk across every policy, and the composed cutover run must measure total wall/RSS rather than add
isolated policy timings.

## Remaining identity-flow policies

Read and convert as one family before leaving this area:

- `no-raw-id`: replace textual Zod recognition and gate-local symbol exemption with canonical call/type
  identity and central authority;
- `no-mint-via-cast`: recognize the kit `castId` call and generator provenance rather than callee text;
- `no-loose-id-cast`: retain the authored cast-shape rule with final positioned findings;
- `no-fake-disabled-id`: share canonical `castId` and static-string facts with the mint rule.

`registry-context-via-mint` contains the word mint but is a registry-construction policy, not an identity
brand policy, and remains in its own family.
