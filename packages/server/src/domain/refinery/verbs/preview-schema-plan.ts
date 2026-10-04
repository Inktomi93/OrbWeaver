// verb: previewSchemaPlan — what the caller's bound Utility model would do with a draft schema, before any run uses
// it. The draft goes through the same belt and projection a run sends (`test-schema.ts`), so the plan judges the bytes
// a refinery call would carry. A draft the belt refuses has no plan: the editor shows that refusal itself.

import { refinerySchemaDocumentSchema } from "@orb/contracts/refinery";
import { liftJsonSchema, projectJsonSchema } from "@orb/kit/json-schema";
import type { RefineryContext } from "../context.ts";
import type { RefineryService } from "../contract/service.ts";

export function createPreviewSchemaPlan(ctx: RefineryContext): RefineryService["previewSchemaPlan"] {
  return async ({ principal, schema, stage }) => {
    const doc = refinerySchemaDocumentSchema.safeParse({ name: "draft_preview", description: "", stage, schema });
    if (!doc.success) {
      return null;
    }
    return await ctx.planSchema(principal.userId, projectJsonSchema(liftJsonSchema(doc.data.schema)));
  };
}
