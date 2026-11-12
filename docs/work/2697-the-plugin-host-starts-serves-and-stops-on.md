---
kind: bug
status: blocked
updated: 2026-11-12
priority: P1
area: plugins
blocked: owner
---

# The plugin host starts, serves and stops on native Windows and macOS

## What

The product ships native Windows and macOS installs as well as the Linux container. The plugin host's recent process work assumes POSIX behaviour through Node APIs. The broker refuses to start unless `fstatSync` on its heartbeat descriptor reports a FIFO or a socket (`packages/server/src/infra/plugin-host/broker-entry.ts`); what that reports for an inherited pipe on Windows is unverified. The watchdog stops the broker with a termination signal and the broker and watchdog listen for that signal to shut down (`broker-watchdog.ts`, `broker-entry.ts`, `process-runtime.ts`); on Windows a kill ends the process at once and the handler never runs. The heartbeat rides an extra stdio pipe addressed by descriptor number. The install workflow on Windows and macOS proves only that the app starts and answers its health route, and no plugin runs there.

## Why

A plugin host that will not start or cannot stop cleanly on Windows breaks plugins for every native Windows install, and nothing run on the owner's box or in CI would show it before a release.

## Done when

The broker's start check, heartbeat and shutdown use mechanisms Node documents as the same on Windows, macOS and Linux, with shutdown carried as a message on the IPC channel and not as a signal. The install or contributor workflow on Windows and macOS installs a showcase plugin, runs it, ends a stuck call, and stops the server with no orphaned broker or watchdog process. The plugin rule file states the three targets.

## Evidence

Filled at landing: what ran and where its output is.
