// The shared ambient map is the only backend the production shell needs on mount: routeTrpc refuses any procedure it omits.
import { expect, test } from "../node/ct-corpus.ts";
import { createShellAmbientReads, SHELL_AMBIENT_PATHS } from "../node/ct-shell-reads.ts";
import { routeTrpc } from "../node/route-trpc.ts";
import type { ShellAmbientStory } from "./ct-shell-reads-stories.tsx";

test("the production shell mounts on the shared ambient reads alone and renders its rail", async ({ corpus, mount, page }) => {
  const trpc = await routeTrpc(page, createShellAmbientReads(corpus));
  await mount<typeof ShellAmbientStory>("tests/support/browser/ct-shell-reads-stories/ShellAmbientStory", {});
  const rail = page.getByRole("navigation", { name: "Primary", exact: true });
  await expect(rail).toBeVisible();
  await expect(rail.getByRole("button").first()).toBeVisible();
  // Every entry is something the shell really asks for, so the map holds no read the shell never issues.
  await expect.poll(() => SHELL_AMBIENT_PATHS.filter((path) => trpc.count(path) === 0)).toEqual([]);
});
