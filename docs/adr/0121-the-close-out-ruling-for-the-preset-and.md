---
kind: adr
status: active
updated: 2026-09-23
---

# the close-out ruling for the preset and actor-state programs. Seven clauses (A–G); each stands alone

## Context

Not recorded in the ledger row.

## Decision

Reviews behind it: commit `09cd25525` (§6 = clause 1 verbatim) · `2026-08-03-lifecycle-portability-model.md` §4d · `2026-08-03-regex-model.md` §0/§3 · `2026-08-03-client-architecture.md` F-2 · commit `f551bb42e` §4.3/§5.

**(A) The role-authority law — one kernel, cited chokepoints, and the two comparison classes.** Authority derives from two role axes with one home each (`UserRole` and `ParticipantRole`, `@orb/contracts/identity` — D17/D18) and is decided in ONE kernel: the injected `can()` (`domain/admin/guard.ts`; spine invariant 6). `owner ⊇ admin` and the chat `host` verdict are encoded there and nowhere else. Every read of a role vocabulary falls in exactly one of two classes, split by a MECHANICAL test — what the verdict DOES:

- **(1) ENFORCEMENT** — the verdict gates whether an operation proceeds (it throws, or selects a refusal). The comparison lives in the kernel; a domain reaches it only through its own CITED chokepoint file (chat: `substrate/auth/decide.ts` `assertHost`/`permitsHost`/`assertAuthorOrHost` under `guard.ts` `requireParticipant`/`requireHost`; rpg: `guard.ts` `resolveMember`/`resolveHost`/`assertHostRole`/`assertOwnUserRef`), which owns the domain-coded, leak-free refusal shape (not-found vs forbidden — the chokepoint's, never the verb's) but never the comparison. \[The transitional rider is SPENT: stage R1 landed — `RpgContext` carries the injected `can`, `assertHostRole`/`assertOwnUserRef` are a catch-and-reword over the kernel (rpg's refusal sentences byte-identical; `tests/server/domain/rpg/authority.suite.int.test.ts` passed unmodified), and the `two-class-role-authority` gate's two-sided `SANCTIONED_HOMES` is back to ONE row — the kernel itself.]
- **(2) DATA PROJECTION** — the verdict produces a payload/view field, selects a viewer's bytes, or resolves a role-conditioned policy VALUE. Deliberately Principal-free and kernel-free BY DESIGN: the host-bit has ONE spelling (`substrate/member-visibility.ts::viewerHoldsHost`; the payload boundary asks through its named review `viewerReadsHidden` — D106/D110), and the policy resolvers (`substrate/auth/clamp.ts` — the D16 history floor, the D22 card level) compose it. Wiring a projection through `can()` threads a Principal into pure code for zero behavior change and is itself a defect. \[F1 RULED to this class and landed at stage R2: every byte-selection site in `chat/verbs/read.ts` reads `viewerReadsHidden`, and `clamp.ts` composes `viewerHoldsHost` rather than re-spelling the compare.]
- Two shapes are in NEITHER class and stay legal: a roster host-LOOKUP (role → identity, D19 — one helper, never N inline spellings; landed as `chat/substrate/participants-host.ts` `hostSeatOf`/`hostUserIdOf`, whose `userId` control is the ONE answer for the class) and the role MINT (`sessions` group governance, D65 — it derives the axis and never compares the lattice). Enforcers: `two-class-role-authority` (the throw-position test IS the class line), `owner-role-split` (the global lattice), `membership-enforcer` (no owner-equality resurrection in chat).
- **The agents rider (the extension contract):** a new participant kind or authority tier lands as (a) a tuple member at the vocabulary home, (b) a kernel decision row — `ChatMembership` widens to carry `kind` the moment a verdict needs it (the construction sites are the compile-forced update set), and (c) a capability ceiling as the third permission factor (spine §2), decided at the kernel — never as a scattered compare, and NEVER by inheriting the host principal's authority through a turn's execution context: an initiator's ceiling derives from its own factors at the point of initiation.

Split off for the 8 KiB ADR cap, each clause standing alone as this ADR's title states: the permissions model page [ADR 0210](0210-permissions-model-one-page.md), the eight-section rail [ADR 0211](0211-rail-is-eight-sections-home-is-default.md), the lifecycle chrome anatomy [ADR 0212](0212-lifecycle-chrome-anatomy.md), the regex script library storage amendment to D53 [ADR 0213](0213-regex-script-library-storage.md), the R4 promotion doorway's named gaps [ADR 0214](0214-r4-promotion-doorway-named-gaps.md), and the preset readout binding chip [ADR 0215](0215-preset-readout-binding-chip-lane-d8.md).

## Consequences

Not recorded in the ledger row.

## Alternatives rejected

Not recorded in the ledger row.
