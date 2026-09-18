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

The second slice converts three more policies:

- `no-loose-id-cast` uses compiler-resolved canonical brand identity for the double-cast arm and the final
  positioned waiver plane for six form-library `as never` escapes;
- `no-mint-via-cast` resolves both the kit `castId` seam and known generator origins through aliases rather
  than matching callee text. The one newly exposed `globalThis.crypto.randomUUID()` socket mint now uses
  `newId<SocketId>()`, the canonical prefixless brand minter;
- `no-fake-disabled-id` shares the canonical cast matcher and static authored-value reader, so import aliases
  and const/wrapper spellings cannot hide an empty sentinel.

All identity policy descriptors share `gates/_proof/id-brand.ts` for isolated kit brand/cast fixtures and
run through one `id-brand-flow.suite.test.ts` conformance entry. No test owns a Project walker or policy runner.

The first unfiltered real cast-family pass took 66.30 s because canonical module resolution ran on every call
expression. The invocation-local matcher now indexes kit import aliases once per source before resolving
only candidate calls. The repeated full-project run took 22.45 s, produced zero effective findings, consumed
all six `no-loose-id-cast` waivers, and reported no waiver, policy, fact, or authority errors. Peak RSS was
3,455,360 KiB with no swap or major page faults.

The final slice converts `no-raw-id`. It recognizes the authored Zod import door and call chain through
named/namespace aliases instead of substring matching. Seventeen existing foreign, polymorphic, lenient,
and opaque id-shaped fields moved from legacy `@orb-gate-ignore` comments to exact central waivers. The old
whole-symbol `triggerFactSchema` bypass is deleted: its nine guest-marshalling fields now carry nine
independent occurrence waivers, so one new raw id cannot inherit a schema-wide exemption.

The real pass found 26 raw Zod id positions, consumed all 26 waivers, and produced zero effective findings,
waiver alarms, or tool errors. The schema and id-brand-flow conformance entries cover all six final identity
policies. The identity-flow conversion slice is complete; later work may share more generic callable-origin
facts with other families, but no identity policy remains on the legacy descriptor contract.

`registry-context-via-mint` contains the word mint but is a registry-construction policy, not an identity
brand policy, and remains in its own family.
