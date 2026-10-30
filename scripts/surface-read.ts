import { readFile } from "node:fs/promises";
import { dirname, extname, resolve } from "node:path";
import process from "node:process";
import { parseArgs } from "node:util";
import { assertSurfaceRunOutput } from "@orb/testkit/node/helpers";
import { runTool, UsageError } from "@orb/tooling/floor/cli/run-tool";

await runTool(async () => {
  const { values } = parseArgs({ options: { file: { type: "string" }, "file-base64": { type: "string" } } });
  if ((values.file === undefined) === (values["file-base64"] === undefined)) {
    throw new UsageError("Select exactly one --file or encoded --file-base64 artifact path");
  }
  const file = resolve(values.file ?? Buffer.from(values["file-base64"] ?? "", "base64url").toString("utf8"));
  await assertSurfaceRunOutput(dirname(file), file);
  if (![".md", ".json", ".jsonl", ".txt", ".log"].includes(extname(file))) {
    throw new UsageError("The agent reader prints complete text artifacts; image and trace paths remain in the native result");
  }
  process.stdout.write(await readFile(file, "utf8"));
  return 0;
});
