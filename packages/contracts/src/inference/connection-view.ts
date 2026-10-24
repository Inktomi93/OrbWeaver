// The secret-free connection row enriched for the Connections pane and its tRPC output boundary.
import { ID_PREFIX, typeIdSchema } from "@orb/kit/ids";
import { z } from "zod";
import { connectionBindingSchema, userConnectionSchema } from "./connection.ts";
import { resolvedConnectionViewSchema, unavailableCauseSchema } from "./resolved.ts";
import { routableTaskSchema, taskSchema } from "./tasks.ts";

export const connectionViewSchema = userConnectionSchema.extend({ providerLabel: z.string(), tasks: z.array(taskSchema).readonly() }).strict();
export type ConnectionView = z.output<typeof connectionViewSchema>;

/**
 * One Model-roles row: the actor's binding for a task AND what a turn resolves to against the persisted read.
 * One view per routable task, bound or not; `unavailableCause` is the closed cause union the pane turns into a sentence.
 */
export const bindingViewSchema = z.strictObject({
  task: routableTaskSchema,
  binding: connectionBindingSchema.nullable(),
  resolved: resolvedConnectionViewSchema.nullable(),
  unavailableCause: unavailableCauseSchema.nullable(),
});
export type BindingView = z.output<typeof bindingViewSchema>;

/** The actor a binding belongs to, from the caller's side; absent means the caller's own `user` bindings. */
export const bindingActorSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("automation-rule"), ruleId: typeIdSchema(ID_PREFIX.automationRule) }),
  z.object({ kind: z.literal("plugin-grant"), pluginId: typeIdSchema(ID_PREFIX.plugin) }),
]);
export const listBindingsInputSchema = z.object({ actor: bindingActorSchema.optional() }).optional();
