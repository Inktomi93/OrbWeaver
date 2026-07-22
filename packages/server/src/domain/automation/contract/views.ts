// domain/automation/contract/views — the read-models the global-variable + budget verbs return.
// `GlobalVariableView` / `BudgetView` cross the server↔client boundary (the settings page + the A8 budget
// panel read them), so their ONE home is `@orb/contracts/automation`. This slot RE-EXPORTS — never
// re-declares (a second home the client could disagree with; the resolve enforces single-home).

export type { BudgetView, GlobalVariableView } from "@orb/contracts/automation";
