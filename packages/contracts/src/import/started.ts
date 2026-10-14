import { ID_PREFIX, typeIdSchema } from "@orb/kit/ids";
import { z } from "zod";

export const importStartedSchema = z.strictObject({ workloadId: typeIdSchema(ID_PREFIX.workload) });
export type ImportStarted = z.infer<typeof importStartedSchema>;
