// D336: an authored sheet mixes no intent or tone colour by hand; generated sheets are exempt.
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@orb/testkit/tooling";
import stylelint from "stylelint";
import config from "../../stylelint.config.ts";
import { assertStylelintEngineSucceeded } from "./stylelint-result.ts";

const REPO_ROOT = fileURLToPath(new URL("../..", import.meta.url));
const RULE = "orb/no-intent-color-recipe";
const AUTHORED = join(REPO_ROOT, "packages/ui/src/styles/primitives.css");
const GENERATED_THEME = join(REPO_ROOT, "packages/ui/src/styles/theme.css");
const GENERATED_CHANNEL = join(REPO_ROOT, "packages/client/src/styles/appearance-channel.gen.css");

async function hits(body: string, codeFilename = AUTHORED): Promise<number> {
  const code = `@layer ui { .probe { ${body} } }`;
  const { results } = await stylelint.lint({ code, codeFilename, config, configBasedir: REPO_ROOT });
  assertStylelintEngineSucceeded(results);
  return (results[0]?.warnings ?? []).filter(({ rule }) => rule === RULE).length;
}

test.for([
  "background-color: color-mix(in oklab, var(--color-primary) 14%, var(--color-background));",
  "border-color: color-mix(in oklab, var(--color-background), var(--color-destructive) 30%);",
  "color: color-mix(in oklab, var(--color-success-foreground) 80%, transparent);",
  "background-color: color-mix(in oklab, var(--color-tone-solid) 50%, transparent);",
  "background-color: oklch(from var(--color-warning) l c h / 0.4);",
  "box-shadow: 0 0 0 1px rgb(from var(--color-info) r g b / 0.3);",
  "--probe-edge: color-mix(in oklab, var(--color-primary) 22%, var(--color-foreground) 6%);",
])("%s is refused in an authored sheet", async (body) => {
  expect(await hits(body)).toBe(1);
});

test.for([
  "background-color: color-mix(in oklab, var(--color-foreground) 12%, transparent);",
  "background-color: oklch(from var(--color-card) l c h / 0.8);",
  "background-color: var(--color-tone-tint);",
  "border-color: var(--color-primary);",
])("%s is accepted", async (body) => {
  expect(await hits(body)).toBe(0);
});

test("the generated theme and appearance channel are exempt", async () => {
  const body = "background-color: color-mix(in oklab, var(--color-primary) 14%, var(--color-background));";
  expect(await hits(body, GENERATED_THEME)).toBe(0);
  expect(await hits(body, GENERATED_CHANNEL)).toBe(0);
});
