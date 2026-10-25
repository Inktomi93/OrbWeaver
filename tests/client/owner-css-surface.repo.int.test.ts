import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@orb/testkit/node";
import { compile } from "tailwindcss";
import { COMPUTED_SLOTS, OWNER_CSS_SURFACE_PATHS, readOwnerCssSources, renderOwnerCssSurface } from "../../packages/client/owner-css-surface.build.ts";
import {
  OWNER_CSS_SHELL_CLASSES,
  OWNER_CSS_SLOTS,
  OWNER_CSS_SURFACE,
  OWNER_CSS_THEME_SCOPE_VARS,
  OWNER_CSS_TOKEN_VARS,
} from "../../packages/client/owner-css-surface.ts";
import { OWNER_CSS_RENAMES } from "../../packages/client/src/owner-css/renames.ts";

const REPO_ROOT = fileURLToPath(new URL("../..", import.meta.url));
const THEME_CSS = join(REPO_ROOT, "packages/ui/src/styles/theme.css");
const PRIMITIVE_PREFIX = "--primitive-";

const live = readOwnerCssSources(REPO_ROOT);

test("the committed manifest is the one the live sources render", () => {
  expect(readFileSync(join(REPO_ROOT, OWNER_CSS_SURFACE_PATHS.manifest), "utf8")).toBe(renderOwnerCssSurface(live, OWNER_CSS_SURFACE));
});

test("a recorded slot rename and a recorded shell-class rename each change the manifest", () => {
  const slot = OWNER_CSS_SLOTS[0];
  const shellClass = OWNER_CSS_SHELL_CLASSES[0];
  const renamedSlot = renderOwnerCssSurface(
    {
      ...live,
      renames: [{ kind: "slot", name: slot, to: "planted-rename" }],
      sources: live.sources.map((source) => ({ ...source, text: source.text.replaceAll(`data-slot="${slot}"`, 'data-slot="planted-rename"') })),
    },
    OWNER_CSS_SURFACE,
  );
  expect(renamedSlot).toContain('"planted-rename"');
  expect(renamedSlot).not.toContain(`"${slot}",`);
  const renamedClass = renderOwnerCssSurface(
    {
      ...live,
      renames: [{ kind: "shell-class", name: shellClass, to: "shell-planted-rename" }],
      shellCss: live.shellCss.replaceAll(`.${shellClass}`, ".shell-planted-rename"),
    },
    OWNER_CSS_SURFACE,
  );
  expect(renamedClass).toContain('"shell-planted-rename"');
  expect(renamedClass).not.toContain(`"${shellClass}",`);
});

test("a hook that leaves the surface without a rename row stops the regen and is named", () => {
  const slot = OWNER_CSS_SLOTS[0];
  const shellClass = OWNER_CSS_SHELL_CLASSES[0];
  const token = OWNER_CSS_TOKEN_VARS[0];
  const lostSlot = {
    ...live,
    sources: live.sources.map((source) => ({ ...source, text: source.text.replaceAll(`data-slot="${slot}"`, 'data-slot="planted-rename"') })),
  };
  expect(() => renderOwnerCssSurface(lostSlot, OWNER_CSS_SURFACE)).toThrow(slot);
  const lostClass = { ...live, shellCss: live.shellCss.replaceAll(`.${shellClass}`, ".shell-planted-rename") };
  expect(() => renderOwnerCssSurface(lostClass, OWNER_CSS_SURFACE)).toThrow(shellClass);
  const lostToken = { ...live, tokenVars: live.tokenVars.filter((cssVar) => cssVar !== token) };
  expect(() => renderOwnerCssSurface(lostToken, OWNER_CSS_SURFACE)).toThrow(token);
  expect(() => renderOwnerCssSurface({ ...lostToken, renames: [{ kind: "token", name: token, to: null }] }, OWNER_CSS_SURFACE)).not.toThrow();
});

test("every rename row names a hook that left the surface and points at one that is on it", () => {
  const onSurface = (kind: string, name: string): boolean => OWNER_CSS_SURFACE.some((hook) => hook.kind === kind && hook.name === name);
  const violations = OWNER_CSS_RENAMES.filter((rename) => onSurface(rename.kind, rename.name) || (rename.to !== null && !onSurface(rename.kind, rename.to)));
  expect(violations).toEqual([]);
});

test("the surface lists every kind, each name once, and no private name", () => {
  expect(OWNER_CSS_SURFACE).toHaveLength(OWNER_CSS_SLOTS.length + OWNER_CSS_SHELL_CLASSES.length + OWNER_CSS_TOKEN_VARS.length);
  const keys = OWNER_CSS_SURFACE.map((hook) => `${hook.kind} ${hook.name}`);
  expect(new Set(keys).size).toBe(keys.length);
  expect(OWNER_CSS_SURFACE.filter((hook) => hook.name.startsWith(PRIMITIVE_PREFIX) || hook.name.startsWith("--orb-"))).toEqual([]);
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
