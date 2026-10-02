---
kind: adr
status: active
updated: 2026-10-02
supersedes: docs/adr/0276-plugin-install-doors-share-one-funnel.md
---

# Supported plugin install sources share one bundle funnel

## Context

Plugin authors install through browser zip or folder upload, bundle URL, or Git. These sources share parsing, consent and storage.

## Decision

Browser zip and folder uploads, bundle URLs and Git repositories are the supported plugin install sources. Each produces bundle bytes and enters the existing install and upgrade verbs. Server-directory admission is not a supported install source. Folder upload packs admitted entry names in the browser; the server validates every byte. Git shallow-clones through the egress validators into a scratch directory, uses the shared packer, deletes the clone and records the resolved commit. URL and Git install or upgrade require the exact byte or commit identity shown at preview. Plugin ownership, capability consent and disabled-by-default installation remain governed by D147. Homes: packages/server/src/domain/plugin/, packages/server/src/infra/plugin-source/, packages/server/src/infra/network/plugin-git.ts and packages/client/src/features/plugin/.

## Consequences

A new source produces bundle bytes, never a new validation or storage path. Shared packing helpers remain available to supported Git and author-time paths.

## Alternatives rejected

A server-directory install endpoint without a shipped caller adds filesystem admission without a supported user flow. A live-directory registry duplicates the CAS bundle store. A server multipart-folder verb duplicates browser folder packing. System git adds process execution; persistent clones add storage and cleanup.
