import { recordRetirement } from "../../../tooling/src/screen-record/index.ts";
import { expect, test } from "../../support/tool-fixtures.ts";

test("the retired command returns an exact Snap filmstrip recipe without opening a browser", () => {
  expect(recordRetirement(["/chats", "--click", "[data-x=1]", "--settle", "900"])).toEqual({
    errors: [],
    recipe: "pnpm snap /chats --click '[data-x=1]' --pause 900 --filmstrip",
  });
});

test("legacy frame timing is discarded and unsupported dialects fail loud", () => {
  expect(recordRetirement(["--frames", "700", "--fps", "30"])).toEqual({
    errors: ["unsupported retired Record flag --fps"],
    recipe: "pnpm snap 30 --filmstrip",
  });
});

test("help points at Snap rather than preserving a second vocabulary", () => {
  expect(recordRetirement(["--help"])).toEqual({
    errors: [],
    recipe: "pnpm snap --help",
  });
});
