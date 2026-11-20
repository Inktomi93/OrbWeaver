---
kind: bug
status: open
updated: 2026-11-20
priority: P2
area: client
---

# A user can upload a video background from the background picker

## What

The background asset kind admits video (packages/contracts/src/assets/index.ts, the background media list holds image and video), and the app shell plays a video background muted and looping, but neither door into the background library takes one: packages/client/src/features/app-shell/components/background-upload-field.tsx sets `accept="image/*"` and labels its field as an uploaded image, and packages/client/src/features/app-shell/components/external-background-field.tsx fetches the address and refuses anything that is not an image. A video dropped into a chat is chat media and never reaches the background picker.

## Why

A shipped capability with no way in reads as a missing feature, and the wiki now says video backgrounds play without being able to say how to add one.

## Done when

The background upload and the address field both accept the video types the background kind admits, their labels and refusal copy cover both, a case adds a video background through each real door and sees it play, and the Themes wiki page gains the how-to.

## Evidence

Filled at landing: what ran and where its output is.
