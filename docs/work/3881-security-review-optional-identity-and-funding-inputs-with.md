---
kind: work
status: doing
updated: 2026-11-27
priority: P3
area: security
lane: wt/agent-ad0816928eb62737d
plan: unwired-code
---

# Security review: optional identity and funding inputs with no client sender

## What

personaRouter.setActivePersona.targetUserId lets a host set another user's persona; the client type omits it (packages/client/src/features/persona/hooks/use-chat-persona.ts). imageryRouter.extractPrompt.subjectCharacterId feeds resolveRoomRunAs, which picks who funds the extraction (packages/server/src/domain/imagery/verbs/extract-prompt.ts). Neither has a client sender.

## Why

An unsent input on an authority or funding path is a door no screen exercises and no ruling records.

## Done when

security-builder rules each input keep or remove with its reason recorded, and a test drives the kept one through the router with a foreign principal.

## Evidence

Filled at landing: what ran and where its output is.
