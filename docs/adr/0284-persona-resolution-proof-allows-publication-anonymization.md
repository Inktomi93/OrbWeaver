---
kind: adr
status: active
updated: 2026-10-02
supersedes: docs/adr/0153-the-persona-pin-active-resolution-semantics-are-owner.md
---

# Persona resolution proof permits identity-only publication anonymization

## Context

The owner-approved fixture scrub includes the persona-resolution suite. Its protected behavior must remain unchanged.

## Decision

The host pin in chats.anchorPersonaId and the member active persona in chat_participants.activePersonaId retain their established resolution into the user macro and turn identity under D122. Behavior changes require evidence and an explicit owner ruling. Ownership validation and non-disclosing boundary refusals may change without altering resolution order.

Persona pickers, menus and editor surfaces may evolve without freezing unrelated presentation work.

Keep tests/server/domain/chat/persona-resolution.suite.int.test.ts semantically unchanged and green. The owner-approved publication scrub may replace private fixture names, identifiers and their coupled expected identity literals. Preserve every case, authority boundary, resolution order, assertion meaning and failure expectation. This exception does not permit editing tests to fit a behavioral change. Other suite changes remain subject to the existing byte-preservation constraint and owner-gated behavior policy.

## Consequences

Run the complete affected persona-resolution suite after anonymization. Review the fixture-only diff independently; name substitutions do not prove behavioral equivalence by themselves.

## Alternatives rejected

Retaining private fixture identities is rejected. Weakening or deleting persona-resolution assertions is rejected. General permission to change persona semantics is rejected.
