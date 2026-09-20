// The TASK axis — what a caller asks the runtime for, NAMED AT THE CALL SITE (never guessed from an
// option). Routable tasks are the Connections pane's Model-roles slots and the only legal
// `connection_bindings.task` values; a non-routable task RIDES another task's binding (`ridesOn`).
//
// The tuple's ORDER IS ARBITRARY. The client owns its render order — a contract tuple is not a UI decision.
//
// `scope: "owner"` marks the vector-space tasks: an owner has ONE embedding space, so the actor fold
// ignores a rule's or a plugin's ref for them. `spend: "background"` marks the tasks that run unattended,
// which a connection funds only when its `allowBackground` flag is on (F5).

import { z } from "zod";
import type { ModelKind } from "./kinds.ts";
import type { Modality } from "./modalities.ts";

export const TASKS = ["chat", "agent", "summarize", "structured", "generateImage", "embed", "imageEmbed", "rerank"] as const;
export type Task = (typeof TASKS)[number];

/** What a task DEMANDS of the connection it resolves to, spelled in capability vocabulary. Checked by
 *  `requirementMet` at resolve (a `{ ok: false, missing }` result, never a throw) and by the picker. */
export interface CapabilityRequirement {
  readonly input?: readonly Modality[] | undefined;
  readonly output?: readonly Modality[] | undefined;
  readonly tools?: boolean | undefined;
  readonly structured?: boolean | undefined;
  /** The vector width the owner's space admits (`embed`/`imageEmbed`). */
  readonly dims?: number | undefined;
}

export interface TaskDef {
  readonly kind: ModelKind;
  readonly requires?: CapabilityRequirement | undefined;
  readonly scope: "actor" | "owner";
  readonly spend: "foreground" | "background";
  readonly routable: boolean;
  /** A non-routable task resolves through this task's binding. */
  readonly ridesOn?: Task | undefined;
}

/** The deployment's vector width — `F32_BLOB(1024)` never changes, so admission is a task requirement. */
export const EMBED_SPACE_DIMS = 1024;

/** The two rows every user is SEEDED with (§7.2 — the vector floor is a convenience seed, never a special
 *  row): the local-light encoder and reranker, both ordinary `user_connections` on the `local-light`
 *  provider with a `user` binding for `embed` / `rerank`. The ids are the curated `local-light` rows'. */
export const LOCAL_LIGHT_SEED_ROWS = [
  { task: "embed", model: "jinaai/jina-clip-v2", label: "local-light · encoder" },
  { task: "rerank", model: "Xenova/ms-marco-MiniLM-L-6-v2", label: "local-light · reranker" },
] as const;

// `as const satisfies` (not a `Record<Task, TaskDef>` annotation): the literal `routable` flags must
// survive so `RoutableTask` can be DERIVED from the rows rather than spelled twice.
export const TASK_DEFS = {
  chat: { kind: "generation", scope: "actor", spend: "foreground", routable: true },
  // `agent` is served only by the `agent-sdk` wire and rides the chat binding (F4: not routable today;
  // nothing routes it — `ROUTING_ROLE_KEYS` never had it).
  agent: { kind: "generation", requires: { tools: true }, scope: "actor", spend: "foreground", routable: false, ridesOn: "chat" },
  summarize: { kind: "generation", scope: "actor", spend: "background", routable: true },
  // The one-shot schema-constrained primitive (owner ruling 2026-07-27) — its OWN task on the wire, riding
  // the summarize binding in the pane (F4: one Utility slot, three requirement badges).
  structured: { kind: "generation", requires: { structured: true }, scope: "actor", spend: "background", routable: false, ridesOn: "summarize" },
  generateImage: { kind: "generation", requires: { output: ["image"] }, scope: "actor", spend: "foreground", routable: true },
  embed: { kind: "embedding", requires: { dims: EMBED_SPACE_DIMS }, scope: "owner", spend: "background", routable: true },
  imageEmbed: { kind: "embedding", requires: { input: ["image"], dims: EMBED_SPACE_DIMS }, scope: "owner", spend: "background", routable: true },
  rerank: { kind: "rerank", scope: "owner", spend: "background", routable: true },
} as const satisfies Record<Task, TaskDef>;

/** The row as its TYPE (the `as const` literal union has no `requires` on the rows that state none). */
export function taskDef(task: Task): TaskDef {
  return TASK_DEFS[task];
}

/** The tasks a `connection_bindings` row may name — derived from `TASK_DEFS`, never a second list. */
export type RoutableTask = { [T in Task]: (typeof TASK_DEFS)[T]["routable"] extends true ? T : never }[Task];
export const ROUTABLE_TASKS: readonly RoutableTask[] = TASKS.filter((task): task is RoutableTask => TASK_DEFS[task].routable);

const ROUTABLE_TASK_SET: ReadonlySet<string> = new Set<string>(ROUTABLE_TASKS);

export const routableTaskSchema = z.enum(ROUTABLE_TASKS as unknown as readonly [RoutableTask, ...RoutableTask[]]);

export function isRoutableTask(task: Task): task is RoutableTask {
  return ROUTABLE_TASK_SET.has(task);
}

/** The binding a task resolves through: itself when routable, else the task it rides. Total by
 *  construction — every non-routable row names its `ridesOn`, pinned by the table test. */
export function bindingTaskOf(task: Task): RoutableTask {
  if (isRoutableTask(task)) {
    return task;
  }
  const def: TaskDef = TASK_DEFS[task];
  const rides = def.ridesOn;
  if (rides === undefined || !isRoutableTask(rides)) {
    throw new Error(`TASK_DEFS.${task} is not routable and names no routable ridesOn`);
  }
  return rides;
}

/** Every task of one kind — what a connection on a model of that kind can serve at most. */
export function tasksOfKind(kind: ModelKind): readonly Task[] {
  return TASKS.filter((task) => TASK_DEFS[task].kind === kind);
}
