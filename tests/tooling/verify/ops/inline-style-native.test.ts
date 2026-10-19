import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import { ruleMessages } from "./native-rule-probe.ts";

const OFF_TOKEN = "orb/no-off-token-inline-style";
const CLIENT = "packages/client/src/features/demo/components/probe.tsx";
const UI = "packages/ui/src/primitives/demo/probe.ts";
// The first test pays the cost of loading the whole ESLint config.
const CONFIG_LOAD_MS = 60_000;

for (const [name, source, path, count] of [
  // The retired gate's mustFlag rows, in order.
  ["raw radius", 'export const G = <div style={{ borderRadius: "8px" }} />;', CLIENT, 1],
  ["negative number", "export const G = <div style={{ margin: -8 }} />;", CLIENT, 1],
  ["named number", "const GAP = 12;\nexport const G = <div style={{ gap: GAP }} />;", CLIENT, 1],
  ["bracket assignment target", 'export function f(el: HTMLElement): void {\n  el.style["borderRadius"] = "8px";\n}', UI, 1],
  ["dot assignment target", 'export function f(el: HTMLElement): void {\n  el.style.borderRadius = "8px";\n}', UI, 1],
  ["hex colour", 'export const G = <div style={{ color: "#fff" }} />;', CLIENT, 1],
  ["as-wrapped literal", 'export const G = <div style={{ borderRadius: "8px" as string }} />;', CLIENT, 1],
  ["setProperty", 'export function f(el: HTMLElement): void {\n  el.style.setProperty("gap", "12px");\n}', UI, 1],
  // The retired gate's mustPass rows, in order (its waiver-marker row belonged to the marker engine).
  ["var() inline value", 'export const G = <div style={{ borderRadius: "var(--radius-card)" }} />;', CLIENT, 0],
  ["non-token property", 'export const G = <div style={{ left: "8px" }} />;', CLIENT, 0],
  ["dynamic number", "export const G = (props: { gap: number }) => <div style={{ gap: props.gap }} />;", CLIENT, 0],
  ["negative zero", "export const G = <div style={{ margin: -0 }} />;", CLIENT, 0],
  ["imperative var()", 'export function f(el: HTMLElement): void {\n  el.style.borderRadius = "var(--radius-card)";\n}', UI, 0],
  ["zero", "export const G = <div style={{ margin: 0 }} />;", CLIENT, 0],
  ["dynamic identifier", "export const G = ({ r }: { r: string }) => <div style={{ borderRadius: r }} />;", CLIENT, 0],
  ["plain-object target is not the CSSOM", 'export function f(box: { borderRadius: string }): void {\n  box.borderRadius = "8px";\n}', CLIENT, 0],
  ["non-style attribute", 'export const G = <div data-theme={{ borderRadius: "8px" }} />;', CLIENT, 0],
  // Bindings the retired reader followed.
  ["let never reassigned", "let GAP = 12;\nexport const G = <div style={{ gap: GAP }} />;", CLIENT, 1],
  ["let never reassigned, shorthand", 'let gap = "12px";\nexport const G = <div style={{ gap }} />;', CLIENT, 1],
  ["let reassigned names no one value", "let GAP = 12;\nGAP = 4;\nexport const G = <div style={{ gap: GAP }} />;", CLIENT, 0],
  ["const reached through a const key", 'const KEY = "borderRadius";\nexport function f(el: HTMLElement): void {\n  el.style[KEY] = "8px";\n}', UI, 1],
  ["const property name on setProperty", 'const PROP = "gap";\nexport function f(el: HTMLElement): void {\n  el.style.setProperty(PROP, "12px");\n}', UI, 1],
  ["named string through a second const", 'const A = "8px";\nconst B = A;\nexport const G = <div style={{ padding: B }} />;', CLIENT, 1],
  // Arms the lint rule adds around the same claim.
  ["satisfies-wrapped literal", 'export const G = <div style={{ borderRadius: "8px" satisfies string }} />;', CLIENT, 1],
  ["static template literal", "export const G = <div style={{ boxShadow: `0 0 4px red` }} />;", CLIENT, 1],
  ["quoted key", 'export const G = <div style={{ "borderRadius": "8px" }} />;', CLIENT, 1],
  ["setProperty kebab key", 'export function f(el: HTMLElement): void {\n  el.style.setProperty("border-radius", "8px");\n}', UI, 1],
  ["two offending props are two findings", 'export const G = <div style={{ borderRadius: "8px", gap: 4 }} />;', CLIENT, 2],
  ["setProperty on a non-style receiver", 'export function f(map: Map<string, string>): void {\n  map.setProperty("gap", "12px");\n}', UI, 0],
  // The recorded lost claim: a value reached through another module is not followed.
  ["imported const is not followed", 'import { GAP } from "./gap.ts";\nexport const G = <div style={{ gap: GAP }} />;', CLIENT, 0],
  ["server package is outside the population", 'export const G = <div style={{ borderRadius: "8px" }} />;', "packages/server/src/probe.tsx", 0],
  ["tests are outside the population", 'export const G = <div style={{ borderRadius: "8px" }} />;', "tests/ui/probe.ct.tsx", 0],
] as const) {
  test(`native off-token inline style ${name}`, { timeout: CONFIG_LOAD_MS }, async ({ repoRoot }) => {
    expect(await ruleMessages(repoRoot, OFF_TOKEN, source, path)).toHaveLength(count);
  });
}
