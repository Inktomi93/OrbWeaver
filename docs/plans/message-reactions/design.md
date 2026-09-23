---
kind: plan
status: active
updated: 2026-09-23
---

# Message reactions: custom emoji

## Goal

Users and characters can react with custom emoji images as well as Unicode, through the same reaction plane.

## Shape

**Already built:** the Unicode reaction plane: reactions are chat canon in a `message_reactions` junction keyed to a message variant and a participant, optionally anchored to one speaker segment, fed back into the next turn's prompt as attribution notes, writable by characters through the `react` tool, and emitting `reactionsChanged` for automation. The table already carries a nullable `emojiImageAssetId` (`packages/db/src/schema/chat.ts`).

The remainder is custom emoji, owner-ruled to ship:

- A custom emoji is an asset in the per-user CAS (D21), referenced by `emojiImageAssetId`, never a raw URL; images pass the image-proxy magic sniff.
- Rendering goes through the `@orb/ui` media primitive, never a raw `<img>`.
- The picker gains a custom-emoji surface beside the Unicode set.
- Grouping and toggling reuse the Unicode path: one group per emoji, reactors listed by participant.

## Open questions

- Where a user's custom emoji library lives and how a room member sees another member's emoji.

## Rejected

- Storing an image URL on the reaction, as Marinara does: an emoji image is an asset like any other.

## Coupled sites

- `packages/db/src/schema/chat.ts` (`message_reactions`)
- `packages/server/src/domain/chat/verbs/reactions.ts`
- `packages/server/src/domain/assets/`
- the reaction picker and chips in `packages/client/src/features/chat/`

## Test plan

- Verb tests: adding a custom-emoji reaction stores the asset reference and toggles like Unicode.
- A member-visibility test for another member's custom emoji.
- A CT for the picker and the rendered chip.
