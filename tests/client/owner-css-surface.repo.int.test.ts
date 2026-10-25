import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@orb/testkit/node";
import { compile } from "tailwindcss";
import { COMPUTED_SLOTS, OWNER_CSS_SURFACE_PATHS, readOwnerCssSources, renderOwnerCssSurface } from "../../packages/client/owner-css-surface.build.ts";
import { OWNER_CSS_SHELL_CLASSES, OWNER_CSS_SLOTS, OWNER_CSS_THEME_SCOPE_VARS, OWNER_CSS_TOKEN_VARS } from "../../packages/client/owner-css-surface.ts";

const REPO_ROOT = fileURLToPath(new URL("../..", import.meta.url));
const THEME_CSS = join(REPO_ROOT, "packages/ui/src/styles/theme.css");
const PRIMITIVE_PREFIX = "--primitive-";

const live = readOwnerCssSources(REPO_ROOT);

test("the committed manifest is the one the live sources render", () => {
  expect(readFileSync(join(REPO_ROOT, OWNER_CSS_SURFACE_PATHS.manifest), "utf8")).toBe(renderOwnerCssSurface(live));
});

test("a planted slot rename and a planted shell-class rename each change the manifest", () => {
  const slot = OWNER_CSS_SLOTS[0];
  const shellClass = OWNER_CSS_SHELL_CLASSES[0];
  const renamedSlot = renderOwnerCssSurface({
    ...live,
    sources: live.sources.map((source) => ({ ...source, text: source.text.replaceAll(`data-slot="${slot}"`, 'data-slot="planted-rename"') })),
  });
  expect(renamedSlot).toContain('"planted-rename"');
  expect(renamedSlot).not.toContain(`"${slot}"`);
  const renamedClass = renderOwnerCssSurface({ ...live, shellCss: live.shellCss.replaceAll(`.${shellClass}`, ".shell-planted-rename") });
  expect(renamedClass).toContain('"shell-planted-rename"');
  expect(renamedClass).not.toContain(`"${shellClass}"`);
});

test("every runtime-built slot name is spelled at the site that builds it", () => {
  for (const { name, site, fragment } of COMPUTED_SLOTS) {
    expect(OWNER_CSS_SLOTS).toContain(name);
    expect(readFileSync(join(REPO_ROOT, site), "utf8"), `${site} builds ${name}`).toContain(fragment);
  }
});

test("theme.css serves every manifest token variable and no ramp primitive", async () => {
  const served = (await compile(readFileSync(THEME_CSS, "utf8"))).build([]);
  const declared = new Set([...served.matchAll(/(--[a-z0-9-]+):/gu)].flatMap((match) => (match[1] === undefined ? [] : [match[1]])));
  expect(OWNER_CSS_TOKEN_VARS.length).toBeGreaterThan(0);
  expect(OWNER_CSS_TOKEN_VARS.filter((cssVar) => !declared.has(cssVar))).toEqual([]);
  expect([...declared].filter((cssVar) => cssVar.startsWith(PRIMITIVE_PREFIX))).toEqual([]);
  expect(OWNER_CSS_THEME_SCOPE_VARS.filter((cssVar) => !declared.has(cssVar))).toEqual([]);
});
