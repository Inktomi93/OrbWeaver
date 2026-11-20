---
kind: work
status: open
updated: 2026-11-20
priority: P2
area: server
---

# The app can update itself from inside, with chat locked while it does

## What

Add an update action the owner can run from inside the app instead of stopping the server and running the update script by hand. It checks the release branch for a newer version, shows what it is, backs up the database the way the update script does, stops new turns and writes for every member with a visible notice while the update runs, then restarts on the new version. Docker installs say updates come from pulling the image and show the command instead. Owner-only.

## Why

A real user asked for it and the owner told them it was on the board. The user also asked that nobody can chat while it runs, so files cannot be corrupted mid-write.

## Done when

From a script install, the owner sees the available version, presses update, every member sees the room locked with a reason until the restart, the database backup exists before any file changes, and the app comes back on the new version; a Docker install shows its own instructions instead; a failed update leaves the old version running and says what failed. Runs on Linux, macOS and Windows script installs.

## Evidence

Filled at landing: what ran and where its output is.
