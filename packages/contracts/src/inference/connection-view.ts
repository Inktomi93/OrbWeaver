// The secret-free connection row enriched for the Connections pane and its tRPC output boundary.
import { z } from "zod";
import { userConnectionSchema } from "./connection.ts";
import { taskSchema } from "./tasks.ts";

export const connectionViewSchema = userConnectionSchema.extend({ providerLabel: z.string(), tasks: z.array(taskSchema).readonly() }).strict();
export type ConnectionView = z.output<typeof connectionViewSchema>;
