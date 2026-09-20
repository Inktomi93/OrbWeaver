// contracts/inference/tasks — the TASK axis. `RoutableTask` is DERIVED from the rows' `routable` flags and
// is the only legal `connection_bindings.task` value, so the derivations are what a regression breaks:
// `ROUTABLE_TASKS` and `routableTaskSchema` must agree (they are two readers of one flag), every
// NON-routable task must name a `ridesOn` that is itself routable AND of the same KIND (a task riding a
// binding of a different kind would resolve to a model that cannot serve it), and the vector tasks must stay
// `scope: "owner"` — an owner has ONE embedding space, so a rule's or a plugin's ref must not be able to
// re-point it and silently split the corpus across two spaces.

import {
  bindingTaskOf,
  EMBED_SPACE_DIMS,
  isRoutableTask,
  LOCAL_LIGHT_SEED_ROWS,
  ROUTABLE_TASKS,
  routableTaskSchema,
  TASK_DEFS,
  TASKS,
  taskDef,
} from "@orb/contracts/inference";
import { expect, test } from "../../support/fixtures.ts";

test("`ROUTABLE_TASKS`, the schema and the predicate are three readers of ONE flag", () => {
  for (const task of TASKS) {
    const routable = TASK_DEFS[task].routable;
    expect(isRoutableTask(task)).toBe(routable);
    expect(routableTaskSchema.safeParse(task).success, `${task} routable=${String(routable)}`).toBe(routable);
    expect(ROUTABLE_TASKS.includes(task as (typeof ROUTABLE_TASKS)[number])).toBe(routable);
  }
});

test("every NON-routable task rides a routable binding OF THE SAME KIND", () => {
  const nonRoutable = TASKS.filter((task) => !isRoutableTask(task));
  expect(nonRoutable.length, "the pin is vacuous if every task is routable").toBeGreaterThan(0);
  for (const task of nonRoutable) {
    const rides = bindingTaskOf(task);
    expect(isRoutableTask(rides), `${task} rides ${rides}, which must itself be routable`).toBe(true);
    expect(taskDef(rides).kind, `${task} and its host binding must want the same kind of model`).toBe(taskDef(task).kind);
  }
});

test("`bindingTaskOf` is the identity on a routable task", () => {
  for (const task of ROUTABLE_TASKS) {
    expect(bindingTaskOf(task)).toBe(task);
  }
});

test("the vector tasks are OWNER-scoped — one embedding space per owner, not per actor", () => {
  for (const task of ["embed", "imageEmbed"] as const) {
    expect(taskDef(task).scope, `${task} must ignore a rule's or a plugin's ref`).toBe("owner");
    expect(taskDef(task).requires?.dims, "admission into the owner's space is a task requirement").toBe(EMBED_SPACE_DIMS);
  }
  expect(taskDef("chat").scope, "a chat turn runs under the ACTOR's pick").toBe("actor");
});

test("the unattended tasks are `spend: background` — the flag `canFund` gates", () => {
  expect(taskDef("summarize").spend).toBe("background");
  expect(taskDef("embed").spend).toBe("background");
  expect(taskDef("chat").spend, "a send the human is watching is foreground").toBe("foreground");
});

test("the local-light SEED rows name routable tasks of the kind their model actually is", () => {
  for (const seed of LOCAL_LIGHT_SEED_ROWS) {
    expect(isRoutableTask(seed.task), `${seed.task} must be bindable for the seed to write it`).toBe(true);
    expect(taskDef(seed.task).kind).not.toBe("generation");
  }
  expect(LOCAL_LIGHT_SEED_ROWS.map((row) => row.task)).toEqual(["embed", "rerank"]);
});
