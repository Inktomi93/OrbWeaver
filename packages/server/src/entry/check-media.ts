// The same required-runtime check runs after installation, before build, and after deployment assembly.
import process from "node:process";
import { verifyMediaRuntime } from "#infra/media/runtime";

try {
  process.stdout.write(`media runtime: ${verifyMediaRuntime()}\n`);
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
