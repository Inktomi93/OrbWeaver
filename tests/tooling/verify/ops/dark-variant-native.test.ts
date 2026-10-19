import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import { scaledBudget } from "../../_load-budget.ts";
import { ruleMessages } from "./native-rule-probe.ts";

const DARK_VARIANT_NATIVE_BASE_MS = 60_000;
const DARK = "orb/no-tailwind-dark-variant";
const UI = "packages/ui/src/primitives/probe.tsx";
const CLIENT = "packages/client/src/features/probe.tsx";

for (const [name, source, path, count] of [
  // The retired gate's mustFlag rows, in order. The rule judges every written string, so a composer, an alias or a
  // re-export changes nothing: the literal is the finding wherever it is written.
  ["nested and optional composer calls", 'import { clsx } from "clsx";\nexport const x = clsx?.(clsx("hover:dark:text-foreground"));', CLIENT, 1],
  [
    "import alias, local alias and forwarding wrapper",
    'import { clsx as imported } from "clsx";\nconst local = imported;\nconst forward = (...args: Parameters<typeof local>) => local(...args) ?? "";\nexport const x = forward("dark:alias-wrapper");',
    UI,
    1,
  ],
  ["a re-exported composer, consumer side", 'import { join as compose } from "./composer.ts";\nexport const x = compose("dark:reexported-composer");', UI, 1],
  ["a re-exported composer, producer side", 'export { clsx as join } from "clsx";', UI, 0],
  [
    "namespace dot and static-bracket calls",
    'import * as kit from "clsx";\nexport const a = kit.clsx("dark:namespace-dot");\nexport const b = kit["clsx"]?.("dark:namespace-bracket");',
    CLIENT,
    2,
  ],
  ["a cross-file constant, producer literal", 'export const CARD = "dark:bg-card";', UI, 1],
  ["a cross-file constant, barrel re-export", 'export { CARD as SURFACE } from "./producer.ts";', UI, 0],
  ["a cross-file constant, consumer", 'import { SURFACE } from "../../ui/src/barrel.ts";\nexport const x = <div className={SURFACE} />;', CLIENT, 0],
  [
    "arrays, object class maps, values and spreads",
    'import clsx from "clsx";\nconst shared = ["dark:array", { "dark:object-key": true }];\nexport const x = clsx([false && "dark:dead", ...shared]);',
    UI,
    3,
  ],
  [
    "tv slots, nested slots and compound class; the configuration values are strings too",
    'import { tv } from "tailwind-variants";\nexport const x = tv({ slots: { root: "dark:slot" }, variants: { tone: { loud: { root: "hover:dark:nested" } } }, compoundVariants: [{ tone: "dark:selector", class: "dark:compound" }], defaultVariants: { tone: "dark:default" } });',
    UI,
    5,
  ],
  [
    "a resolvable template and a concatenation",
    'const tone = "card";\nconst a = `hover:dark:bg-${tone}`;\nconst b = "focus:" + "dark:text-foreground";\nexport const x = <div className={[a, b]} />;',
    CLIENT,
    2,
  ],
  [
    "static member access and dynamic indexing of a class map",
    'declare const key: "a" | "b";\nconst map = { a: "dark:static", b: "hover:dark:dynamic" } as const;\nexport const x = <div className={[map.a, map[key]]} />;',
    UI,
    2,
  ],
  ["runtime dark prefix", "declare const tone: string;\nexport const x = <div className={`dark:${tone}`} />;", UI, 1],
  ["object className", 'export const props = { className: "dark:border-border" };', CLIENT, 1],
  ["arbitrary selector with parentheses", '<div className="[&:where(.x:y)]:dark:bg-card" />;', UI, 1],
  ["supports query", '<div className="supports-[selector(:has(*))]:dark:text-foreground" />;', UI, 1],
  // The retired gate's mustPass rows, in order. Rows 2 to 4 are now findings: the rule judges the written string,
  // not the class carrier it sits in.
  ["shiki theme keys and token names", 'export const shiki = { dark: "github-dark" };\nexport const token = "--color-sky-cloud-dark";', UI, 0],
  ["a class-shaped token in prose is a finding", 'export const copy = "Never write dark:bg-card in prose";', CLIENT, 1],
  ["a local function named cn is judged too", 'function cn(value: string) { return value.length; }\nexport const inert = cn("dark:not-a-class");', UI, 1],
  [
    "tv defaultVariants are judged too",
    'import { tv } from "tailwind-variants";\nexport const x = tv({ variants: { tone: { loud: "bg-card" } }, defaultVariants: { tone: "dark:not-a-class" } });',
    UI,
    1,
  ],
  ["selector text and near-miss prefixes", '<div className="[&_.dark:x]:bg-card darkroom:bg-card bg-card text-foreground" />;', UI, 0],
  ["a dark segment between colons inside an arbitrary selector", '<div className="[&_.x:dark:y]:bg-card" />;', UI, 0],
  ["dark as the utility position", '<div className="hover:dark" />;', UI, 0],
  // Candidates split across literals, templates and same-file constants.
  ["variant split across two literals", 'export const x = "focus:dark" + ":bg-card";', CLIENT, 1],
  ["variant split by a same-file const", 'const variant = "dark";\nexport const x = `${variant}:bg-card`;', CLIENT, 1],
  ["variant split by a let never reassigned", 'let variant = "dark";\nexport const x = `${variant}:bg-card`;', CLIENT, 1],
  ["variant split by a reassigned let is unread", 'let variant = "dark";\nvariant = "hover";\nexport const x = `${variant}:bg-card`;', CLIENT, 0],
  ["class const reached through a concatenation is reported once, at the const", 'const CARD = "dark:bg-card";\nexport const x = CARD + " p-2";', CLIENT, 1],
  ["class const reached through a template is reported once, at the const", 'const CARD = "dark:bg-card";\nexport const x = `${CARD} p-2`;', CLIENT, 1],
  ["an unread prefix before dark is still a finding", "declare const prefix: string;\nexport const x = `${prefix}dark:bg-card`;", CLIENT, 1],
  ["an unread suffix after a trailing variant is a finding", "declare const tone: string;\nexport const x = 'hover:dark:' + tone;", CLIENT, 1],
  // Arms the lint rule adds around the same claim.
  ["direct className literal", '<div className="dark:bg-card" />;', UI, 1],
  ["two dark tokens in one literal are one finding", '<div className="dark:bg-card dark:text-foreground" />;', UI, 1],
  ["a non-class attribute is judged too", '<div title="dark:bg-card" />;', CLIENT, 1],
  ["a bare dark: with nothing after it in a plain string", 'export const label = "Theme dark: warm";', CLIENT, 0],
  ["a static template ending in dark:", "export const label = `Theme dark:`;", CLIENT, 0],
  ["dark inside an attribute selector", '<div className="data-[state=dark]:bg-card" />;', UI, 0],
  ["JSX text is not a string literal", "export const note = <p>Never write dark:bg-card in prose</p>;", CLIENT, 0],
  ["comments are not class carriers", "// dark:text-foreground is documentation\nexport const x = 1;", CLIENT, 0],
  // The recorded lost claims: provenance across modules and the static-cycle refusal.
  ["a variant split across modules is not read", 'import { PART } from "./part.ts";\nexport const x = `${PART}:bg-card`;', CLIENT, 0],
  ["a static cycle names no string", "const A = B;\nconst B = A;\nexport const x = <div className={A} />;", UI, 0],
  ["server package is outside the population", '<div className="dark:bg-card" />;', "packages/server/src/probe.tsx", 0],
  ["tests are outside the population", '<div className="dark:bg-card" />;', "tests/ui/probe.ct.tsx", 0],
] as const) {
  test(`native dark variant ${name}`, { timeout: scaledBudget(DARK_VARIANT_NATIVE_BASE_MS) }, async ({ repoRoot }) => {
    expect(await ruleMessages(repoRoot, DARK, source, path)).toHaveLength(count);
  });
}
