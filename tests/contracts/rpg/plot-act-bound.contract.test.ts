import { rpgPlotSchema, updateSceneArgsSchema } from "@orb/contracts/rpg";
import { expect, test } from "@orb/testkit/node";
import { RPG_PLOT_ACTS_MAX } from "#contracts/rpg/snapshot.ts";

// The stored plot and the model's patch read one maximum, so a plot the model can write is a plot the read accepts.
test("the stored plot and the scene patch both stop at the plot act maximum", () => {
  expect(rpgPlotSchema.safeParse({ act: RPG_PLOT_ACTS_MAX }).success).toBe(true);
  expect(rpgPlotSchema.safeParse({ act: RPG_PLOT_ACTS_MAX + 1 }).success).toBe(false);
  expect(updateSceneArgsSchema.safeParse({ plot: { act: RPG_PLOT_ACTS_MAX } }).success).toBe(true);
  expect(updateSceneArgsSchema.safeParse({ plot: { act: RPG_PLOT_ACTS_MAX + 1 } }).success).toBe(false);
});

test("a stored plot holds no more acts than the maximum", () => {
  const acts = (count: number): { title: string; summary: string }[] => Array.from({ length: count }, () => ({ title: "", summary: "" }));
  expect(rpgPlotSchema.safeParse({ act: 1, acts: acts(RPG_PLOT_ACTS_MAX) }).success).toBe(true);
  expect(rpgPlotSchema.safeParse({ act: 1, acts: acts(RPG_PLOT_ACTS_MAX + 1) }).success).toBe(false);
});
