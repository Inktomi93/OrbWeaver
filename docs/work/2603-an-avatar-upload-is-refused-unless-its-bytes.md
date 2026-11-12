---
kind: bug
status: doing
updated: 2026-11-12
priority: P2
area: security
lane: wt/agent-a84eabc3e8d8f0a49
---

# An avatar upload is refused unless its bytes are an image

## What

The asset upload accepts UTF-8 text for the avatar kind (packages/server/src/domain/assets/substrate/mime.ts). A text file sent as an avatar is stored and linked as a persona or character picture. The client control is gaining its own image check, but the server is the boundary.

## Why

The server must not store a file as a picture on the client's word. A non-image avatar renders as a broken picture everywhere the entity appears, and an upload boundary that trusts the declared kind invites other content through it.

## Done when

The avatar kind accepts only image types proven by the byte signature, a non-image is refused with a coded reason, and a test uploads text, a mislabelled file and a valid image through the production upload route. A scan of the owner's database copy reports any avatar asset that is not an image.

## Evidence

Filled at landing: what ran and where its output is.
