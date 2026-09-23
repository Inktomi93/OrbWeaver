// domain/automation/contract/views — the read-models the global-variable verbs return.
// `GlobalVariableView` crosses the server↔client boundary (the settings page reads it), so its ONE home is
// `@orb/contracts/automation`. This slot RE-EXPORTS — never re-declares (a second home the client could
// disagree with; the resolve enforces single-home).

export type { GlobalVariableView } from "@orb/contracts/automation";
