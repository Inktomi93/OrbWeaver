---
kind: adr
status: active
updated: 2026-10-03
---

# A picture made in a room runs as the room host

## Context

D204 homes the imagery prompt templates per user and keys every imagery concern on the caller. In a shared room every text turn runs as the host: `resolveTurnIdentity` (`packages/server/src/domain/chat/engine/turn-identity.ts`) freezes the host as funder and run-as principal. The owner ruled that the host funds and styles room pictures too, so a room follows one rule and a member without an image connection can still make a picture there.

## Decision

A picture or prompt preview requested in a room runs as the room host. Chat names the host through `resolveTurnIdentity` and hands its `runAsUserId` to imagery: `chat.generateImage` passes it on the picture op (`packages/server/src/domain/chat/verbs/generate-image.ts`), and `imagery.extractPrompt` resolves it at compose (`resolveRoomRunAs` in `packages/server/src/entry/compose/imagery.ts`) after the caller passes the room visibility gate, so a caller the room does not admit reaches no host read and spends nothing of the host's. A preview's subject must be a present character seat of the room (`createCharacterSeated`); any other subject gets the same not-found before any card read or spend, so a member cannot name or caption a host character outside the room.

The run-as principal supplies the image connection, the extraction templates and caption instructions, the negative-prompt base, the Utility connection and caption sampling preset, the generation owner, the asset store, the spend, the reuse lookup and the gallery placement (`runAsFor` in `packages/server/src/domain/imagery/verbs/generate-picture.ts`). The caller stays the message author, the viewer whose visibility gate and history floor clamp the extraction, and the reader of the subject card and avatar, so a caption never reaches a character the caller cannot read.

The picture is a `generated` asset the host owns. Its `generated-post` link in `message_assets` places it in the room, and a present member renders it through the room asset gate: a link in that chat, the owner present and the viewer present (`loadChatAssetRefs` and `loadCoParticipantOwner` in `packages/server/src/entry/compose/assets-character.ts`). The member does not own it, so owned-asset reads refuse it: `assets.resolveBlobRefs`, `imagery.readProvenance` and an `imagery.editImage` source. It joins the host's gallery under the room's first character when the host owns that character, unless the request sends `gallery: false`.

Outside a room nothing changes: `editImage`, a chat-less generation, and the automation and plugin lanes run as their own caller, under D204.

The reuse lookup searches the run-as principal's generations in every chat. Chat's picture op carries no subject, so a member's room picture never reaches it. A room path that adds a subject must scope reuse to its chat, or a member could pull the host's picture from another room into this one.

## Consequences

A member with no image connection can make pictures in a host's room, and the host pays the spend and the storage. A member cannot edit a room picture or read its provenance. Room pictures render while the host is a present participant, the same rule as a model's inline reply pictures. When the host lacks an image connection, the refusal names the room host rather than the member.

## Alternatives rejected

Keep the member's connection and ownership: a room would fund text and pictures by different rules, and a member without a key could not imagine. Fund through the host but store under the member: the bytes, the spend and the gallery would split across two principals. Apply the room rule to the automation and plugin lanes too: they carry their own binding actor and caller, which is a separate decision.
