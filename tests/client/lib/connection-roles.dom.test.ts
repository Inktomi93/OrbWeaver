import { ROLE_ROWS_ORDERED, roleRequirementVerdicts } from "@orb/client/lib";
import { bindingTaskOf, GENERATION_FLOOR, ROUTABLE_TASKS, TASKS, taskDef } from "@orb/contracts/inference";
import { expect, test } from "@orb/testkit/node";

test("authored role rails cover each actual task requirement without hiding the agent-only tools exception", () => {
  expect(ROLE_ROWS_ORDERED.map(({ task }) => task).toSorted()).toEqual(ROUTABLE_TASKS.toSorted());
  expect(taskDef("agent").requires).toEqual({ tools: true });
  expect(bindingTaskOf("agent")).toBe("chat");
  for (const task of TASKS) {
    if (task === "agent") {
      continue;
    }
    const row = ROLE_ROWS_ORDERED.find((candidate) => candidate.task === bindingTaskOf(task));
    if (row === undefined) {
      throw new Error(`No role row for ${task}`);
    }
    const clauses = row.requirements.map(({ requires }) => requires);
    for (const [axis, value] of Object.entries(taskDef(task).requires ?? {})) {
      expect(clauses, `${task}.${axis} has no authored requirement warning`).toEqual(expect.arrayContaining([expect.objectContaining({ [axis]: value })]));
    }
  }
});

test("the actual utility rail distinguishes supported prose from unavailable structured extraction and captions", () => {
  const utility = ROLE_ROWS_ORDERED.find(({ task }) => task === "summarize");
  if (utility === undefined) {
    throw new Error("No utility role row");
  }
  const textOnly = roleRequirementVerdicts(utility, { kind: "generation", generation: GENERATION_FLOOR });
  expect(textOnly.map(({ met }) => met)).toEqual([true, false, false]);
  expect(textOnly.filter(({ met }) => met === false).every(({ unmet }) => unmet.length > 0)).toBe(true);
  const capable = roleRequirementVerdicts(utility, {
    kind: "generation",
    generation: { ...GENERATION_FLOOR, input: ["text", "image"], output: { ...GENERATION_FLOOR.output, structured: true } },
  });
  expect(capable.map(({ met }) => met)).toEqual([true, true, true]);
});
