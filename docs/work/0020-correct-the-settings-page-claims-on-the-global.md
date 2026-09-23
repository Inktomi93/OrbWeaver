---
kind: work
status: open
updated: 2026-09-23
priority: P3
area: automation
---

# Correct the settings-page claims on the global-variable read path

## What

Rewrite the comments that describe GlobalVariableView and listGlobalVariables as a settings-page surface. There are five sites: packages/contracts/src/automation/index.ts (the GlobalVariableView doc comment), packages/server/src/domain/automation/verbs/list-global-variables.ts (file header), packages/server/src/domain/automation/contract/service.ts (the listGlobalVariables member doc), packages/server/src/domain/automation/contract/params.ts (the ListGlobalVariablesParams prefix doc), and packages/server/src/domain/automation/contract/views.ts (the file header's claim that the settings page reads GlobalVariableView across the server-to-client boundary). Each should say what is true: a server-side projection read by the CEL environment build and the test-rule verb, with no tRPC procedure and no client reader. In views.ts, restate why the type homes in @orb/contracts without claiming a client consumer. Leave the BudgetView half of that header to its own finding.

## Why

Five comments claim a settings page and a client reader that do not exist. The views.ts header uses that claim to justify putting the type in @orb/contracts. A reader who trusts these comments will look for a UI route or tRPC procedure that is not there, or will assume that changing the shape needs client-side changes.

## Done when

`rg -n -i "settings.page|settings page" packages/contracts/src/automation/index.ts packages/server/src/domain/automation/verbs/list-global-variables.ts packages/server/src/domain/automation/contract/service.ts packages/server/src/domain/automation/contract/params.ts` returns no line about global variables. The views.ts header no longer says GlobalVariableView is read by the client. `rg -n "GlobalVariable|globalVariable" packages/server/src/transport packages/client` still returns zero matches, which agrees with the corrected comments.

## Evidence

Filled at landing: what ran and where its output is.
