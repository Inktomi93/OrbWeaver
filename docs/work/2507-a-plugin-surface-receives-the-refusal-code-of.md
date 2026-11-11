---
kind: work
status: open
updated: 2026-11-11
priority: P3
area: plugins
---

# A plugin surface receives the refusal code of its host call

## What

A refused plugin UI host call now carries a code in the tRPC error data. The client relay (packages/client/src/features/plugin, the host-call hook, the guest host and the plugin frame) forwards only the message to the guest, so a plugin surface cannot key on the code that the contract's doc comment (packages/contracts/src/plugin/ui-host.ts) says it can. The client copy for the storage key cap repeats the cap as a literal where the contracts constant exists. The guest now sees the server's refusal sentences word for word. Source: the errors leg-four review report under reports/code-reviewer.

## Why

The code exists so a plugin author can tell their own bad call from a broken host, and it stops one hop short of them. A literal cap in copy drifts from the enforced one.

## Done when

The relay forwards the code to the guest beside the message and the plugin SDK types name it, or the contract's doc comment stops promising it. The cap in client copy reads the contracts constant. If any shipped surface shows guest error text to a person, a rendered review has read the sentences.

## Evidence

Filled at landing: what ran and where its output is.
