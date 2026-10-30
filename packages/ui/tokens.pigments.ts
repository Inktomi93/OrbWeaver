// D336 art pigments in the token build: a recipe that mixes an intent hue for art is generated CSS, one custom
// property per recipe on a `[data-pigment="<scope>"]` block, so it resolves on the art's own element and follows the
// nearest ThemeScope. Authored sheets and components read the property; they never spell the intent mix themselves.
import type { PigmentRecipes } from "./token-contract.ts";

const PIGMENT_PREFIX = "--pigment";

function pigmentVar(scope: string, name: string): string {
  return `${PIGMENT_PREFIX}-${scope}-${name}`;
}

/** One block per scope, declaring each recipe of that scope. */
export function renderPigmentBlocks(pigments: PigmentRecipes): string {
  return Object.entries(pigments)
    .map(([scope, recipes]) => {
      const lines = Object.entries(recipes).map(([name, value]) => `  ${pigmentVar(scope, name)}: ${value};`);
      return `\n[data-pigment="${scope}"] {\n${lines.join("\n")}\n}\n`;
    })
    .join("");
}

/** The generated TS surface: each scope's property names, so a consumer names a pigment by its scope and recipe. */
export function renderPigmentTs(pigments: PigmentRecipes): readonly string[] {
  const scopes = Object.entries(pigments).map(
    ([scope, recipes]) =>
      `  ${JSON.stringify(scope)}: { ${Object.keys(recipes)
        .map((name) => `${JSON.stringify(name)}: ${JSON.stringify(pigmentVar(scope, name))}`)
        .join(", ")} },`,
  );
  return [
    "/** The D336 art pigments: each `[data-pigment]` scope's custom property names. Stamp the scope on the art's element. */",
    "export const PIGMENTS = {",
    ...scopes,
    "} as const;",
    "export type PigmentScope = keyof typeof PIGMENTS;",
    "",
  ];
}
