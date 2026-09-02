// THE STORY-SHOT FAMILY (#1201) — the planted-control proof that a CT/e2e screenshot cannot rewrite a
// FINISHED instrument run's evidence.
//
// WHY A CONTROL AND NOT JUST A STRING ASSERTION: the claim under test is about the FILESYSTEM, not about a
// path's spelling — "writing to a published alias follows the symlink into the slot". The control performs
// exactly that write against a real published pointer and reads the slot afterwards, so the assertion below
// rests on measured behaviour rather than on POSIX folklore.
import { lstatSync, mkdirSync, mkdtempSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "vitest";
import { STORY_SHOT_DIR, storyShot } from "./story-shot.ts";

/** Every `reports/` family that publishes `latest` POINTERS (#1029/#1164). A story shot landing in one of
 *  these is the defect: the write follows the alias into whichever run it names. */
const POINTER_FAMILIES = ["reports/snaps", "reports/traces", "reports/baselines", "reports/design-audit", "reports/perf-meter", "reports/recordings"];

test("a story shot lands in the pointer-free ct-shots family, whatever spelling the call site used", () => {
  expect(storyShot("tracker-kit-scene")).toBe("reports/ct-shots/tracker-kit-scene.png");
  expect(storyShot("tracker-kit-scene.png")).toBe("reports/ct-shots/tracker-kit-scene.png");
  // The load-bearing half: never a published-pointer family, no matter the name — including the one that
  // collided live (a snap retention keeper is also called tracker-kit-scene).
  for (const family of POINTER_FAMILIES) {
    expect(storyShot("tracker-kit-scene").startsWith(`${family}/`)).toBe(false);
  }
  expect(STORY_SHOT_DIR).toBe("reports/ct-shots");
});

test("PLANTED CONTROL: writing to a PUBLISHED alias rewrites the finished run's slot, invisibly", () => {
  const dir = mkdtempSync(join(tmpdir(), "orb-story-shot-"));
  const slot = join(dir, "runs", "snap", "run-A");
  mkdirSync(slot, { recursive: true });
  mkdirSync(join(dir, "snaps"), { recursive: true });
  writeFileSync(join(slot, "tracker-kit-scene.png"), "FINISHED-RUN-PIXELS");
  // The layout a finished snap run leaves: a relative symlink from the family into its slot.
  symlinkSync("../runs/snap/run-A/tracker-kit-scene.png", join(dir, "snaps", "tracker-kit-scene.png"));

  // What `page.screenshot({ path })` does — an ordinary write at the named path.
  writeFileSync(join(dir, "snaps", "tracker-kit-scene.png"), "CT-STORY-PIXELS");

  // The finished run's evidence is GONE, and the pointer still looks like an untouched symlink: nothing at
  // the alias tells a reader that the run under it was rewritten by an unrelated suite.
  expect(readFileSync(join(slot, "tracker-kit-scene.png"), "utf8")).toBe("CT-STORY-PIXELS");
  expect(lstatSync(join(dir, "snaps", "tracker-kit-scene.png")).isSymbolicLink()).toBe(true);

  // The same write through the story-shot family cannot do that — the family holds no aliases, so there is
  // no link to follow. (Asserted as the path contract; the fs half above is what makes it load-bearing.)
  expect(storyShot("tracker-kit-scene").startsWith("reports/snaps/")).toBe(false);
});
