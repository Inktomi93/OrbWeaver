// The agent child-env baseline is read fresh from this process's environment on every call and handed out as a copy:
// after the boot's secret scrub no app secret is in it, and a caller editing it never edits the server's environment.
// Each case starts a fresh node process, because the scrub deletes from the process environment.
// @subject packages/server/src/foundation/env/index.ts
import { spawnSync } from "node:child_process";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { ENV_NO_FILE_KEY } from "@orb/kit/env-file";
import { expect, test } from "@orb/testkit/node";
import { z } from "zod";

const CHILD = fileURLToPath(new URL("../../../support/node/host-env-child.ts", import.meta.url));
const SECRET = "SESSION_SECRET";
const MARKER = "ORB_HOST_ENV_MARKER";
const presenceSchema = z.strictObject({ secret: z.boolean(), marker: z.boolean() });
const reportSchema = z.strictObject({ held: presenceSchema, edited: z.boolean(), markerAfterEdit: z.boolean(), afterScrub: presenceSchema });

test("the baseline drops an app secret once the boot scrubs it, keeps the host's own variables, and is a copy", ({ importStagingDir }) => {
  const child = spawnSync(process.execPath, [CHILD, SECRET, MARKER], {
    cwd: importStagingDir,
    env: { [SECRET]: "ef".repeat(32), [MARKER]: "present", [ENV_NO_FILE_KEY]: "1" },
    encoding: "utf8",
  });
  const report = reportSchema.parse(JSON.parse(child.stdout));

  // Control: before the scrub the baseline holds both, so the later absence is the scrub's doing.
  expect(report.held).toEqual({ secret: true, marker: true });
  expect(report.edited).toBe(true);
  expect(report.markerAfterEdit).toBe(true);
  expect(report.afterScrub).toEqual({ secret: false, marker: true });
});
