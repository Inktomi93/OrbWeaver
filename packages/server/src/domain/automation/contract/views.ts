// `GlobalVariableView` is the shared server projection for persistence, CEL environment construction and
// rule tests. Its ONE existing home is `@orb/contracts/automation`; this slot re-exports it instead of
// declaring a second shape. No tRPC procedure or client reads it.

export type { GlobalVariableView } from "@orb/contracts/automation";
