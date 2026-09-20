// Derived policy — THE WHOLE of it; there is no firewall (D39 amended: its reason was that contracts could
// not import the firewall). What the picker may offer is `providerTasks`; what a row may serve is
// `connectionTasks`; whether a task may spend a row unattended is `canFund`; whether the row's model can do
// the job is `requirementMet` (capability/reads). A hand row like `generateImage: ["openrouter"]` is
// reproduced by DATA: openrouter's `serves` is the whole wire set, openai's names `generateImage`, no other
// built-in hosted row does — and the table test pins that the derivation is not wider than the belt it
// replaced.

import type { ModelKind } from "./kinds.ts";
import type { ProviderDef } from "./provider-schema.ts";
import { BUILTIN_PROVIDERS, providerTasks } from "./providers.ts";
import type { Task } from "./tasks.ts";
import { TASK_DEFS, tasksOfKind } from "./tasks.ts";

/** What ONE connection may serve: its provider's tasks ∩ the tasks of its model's kind. */
export function connectionTasks(provider: ProviderDef, kind: ModelKind): readonly Task[] {
  const ofKind = tasksOfKind(kind);
  return providerTasks(provider).filter((task) => ofKind.includes(task));
}

/** The providers whose rows may serve a task — the picker's grouping input. */
export function taskProviders(task: Task, providers: readonly ProviderDef[] = BUILTIN_PROVIDERS): readonly ProviderDef[] {
  return providers.filter((provider) => providerTasks(provider).includes(task));
}

/** A foreground task spends any row; a background task spends a row only when its owner said so (F5).
 *  Checked at BOTH sites: the binding slot refuses inline at bind time, and resolve re-checks because the
 *  flag can flip after the binding is written. */
export function canFund(connection: { readonly allowBackground: boolean }, task: Task): boolean {
  return TASK_DEFS[task].spend === "foreground" || connection.allowBackground;
}
