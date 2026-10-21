---
kind: adr
status: active
updated: 2026-10-21
---

# Host handoff settles old-authority work before transfer

## Context

D19 freezes a deferred turn's funding and assembly authority to its original host. D131 transfers accepted copies into the recipient's ownership. Replaying the old turn against those copies violates that authority boundary. The queued turn has no historical execution snapshot.

## Decision

Host acceptance settles the room's already-authorized old-host work before copying property or swapping authority. Settlement uses the original frozen funder and assembly authority through the real engine. It settles only the accepting room, not the host's other rooms.

A chat-scoped transition closes new admission and joins admitted preparation, queue claims, commits and owned continuation work that can still affect the room. Requests blocked by the transition receive a retryable refusal before preparing stale authority. Normal turn concurrency remains unchanged outside a handoff. Stop ownership, native engine leases and durable claim and commit checks remain in force.

If settlement cannot complete, acceptance returns a retryable refusal before property copying or the authority swap. Owed rows remain owed. Completed replies and their paid facts remain committed; a later handoff failure does not roll them back. After settlement, the existing D131 copy and atomic room transfer run under their current ownership checks. Subsequent turns use the new host.

Do not borrow the recipient's authority, retain old-owner room property after transfer or introduce historical execution snapshots to bypass settlement. The chat domain owns settlement and admission; composition only wires its graph.

## Consequences

Handoff acceptance can wait for current room work and can require retry when that work fails. D131's existing library-before-swap crash behavior remains unchanged. Implementation is not yet built; work item1222 owns delivery and the public queued-reply, ownership, concurrency and failure controls.

Admission follows the supported single-replica service lifecycle. Native database claims and commit checks remain in force for concurrent maintenance writers. This decision adds no multi-replica chat execution contract.

## Alternatives rejected

Immediate transfer with historical queued-context snapshots adds a new persistence and attribution contract. Refusing every handoff with pending debt leaves settlement to a separate action. Cancelling owed replies changes their accepted liability. These alternatives are not the selected behavior.
