// @subject packages/server/src/foundation/observability/audit.ts
import type { IdSource } from "@orb/kit/ids";
import type { createAuditWiring, logAudit } from "@orb/server/foundation/observability";
import { expectTypeOf, test } from "vitest";

test("the audit writers require their id source, so a direct audit row never takes an ambient id", () => {
  expectTypeOf<Parameters<typeof createAuditWiring>>().toEqualTypeOf<Required<Parameters<typeof createAuditWiring>>>();
  expectTypeOf<Parameters<typeof createAuditWiring>[1]>().toEqualTypeOf<IdSource>();
  expectTypeOf<Parameters<typeof logAudit>>().toEqualTypeOf<Required<Parameters<typeof logAudit>>>();
  expectTypeOf<Parameters<typeof logAudit>[3]>().toEqualTypeOf<IdSource>();
});
