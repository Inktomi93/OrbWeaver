import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@orb/testkit/tooling";
import { ESLint, Linter } from "eslint";
import tseslint from "typescript-eslint";
import { beforeAll } from "vitest";

const ROOT = join(import.meta.dirname, "../..");
const FLIP = "orb/no-unruled-flip-inversion";
const STATE = "orb/baseui-state-data-attributes";

const UI = "packages/ui/src/primitives/probe/probe.tsx";
const FEATURE = "packages/client/src/features/chat/components/probe.tsx";
const TABS_HOME = "packages/ui/src/primitives/tabs/tabs.tsx";

const eslint = new ESLint({ flags: ["unstable_native_nodejs_ts_config"], cwd: ROOT });

// The first config calculation loads the whole repo config; it must not bill to a test's timeout.
beforeAll(async () => {
  await eslint.calculateConfigForFile(join(ROOT, FEATURE));
}, 120_000);

async function findings(rule: string, source: string, path: string, force = false): Promise<readonly Linter.LintMessage[]> {
  const config = await eslint.calculateConfigForFile(join(ROOT, path));
  const found = new Linter({ cwd: ROOT }).verify(
    source,
    {
      files: ["**/*.{ts,tsx}"],
      plugins: config?.plugins ?? {},
      languageOptions: { parser: tseslint.parser, parserOptions: { project: false, projectService: false, programs: null, ecmaFeatures: { jsx: true } } },
      rules: { [rule]: force ? "error" : (config?.rules?.[rule] ?? "off") },
    },
    { filename: join(ROOT, path) },
  );
  expect(
    found.filter(({ fatal }) => fatal === true),
    source,
  ).toEqual([]);
  return found.filter(({ ruleId }) => ruleId === rule);
}

const GLIDE =
  'export function glide(node: HTMLElement): void {\n  node.style.transitionProperty = "none";\n  node.style.transform = "translateX(4px)";\n  node.getBoundingClientRect();\n  node.style.transform = "";\n}';
const PART = 'import { Dialog } from "@base-ui/react/dialog";\nimport { useState } from "react";\n';

