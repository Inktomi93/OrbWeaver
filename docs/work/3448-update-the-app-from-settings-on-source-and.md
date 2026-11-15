---
kind: work
status: open
updated: 2026-11-15
priority: P2
area: server
---

# Update the app from Settings on source and native installs

## What

Settings, This install, can check for a newer release but cannot apply it. `update.sh` and `update.cmd` already refuse a changed checkout, wait for the server to drain and stop, pull, install and restart. Not yet built: an owner-only Update action, shown when the check reads behind and never in a container. It shows every connected client an updating state, refuses new turns, lets running replies finish, closes the database and exits with a reserved exit code. `start.sh` and `start.cmd` read that code, run the update script and start the app again. An install not started through the start script keeps the notice and the command. The precedent report is `2026-11-15-cb-in-app-update-precedent.md` under `reports/reviews/`.

## Why

The first outside user asked for it, and asked that chat be blocked during the update so files are not damaged. A user on a native install must now stop the app and run a script by hand.

## Done when

The owner updates a source install from Settings on Linux, macOS and Windows and the browser reconnects to the new version. No turn starts after the update begins and a running reply is kept. The action is refused for a non-owner, under Docker, on a changed checkout and when the app was not started by the start script, each with a plain reason. A failed pull or install starts the old version again and says why. The drain is requested without a signal, so it works on Windows. Tests cover the refusals, the drain and the exit code hand-off, and `.github/workflows/install.yml` exercises the hand-off on Windows and macOS.

## Evidence

Filled at landing: what ran and where its output is.
