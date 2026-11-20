---
kind: bug
status: open
updated: 2026-11-20
priority: P2
area: client
---

# A user can upload a video background from the background picker

## What

The background asset kind admits video (packages/contracts/src/assets/index.ts, the background media list holds image and video), and the theme surface plays a video background muted and looping, but the only upload door, packages/client/src/features/app-shell/components/background-upload-field.tsx, takes `accept="image/*"` and labels its field as an uploaded image. A user has no way to add the video background the app can play.

## Why

A shipped capability with no way in reads as a missing feature, and the wiki now says video backgrounds play without being able to say how to add one.

## Done when

The background upload accepts the video types the background kind admits, its label covers both, a case uploads a video background through the real field and sees it play, and the Themes wiki page gains the how-to.

## Evidence

Filled at landing: what ran and where its output is.
