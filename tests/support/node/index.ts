// The vitest door: `test`, `expect` and the fixtures, plus helpers that need vitest's suite at import. Only vitest files import it.

export type { AppCaller, Fixtures } from "./fixtures.ts";
export { expect, test } from "./fixtures.ts";
export type { AuditRuleProof, RelationalPopulationReport } from "./ui-audit-relational.ts";
export { AUDIT_ARGV, auditReport, findingSelectors, RELATIONAL_CLI_TIMEOUT_MS, relationalDocument, stateTwin } from "./ui-audit-relational.ts";
