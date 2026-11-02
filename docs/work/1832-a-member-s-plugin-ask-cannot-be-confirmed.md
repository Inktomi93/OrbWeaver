---
kind: bug
status: open
updated: 2026-11-02
priority: P3
area: plugin
---

# A member's plugin ask cannot be confirmed: the liveness check requires the installer to hold host

## What

A plugin ask runs on the yes of the host its card was raised to. At raise, the ask records that host and the installer's membership instance (`joinSeq` and `joinedAt`). The confirm re-check and the chat-change void sweep require both to be unchanged, so a handoff, a departure or a removal voids the ask, even when the installer is invited back first. The installer need not host. The rule origin still requires its author to host. The confirmed turn skips the bridge's direct-call host gate. Chat's own present-initiator check still applies. The card names the installer's handle and carries a turn's whole steer in its `detail` body.

## Why

`assertPluginStillLive` in `packages/server/src/domain/automation/verbs/confirm-suggestion.ts` required the installer to hold host. A member's plugin can only ask, because a member has no standing write authority. So every member ask failed with `SuggestionRefusedError`. The void sweep in `packages/server/src/domain/automation/substrate/handle-event.ts` also dropped a member's ask on any chat change, such as a title edit. The confirmed turn then met `requireHost(installer)` in `packages/server/src/domain/plugin/substrate/bridge.ts`.

## Done when

- A member's plugin ask, raised through the real guest, runs a turn when the host confirms it, including after a title edit.
- A demoted host's plugin ask runs when the new host confirms it.
- The installer cannot confirm their own ask, and the ask stays open for the host.
- A removed installer, an installer who left, and a disabled plugin leave no executable ask.
- A host handoff voids a member's open ask.
- An installer removed and invited back before the sweep runs gets no act from the old ask.
- The card names the installer and holds the whole steer.
- The ruling has a law line: `docs/law/Spine-Identity-and-Auth.md` §2e.

## Evidence

- `tests/server/domain/automation/verbs/plugin-ask-confirm.int.test.ts`. On the first source, the three positive cases failed: the sweep voided the ask after a title edit, and the other two refused with "the plugin's installer no longer hosts this room".
- Review follow-up, red on the first fix: the handoff and the removed-then-reinvited confirms both resolved and ran the act. The card's summary did not name the installer. The reinvite case holds automation's event handler, so the confirm runs before the removal is swept.
- All ten cases pass after the fix.
- Control checks:
  - With the plugin arm of `askActorStillStands` forced true, the removed and left cases fail. The act reaches chat's present-initiator check and fails as `automation_suggestion_act_failed` instead of a voided ask.
  - With the membership-instance comparison disabled, the reinvite case fails.
  - With the host comparison disabled, the handoff case fails.
- Floor: `pnpm --filter @orb/showcase-plugins build`, then `pnpm test` on `tests/server/domain/automation`, `tests/server/infra/plugin-host`, `tests/server/domain/plugin`, `tests/showcase-plugins/guest-boundaries.int.test.ts` and `tests/support/node/corpus-plugin-host.int.test.ts`.
- Not rendered-checked: the client's steer disclosure in `packages/client/src/features/automation/components/suggestion-card-mount.tsx`. No component test mounts the suggestion band.

## Owner ruling (2026-11-02)

The host's yes is the authority. A member-installed plugin's ask confirms when the plugin is still installed and enabled and its installer is still in the room; the installer no longer needs to hold host. This is an owner exception to the rule in `packages/server/src/domain/automation/verbs/confirm-suggestion.ts` that the confirmer's host role never stands in for the actor's, and it applies to the plugin origin only; the rule origin stays as it is. An installer who held host and was demoted is now a member and is covered (claude-b's reading, put to the owner). Route to security-executor. Done: a law or ADR line, and a test that drives a member ask through confirm.
