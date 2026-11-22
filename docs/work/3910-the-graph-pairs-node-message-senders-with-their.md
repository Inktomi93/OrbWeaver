---
kind: tooling
status: open
updated: 2026-11-22
priority: P2
area: tooling
plan: unwired-code
---

# The graph pairs Node message senders with their receivers

## What

Values handed to Node message doors land in a library slot typed any or a type parameter, so the graph records a send and stops: Worker postMessage, parentPort and workerData; EventEmitter emit with on/once handlers; child_process spawn and IPC message handlers; BroadcastChannel; AsyncLocalStorage run and getStore; diagnostics_channel publish and subscribe. The receiver that reads the value by name is never linked, so its fields sit in member-sent-only whether or not a receiver reads them.

## Why

Owner ruling: a sent field counts as read only where its receiver reads it by name; the graph cannot apply it when it cannot find the receiver.

## Done when

Each door pairs a send with its receivers by its link (the worker module a new Worker(new URL(...)) names, the same emitter symbol and event name literal, the same channel name, the same AsyncLocalStorage instance), and the receiver parameter is a flow slot for the sent value, through a zod parse at the receiver; an unpaired send stays sent-only and an unpaired receiver is reported; planted case per door with red proof; the real-tree sent-only rows that move are listed.

## Evidence

Filled at landing: what ran and where its output is.
