---
kind: work
status: doing
updated: 2026-11-08
priority: P3
area: client
lane: wt/agent-a53049a5655c3c496
plan: cross-surface-consistency
---

# Chat and multiplayer P3 bundle from acceptance part 2

## What

C2: the slash strip cuts command signatures with no ellipsis at 320 and 390. M3: Re-pin in the held state opens a menu with only Clear pin. M4: the outstanding invite row does not name the targeted handle.

## Why

Each is a reading or labelling gap in the chat room found in acceptance.

## Done when

Each finding is fixed with a capture, or answered with a cited reason in this item's Evidence. Source: acceptance part 2 report.

## Evidence

- Slash strip: the shared `OptionStrip` label now truncates, so a signature wider than the row ends in an ellipsis inside the row at 320 and 390. CT `tests/client/features/chat/components/slash-strip-signature.ct.tsx` mounts the real room, types a slash and checks every label stays inside the strip with `text-overflow: ellipsis`. It fails on the prior source.
- Re-pin in the held state: with no member to pin, the pin line shows a direct Clear pin button. The Re-pin menu stays when a member is present. CT `tests/client/features/persona/components/persona-room-block.ct.tsx` fails on the prior source.
- Targeted invite: `InviteView` carries `invitedHandle`, set at creation and resolved in `listInvites` through the injected batched `ChatContext.loadUserHandles` (the same sessions read that resolves visible rooms), so a list makes one user read however many invites it holds and no avatar read. The row title and the Revoke name say who it is for. Node test `tests/server/domain/chat/verbs/invite-target-handle.int.test.ts` counts the user and settings statements through a counted database across four targeted invites and one share link; against the per-row read it sees four user reads and four settings reads. CT `tests/client/features/chat/components/invite-target-row.ct.tsx` fails on the prior source.
- `Clear pin` is one exported name, `CLEAR_PIN_NAME` in `packages/client/src/features/persona/lib/persona-copy.ts`, read by the button, the menu item and the CT.

The chat options menu is untouched.
