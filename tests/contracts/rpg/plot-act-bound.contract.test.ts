import { rpgPlotSchema, updateSceneArgsSchema } from "@orb/contracts/rpg";
import { expect, test } from "@orb/testkit/node";

// The stated maximum, pinned here so a change to the bound is a deliberate edit in two places.
const RPG_PLOT_ACTS_MAX = 100;

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
