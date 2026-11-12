---
kind: plan
status: active
updated: 2026-11-12
rank: 2
---

# The product behaves the same on Windows, macOS and Linux

## Goal

Server, inference and launcher code use mechanisms that behave the same on the three systems the product ships on, and a workflow on each system proves the parts that touch processes, pipes, signals, paths and files.

## Shape

Prove the plugin host on native Windows and macOS first. Then survey the server, inference and launcher code for behaviour that differs by system, starting with what changed since the last release, and fix each finding with a documented cross-platform mechanism or a tested path for the other system.

## Rejected

Treating the Linux container as the only target. A signal as a protocol. A descriptor number or a file mode as a guarantee.

## Coupled sites

The install and contributor workflows, which are the only native evidence.

## Test plan

Each mechanism cites the Node documentation for its cross-platform behaviour, and the workflow matrix runs the process and file cases on each system.
