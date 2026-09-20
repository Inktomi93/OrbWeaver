// A `ConnectionRef` is a bare branded connection id — NOTHING ELSE. No per-use model override (struck: the
// model has ONE home, `user_connections.model`; "the connection IS the pick"), no `{ builtin }` union arm
// (the local-light floor is two SEEDED rows, §7.2). Every actor's refs are `connection_bindings` ROWS keyed
// `(actorKind, actor, task)`; a chat is NOT an actor (F20) and neither is an rpg game.

import type { UserConnectionId } from "@orb/kit/ids";
import { ID_PREFIX, typeIdSchema } from "@orb/kit/ids";
import { z } from "zod";

export interface ConnectionRef {
  readonly connectionId: UserConnectionId;
}

export const connectionRefSchema = z.object({ connectionId: typeIdSchema(ID_PREFIX.userConnection) });

/** The actor kinds a binding row may carry — ALL per-user: `user` (that user's defaults per task, replacing
 *  the settings blob's `roleDefaults` leaves), `automation-rule` (the rule's AUTHOR picks a row for it),
 *  `plugin-grant` (the installing user grants the plugin a row per task; a plugin never inherits a user's
 *  defaults silently). An agent principal is a future kind when D60 builds it. */
export const BINDING_ACTOR_KINDS = ["user", "automation-rule", "plugin-grant"] as const;
export type BindingActorKind = (typeof BINDING_ACTOR_KINDS)[number];
export const bindingActorKindSchema = z.enum(BINDING_ACTOR_KINDS);
