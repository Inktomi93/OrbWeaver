import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import { ruleMessages } from "./native-rule-probe.ts";

const THEME_OVERRIDE = "orb/theme-override-only-via-scope";
const CLIENT = "packages/client/src/components/probe.tsx";
const CLAMP = "packages/ui/src/content/theme-scope/theme-scope.tsx";

for (const [name, source, path, count] of [
  // The retired gate's mustFlag rows, in order; the imported-object row is the recorded lost claim at the end.
  ["inline colour token", "export const A = () => <div style={{ '--color-primary': 'red' }} />;", CLIENT, 1],
  ["the clamp home is not exempt", "export const T = () => <div style={{ '--color-primary': 'red' }} />;", CLAMP, 1],
  ["const-hoisted object", "const vars = { '--color-primary': 'red' };\nexport const A = () => <div style={vars} />;", CLIENT, 1],
  // The retired gate's mustPass rows, in order.
  ["an inline style without a token", "export const A = () => <div style={{ width: 10 }} />;", CLIENT, 0],
  [
    "a comment naming the token",
    "export const A = () => (\n  // the plate used to set --color-primary here; it does not any more\n  <div style={{ width: 10 }} />\n);",
    CLIENT,
    0,
  ],
  [
    "a computed style object is not statically readable",
    "declare function derive(seed: string): Record<string, string>;\nexport const T = (seed: string) => <div style={derive(seed)} />;",
    CLAMP,
    0,
  ],
  ["a non-colour custom property", "export const A = () => <div style={{ '--space-inline': '4px' }} />;", CLIENT, 0],
  // Bindings and keys the retired reader followed.
  [
    "const reached through a second const",
    "const base = { '--color-primary': 'red' };\nconst vars = base;\nexport const A = () => <div style={vars} />;",
    CLIENT,
    1,
  ],
  ["spread of a const object", "const base = { '--color-primary': 'red' };\nexport const A = () => <div style={{ ...base, width: 1 }} />;", CLIENT, 1],
  ["wrapped object", "export const A = () => <div style={{ '--color-primary': 'red' } as React.CSSProperties} />;", CLIENT, 1],
  ["computed string key", "export const A = () => <div style={{ ['--color-primary']: 'red' }} />;", CLIENT, 1],
  ["computed key through a const", "const K = '--color-primary';\nexport const A = () => <div style={{ [K]: 'red' }} />;", CLIENT, 1],
  ["computed key through a let never reassigned", "let K = '--color-primary';\nexport const A = () => <div style={{ [K]: 'red' }} />;", CLIENT, 1],
  ["computed key through a concatenation", "const P = '--color-';\nexport const A = () => <div style={{ [P + 'primary']: 'red' }} />;", CLIENT, 1],
  [
    "computed key through a reassigned let",
    "let K = '--color-primary';\nK = '--space-inline';\nexport const A = () => <div style={{ [K]: 'red' }} />;",
    CLIENT,
    0,
  ],
  ["let object never reassigned", "let vars = { '--color-primary': 'red' };\nexport const A = () => <div style={vars} />;", CLIENT, 1],
  ["let object reassigned names no one value", "let vars = { '--color-primary': 'red' };\nvars = {};\nexport const A = () => <div style={vars} />;", CLIENT, 0],
  // Arms the lint rule adds around the same claim.
  ["computed template key with a colour prefix", "export const A = (n: number) => <div style={{ [`--color-chart-${n}`]: 'red' }} />;", CLIENT, 1],
  ["two colour keys are one overriding attribute", "export const A = () => <div style={{ '--color-a': 'red', '--color-b': 'blue' }} />;", CLIENT, 1],
  ["a colour object that no style prop reads", "export const vars = { '--color-primary': 'red' };", CLIENT, 0],
  ["a non-style attribute", "export const A = () => <div data-vars={{ '--color-primary': 'red' }} />;", CLIENT, 0],
  // The recorded lost claim: an object reached through another module is not followed.
  ["an imported object is not followed", 'import { vars } from "./vars.ts";\nexport const A = () => <div style={vars} />;', CLIENT, 0],
  ["server package is outside the population", "export const A = () => <div style={{ '--color-primary': 'red' }} />;", "packages/server/src/probe.tsx", 0],
] as const) {
  test(`native theme override ${name}`, { timeout: 60_000 }, async ({ repoRoot }) => {
    expect(await ruleMessages(repoRoot, THEME_OVERRIDE, source, path)).toHaveLength(count);
  });
}
