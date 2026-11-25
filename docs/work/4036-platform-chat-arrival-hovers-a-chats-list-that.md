---
kind: bug
status: open
updated: 2026-11-25
priority: P3
area: testing
plan: test-foundation
---

# platform-chat-arrival hovers a Chats list that sits off screen on the webkit-iphone project

## What

Three cases in tests/client/features/chat/components/platform-chat-arrival.suite.ct.tsx fail on the webkit-iphone CT project at locator.hover, because the Chats list is off screen on the phone viewport. Chromium passes.

## Why

A phone project that cannot reach the list proves nothing about arrival on a phone, and the red hides any real phone regression in that suite.

## Done when

The suite reaches the list the way a phone user does (the phone navigation, a tap instead of a hover) or scopes those cases to pointer projects with the reason stated, and the suite passes on webkit-iphone.

## Evidence

Filled at landing: what ran and where its output is.