// [rule, label, source, path, expected finding count]
const CASES = [
  // an inline motion write flushed by a forced layout read
  [FLIP, "a transform write flushed by getBoundingClientRect", GLIDE, FEATURE, 1],
  [
    FLIP,
    "a transform write flushed by offsetWidth",
    'export function f(n: HTMLElement): number {\n  n.style.transform = "x";\n  return n.offsetWidth;\n}',
    FEATURE,
    1,
  ],
  [
    FLIP,
    "a translate write flushed by getComputedStyle",
    'export function f(n: HTMLElement): void {\n  n.style["translate"] = "1px";\n  getComputedStyle(n).translate;\n}',
    FEATURE,
    1,
  ],
  [
    FLIP,
    "a setProperty transition write flushed by a read",
    'export function f(n: HTMLElement): void {\n  n.style.setProperty("transition-property", "none");\n  n.getClientRects();\n}',
    FEATURE,
    1,
  ],
  [FLIP, "the tabs indicator home", GLIDE, TABS_HOME, 0],
  [
    FLIP,
    "a read that runs before the write",
    'export function f(n: HTMLElement): void {\n  n.getBoundingClientRect();\n  n.style.transform = "x";\n}',
    FEATURE,
    0,
  ],
  [FLIP, "a write with no layout read", 'export function f(n: HTMLElement): void {\n  n.style.transform = "x";\n}', FEATURE, 0],
  [
    FLIP,
    "a custom property write beside a read",
    'export function f(n: HTMLElement): void {\n  n.style.setProperty("--x", "1px");\n  n.getBoundingClientRect();\n}',
    FEATURE,
    0,
  ],
  [FLIP, "a colour write beside a read", 'export function f(n: HTMLElement): void {\n  n.style.color = "red";\n  n.getBoundingClientRect();\n}', FEATURE, 0],
  [
    FLIP,
    "a write and a read in different functions",
    'export function f(n: HTMLElement): void {\n  n.style.transform = "x";\n}\nexport function g(n: HTMLElement): void {\n  n.getBoundingClientRect();\n}',
    FEATURE,
    0,
  ],
  [
    FLIP,
    "an offsetWidth assignment is a write, not a read",
    'export function f(n: HTMLElement): void {\n  n.style.transform = "x";\n  n.offsetWidth = 1;\n}',
    FEATURE,
    0,
  ],
  // a style or animation write inside a frame callback
  [FLIP, "a transform write in an inline frame callback", 'requestAnimationFrame(() => {\n  node.style.transform = "x";\n});', FEATURE, 1],
  [FLIP, "a custom property write in a frame callback", 'requestAnimationFrame(() => {\n  node.style.setProperty("--p", "1");\n});', FEATURE, 1],
  [FLIP, "a WAAPI call in a frame callback", "requestAnimationFrame(() => {\n  node.animate(keyframes, options);\n});", FEATURE, 1],
  [FLIP, "a write in a named frame callback", 'const tick = (): void => {\n  node.style.opacity = "0";\n};\nrequestAnimationFrame(tick);', FEATURE, 1],
  [
    FLIP,
    "a write in a helper nested inside a frame callback",
    'requestAnimationFrame(() => {\n  rows.forEach((row) => {\n    row.style.opacity = "0";\n  });\n});',
    FEATURE,
    1,
  ],
  [FLIP, "a window-qualified frame request", 'window.requestAnimationFrame(() => {\n  node.style.opacity = "0";\n});', FEATURE, 1],
  [FLIP, "a style write outside any frame callback", 'export function f(n: HTMLElement): void {\n  n.style.opacity = "0";\n}', FEATURE, 0],
  [FLIP, "a frame callback that only flips state", "requestAnimationFrame(() => setEntered(true));", FEATURE, 0],
  [FLIP, "a frame callback that scrolls", "requestAnimationFrame(() => {\n  list.scrollTop = 4;\n});", FEATURE, 0],
  // a frame-time callback that re-requests itself
  [
    FLIP,
    "a named tween loop",
    "export function start(): void {\n  const step = (now: number): void => {\n    draw(now);\n    raf = requestAnimationFrame(step);\n  };\n  raf = requestAnimationFrame(step);\n}",
    FEATURE,
    1,
  ],
  [
    FLIP,
    "an inline named-function tween loop",
    "export function start(): void {\n  requestAnimationFrame(function step(now: number): void {\n    draw(now);\n    requestAnimationFrame(step);\n  });\n}",
    FEATURE,
    1,
  ],
  [
    FLIP,
    "the smooth-text home",
    "export function start(): void {\n  const frame = (now: number): void => {\n    draw(now);\n    raf = requestAnimationFrame(frame);\n  };\n}",
    "packages/ui/src/stream/use-smooth-text.ts",
    0,
  ],
  [
    FLIP,
    "a retry loop that takes no frame time",
    "export function start(): void {\n  const retry = (): void => {\n    if (!ready()) {\n      requestAnimationFrame(retry);\n    }\n  };\n}",
    FEATURE,
    0,
  ],
  [FLIP, "a one-shot frame hop", "export function start(): void {\n  requestAnimationFrame((now: number) => draw(now));\n}", FEATURE, 0],
  // lifecycle styling off React state
  [
    STATE,
    "a state boolean in a part's className",
    `${PART}export function P(): unknown {\n  const [open, setOpen] = useState(false);\n  return <Dialog.Popup className={cn(open && "opacity-100")} onClick={() => setOpen(!open)} />;\n}`,
    UI,
    1,
  ],
  [
    STATE,
    "an isOpen ternary in a part's className",
    `${PART}export function P(): unknown {\n  const [isOpen] = useState(false);\n  return <Dialog.Backdrop className={isOpen ? "a" : "b"} />;\n}`,
    UI,
    1,
  ],
  [
    STATE,
    "a mounted flag from a reducer",
    `${PART}export function P(): unknown {\n  const [mounted] = useReducer(reduce, false);\n  return <Dialog.Popup className={\`x \${mounted ? "a" : ""}\`} />;\n}`,
    UI,
    1,
  ],
  [STATE, "a hand-passed data-open", `${PART}export function P(): unknown {\n  return <Dialog.Popup data-open={true} />;\n}`, UI, 1],
  [STATE, "a hand-passed data-ending-style", `${PART}export function P(): unknown {\n  return <Dialog.Popup data-ending-style="" />;\n}`, UI, 1],
  [
    STATE,
    "a feature styling an @orb/ui part from state",
    'import { PopoverPopup } from "@orb/ui/popover";\nimport { useState } from "react";\nexport function P(): unknown {\n  const [open] = useState(false);\n  return <PopoverPopup className={open ? "opacity-100" : "opacity-0"} />;\n}',
    FEATURE,
    1,
  ],
  [
    STATE,
    "a feature handing an @orb/ui part a lifecycle attribute",
    'import { DialogPopup } from "@orb/ui/dialog";\nexport function P(): unknown {\n  return <DialogPopup data-ending-style="" />;\n}',
    FEATURE,
    1,
  ],
  [
    STATE,
    "a ui composite reaching a part by the alias",
    'import { PopoverPopup } from "#primitives/popover";\nimport { useState } from "react";\nexport function P(): unknown {\n  const [visible] = useState(false);\n  return <PopoverPopup className={visible ? "a" : "b"} />;\n}',
    "packages/ui/src/content/probe/probe.tsx",
    1,
  ],
  [
    STATE,
    "a ui composite reaching a part by a relative path",
    'import { PopoverPopup } from "../../primitives/popover/index.ts";\nimport { useState } from "react";\nexport function P(): unknown {\n  const [mounted] = useState(false);\n  return <PopoverPopup className={mounted ? "a" : "b"} />;\n}',
    "packages/ui/src/content/probe/probe.tsx",
    1,
  ],
  [
    STATE,
    "a feature styling a non-Base UI @orb/ui element from state",
    'import { Badge } from "@orb/ui/badge";\nimport { useState } from "react";\nexport function P(): unknown {\n  const [open] = useState(false);\n  return <Badge className={open ? "a" : "b"} />;\n}',
    FEATURE,
    0,
  ],
  [
    STATE,
    "a feature element from the client's own #lib",
    'import { Thing } from "#lib";\nimport { useState } from "react";\nexport function P(): unknown {\n  const [open] = useState(false);\n  return <Thing className={open ? "a" : "b"} />;\n}',
    FEATURE,
    0,
  ],
  [
    STATE,
    "a state boolean on a plain element",
    `${PART}export function P(): unknown {\n  const [open] = useState(false);\n  return <div className={open ? "a" : "b"} />;\n}`,
    UI,
    0,
  ],
  [
    STATE,
    "a part styled from its own data attribute classes",
    `${PART}export function P(): unknown {\n  return <Dialog.Popup className="data-starting-style:opacity-0 data-ending-style:opacity-0" />;\n}`,
    UI,
    0,
  ],
  [
    STATE,
    "a state value that is not lifecycle",
    `${PART}export function P(): unknown {\n  const [selected] = useState(false);\n  return <Dialog.Popup className={selected ? "a" : "b"} />;\n}`,
    UI,
    0,
  ],
  [
    STATE,
    "a state boolean that only controls the part",
    `${PART}export function P(): unknown {\n  const [open, setOpen] = useState(false);\n  return <Dialog.Root onOpenChange={setOpen} open={open} />;\n}`,
    UI,
    0,
  ],
  [
    STATE,
    "a part type imported without a value",
    'import type { Dialog } from "@base-ui/react/dialog";\nimport { useState } from "react";\nexport function P(): unknown {\n  const [open] = useState(false);\n  return <Dialog className={open ? "a" : "b"} />;\n}',
    UI,
    0,
  ],
] as const;

test.for(CASES)("%s: %s", { timeout: 120_000 }, async ([rule, , source, path, count]) => {
  expect(await findings(rule, source, path)).toHaveLength(count);
});

// A home the rule no longer matches is a stale exemption: it would hide the next real finding in that file.
test("every motion home still holds a shape the rule matches", { timeout: 120_000 }, async () => {
  const { default: config } = await import("../../eslint.config.ts");
  const homes = config.flatMap((block) => (block.rules !== undefined && FLIP in block.rules ? (block.ignores ?? []) : []));
  expect(homes.length).toBeGreaterThan(0);
  for (const home of homes) {
    expect(await findings(FLIP, readFileSync(join(ROOT, home), "utf8"), home, true), home).not.toHaveLength(0);
  }
});
