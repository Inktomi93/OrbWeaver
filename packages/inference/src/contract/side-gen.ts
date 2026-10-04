// The side-generation vocabulary: what the fold in `funnel/resolve-side-gen.ts` reads and returns, and the posture a
// chat request carries into the one reasoning resolver (`funnel/resolve-chat.ts`).

import type { Task } from "@orb/contracts/inference";
import type { RolePresetParams } from "@orb/contracts/preset";

/** A role's preset params, a task posture, or the folded result: only the fields a non-chat role takes from a
 *  preset (`ROLE_PRESET_FIELDS`). Each optional; absent means the next source or the runner default stands. */
export type SideGenSampling = RolePresetParams;

/** How a chat request's reasoning resolves. `chat` is a delivered turn. `side-gen` is a summarize or structured
 *  item: reasoning is off unless the role preset states an effort or a budget, and the output cap grows by the
 *  room reasoning that runs may take. */
export const CHAT_POSTURES = ["chat", "side-gen"] as const;
export type ChatPosture = (typeof CHAT_POSTURES)[number];

/** The tasks whose items run as side-generation chat turns (`roles/side-gen.ts`). */
const SIDE_GEN_TASKS: ReadonlySet<Task> = new Set<Task>(["summarize", "structured"]);

/** The posture a task's chat turn runs under, so a readout of a role resolves as that role's turn does. */
export function postureOfTask(task: Task): ChatPosture {
  return SIDE_GEN_TASKS.has(task) ? "side-gen" : "chat";
}
