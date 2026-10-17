// CSS lint has no compiler world. Native parser/configuration failures are not violation verdicts.
import { realpathSync, statSync } from "node:fs";
import { resolve, sep } from "node:path";
import process from "node:process";
import { isWithinRoot } from "@orb/kit/path-containment";
import { refuseDirectInvocation } from "@orb/tooling/floor/cli/entrypoint";
import { EXIT } from "@orb/tooling/floor/cli/exit-contract";
import { UsageError } from "@orb/tooling/floor/cli/run-tool";
import { assertRepoPath } from "@orb/tooling/floor/compiler/authored-repository";
import { CSS_SOURCE_GLOBS, CSS_SOURCE_ROOTS, PRODUCT_STYLESHEETS, STYLELINT_CONFIG_PATH } from "../contract/css-family.ts";

refuseDirectInvocation(import.meta.url, "pnpm lint:css");

/** Whole product CSS or explicit existing source paths, without semantic extraction. */
export async function runStylelint(root: string, paths: readonly string[] = []): Promise<number> {
  const canonicalRoot = realpathSync(root);
  for (const path of paths) {
    if (path.startsWith("-") || !path.endsWith(".css") || !CSS_SOURCE_ROOTS.some((prefix) => path.startsWith(prefix))) {
      throw new UsageError(`stylelint takes product CSS paths only: ${JSON.stringify(path)}`);
    }
    assertRepoPath(path, "CSS input");
  }
  for (const path of new Set([...PRODUCT_STYLESHEETS, ...paths])) {
    const absolute = resolve(root, path);
    if (!(statSync(absolute).isFile() && isWithinRoot(canonicalRoot, realpathSync(absolute), { sep }))) {
      throw new Error(`CSS input is not a repository file: ${path}`);
    }
  }
  const { default: stylelint } = await import("stylelint");
  const result = await stylelint.lint({
    cwd: root,
    configFile: resolve(root, STYLELINT_CONFIG_PATH),
    files: paths.length === 0 ? [...CSS_SOURCE_GLOBS] : [...paths],
    formatter: "string",
    maxWarnings: 0,
    allowEmptyInput: false,
  });
  if (result.results.length === 0 || result.results.some((row) => row.ignored === true)) {
    throw new Error("Stylelint measured an empty or ignored CSS subject; no verdict is available");
  }
  process.stdout.write(`[stylelint] ${String(result.results.length)} CSS file(s)\n${result.report}`);
  if (
    result.results.some(
      (row) =>
        row.parseErrors.length > 0 ||
        row.invalidOptionWarnings.length > 0 ||
        row.warnings.some((warning) => warning.rule === "CssSyntaxError" || warning.text.startsWith("Unknown rule ")),
    )
  ) {
    return EXIT.toolError;
  }
  return result.errored || result.maxWarningsExceeded !== undefined ? EXIT.violations : EXIT.clean;
}
