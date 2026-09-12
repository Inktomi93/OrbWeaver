// The probe-kit artifact NAMING contract (tooling/src/_shared/artifacts.ts). Home per Spine-Testing §2:
// a test of a scripts/ tool lives in tests/tooling/.
//
// THE DEFECT THIS PINS (2026-08-17, issue #148 item 2): `snap --out /abs/path/sf-fixed.png` wrote
// `reports/snaps/abs/path/sf-fixed.png.png` — joined under the reports dir AND re-suffixed — and still
// exited 0, so the caller believed the file it had named existed. Bare names were fine, which is why it
// survived so long: only a lane pasting a path from its own scratch dir ever hit it.
import { isAbsolute, join } from "node:path";
import process from "node:process";
import { artifactFilePath, artifactKey, isOutPath, routeSlug } from "@orb/tooling/_shared/artifact-naming";
import { variantOut } from "../../../tooling/src/snap/index.ts";
import { expect, test } from "../../support/tool-fixtures.ts";

const SNAPS = "/repo/reports/snaps";

test("a bare --out name still files under reports/<kind>/ — the old contract, byte for byte", () => {
  expect(artifactFilePath(SNAPS, "right-drawer", ".png")).toBe(join(SNAPS, "right-drawer.png"));
  expect(artifactFilePath(SNAPS, "right-drawer", ".json")).toBe(join(SNAPS, "right-drawer.json"));
  expect(artifactFilePath(SNAPS, routeSlug("/chats/abc"), ".png")).toBe(join(SNAPS, "chats_abc.png"));
});

test("an ABSOLUTE --out lands exactly where it was named, with no double join and no double extension", () => {
  expect(artifactFilePath(SNAPS, "/tmp/lane/sf-fixed.png", ".png")).toBe("/tmp/lane/sf-fixed.png");
  // The manifest is the shot's sibling, not sf-fixed.png.json.
  expect(artifactFilePath(SNAPS, "/tmp/lane/sf-fixed.png", ".json")).toBe("/tmp/lane/sf-fixed.json");
});

test("an explicitly-relative --out resolves against the CWD, the way the shell spells it", () => {
  const resolved = artifactFilePath(SNAPS, "./out/shot", ".png");
  expect(isAbsolute(resolved)).toBe(true);
  expect(resolved).toBe(join(process.cwd(), "out", "shot.png"));
  expect(isOutPath("./out/shot")).toBe(true);
  expect(isOutPath("../out/shot")).toBe(true);
  // A bare name with inner directories is still an artifact base — it stays inside reports/<kind>/.
  expect(isOutPath("home/tiles")).toBe(false);
  expect(artifactFilePath(SNAPS, "home/tiles", ".png")).toBe(join(SNAPS, "home/tiles.png"));
});

test("an --out already spelled from the repo root into reports/<kind>/ is not prefixed twice", () => {
  // #209: a lane pasted back the path snap itself had printed and the shot landed at
  // reports/snaps/reports/snaps/<name>.png — exit 0, artifact nowhere near where it was named.
  expect(artifactFilePath(SNAPS, "reports/snaps/lane-shot.png", ".png")).toBe(join(SNAPS, "lane-shot.png"));
  expect(artifactFilePath(SNAPS, "reports/snaps/lane-shot.png", ".json")).toBe(join(SNAPS, "lane-shot.json"));
  // Inner directories under the kind dir survive the pass-through.
  expect(artifactFilePath(SNAPS, "reports/snaps/rail/tile", ".png")).toBe(join(SNAPS, "rail", "tile.png"));
  // Another kind's dir is NOT this kind's dir — it stays a bare base name and keeps the prefix, because
  // silently writing into reports/traces/ from a snaps call would scatter the family.
  expect(artifactFilePath(SNAPS, "reports/traces/lane.png", ".png")).toBe(join(SNAPS, "reports/traces/lane.png"));
  // The key is still the basename, so trace/HAR siblings do not inherit the prefix path.
  expect(artifactKey("reports/snaps/lane-shot.png")).toBe("lane-shot");
});

test("naming an extension the artifact already has never doubles it", () => {
  expect(artifactFilePath(SNAPS, "shot.png", ".png")).toBe(join(SNAPS, "shot.png"));
  expect(artifactFilePath(SNAPS, "report.json", ".json")).toBe(join(SNAPS, "report.json"));
});

test("--matrix suffixes INSIDE the extension, so a path-shaped base stays a .png", () => {
  expect(variantOut("home", "desktop-dark-motion")).toBe("home-desktop-dark-motion");
  expect(variantOut("/tmp/lane/home.png", "desktop-dark-motion")).toBe("/tmp/lane/home-desktop-dark-motion.png");
});

test("kind-dir siblings key off the basename — routing a shot elsewhere never scatters traces", () => {
  // A trace/HAR/baseline is keyed BY NAME and belongs in reports/<kind>/; a path-shaped --out must not
  // re-create the double-join there or drop a trace next to the user's screenshot.
  expect(artifactKey("/tmp/lane/sf-fixed.png")).toBe("sf-fixed");
  expect(artifactKey("./out/shot")).toBe("shot");
  // Identity for the ordinary case.
  expect(artifactKey("right-drawer")).toBe("right-drawer");
});
