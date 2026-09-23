---
kind: decision
status: done
updated: 2026-09-23
priority: P3
area: server
evidence: a79f854739ffa16563a24b74071ff05bfcfbeae7
---

# Decide whether the per-chat automation fire-rate cap gets a host surface or is removed

## What

The per-chat fire-rate cap plane has no route and no client. AutomationService.getBudgets and setBudgets, selectBudgetView, the upsert in packages/server/src/domain/automation/persistence/budgets.ts, the verbs get-budgets.ts and set-budgets.ts, and the BudgetView contract in packages/contracts/src/automation/index.ts are exercised only by their own integration tests. The fire-time check in persistence/fires.ts still reads automation_budgets, so every chat is held to the default ceiling and no host can view or change it. Only the owner-wide plane (getOwnerBudgets/setOwnerBudgets, OwnerBudgetView) is routed and rendered in settings.

Owner ruling: outcome (b). Delete the per-chat plane and keep a fixed default. The owner-wide cap in
settings stays.

## Why

The per-chat cap is a live runtime limit that no user can reach. Either chat hosts need a way to tune it, or it should collapse to a fixed default and the unreachable read/write plumbing and its contract type should go. Leaving it as is ships a contracts type with no boundary crossing and a service API with no caller.

## Done when

One of the two outcomes holds. (a) packages/server/src/transport/trpc/routers/automation.ts has host-gated procedures that call automation.getBudgets and automation.setBudgets, a client component under packages/client/src/features/automation calls them, and a test covers the round trip. (b) getBudgets, setBudgets, selectBudgetView, the per-chat upsert and BudgetView are deleted along with their dedicated tests, and the fire-time check reads a fixed default. For (b), `rg -n "\bgetBudgets\b|\bsetBudgets\b|\bBudgetView\b|selectBudgetView" -g '*.ts' -g '*.tsx' packages tests` returns nothing.

## Evidence

Filled at landing: what ran and where its output is.
