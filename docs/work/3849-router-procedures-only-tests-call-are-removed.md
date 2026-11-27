---
kind: work
status: doing
updated: 2026-11-27
priority: P2
area: server
lane: wt/agent-a909b53dff73d9f07
plan: unwired-code
---

# Router procedures only tests call are removed

## What

echo, persona.get, settings.getAppSettings, settings.getGlobalSetting, settings.setGlobalSetting, tag.listTags and worldInfo.getEntry have no client caller; chat.getNextTurnConnection is already boarded as 3791.

## Why

An exposed procedure nobody calls is attack surface with no purpose (3672). The owner ruled that tests do not keep a procedure; reports/unwired/procedures-judge.md gives the production reader each test moves to.

## Done when

The seven procedures are gone, their tests run through the production procedure or service verb named in the judge report, and pnpm unwired procedures lists none of them.

## Evidence

Filled at landing: what ran and where its output is.
