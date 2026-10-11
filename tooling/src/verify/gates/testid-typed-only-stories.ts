// Gate: testid-typed-only-stories (UI-Gates-and-Lessons.md §11.5) — a CT story mounts with freeform `data-testid`
// strings that the typed registry (`testId("key")`, client lib/test-ids.ts) would make compile-checked. Same subject
// as `testid-typed-only`, read through `lib/testid-value.ts`; split because the population is the story modules and
// the position is the attribute's VALUE, so one file can carry a distinct waiver per id instead of one ambiguous
// `data-testid` position per JSX tree. A value with a paren is named by its leading paren-free slice.
import type { SourceFile } from "ts-morph";
import { SyntaxKind } from "ts-morph";
import { defineGate } from "../contract/policy.ts";
import { freeformTestidInitializer } from "../lib/testid-value.ts";
import { waivableCoordinate } from "../lib/waivable-coordinate.ts";

const MESSAGE =
  'freeform data-testid string in a CT story — use the typed registry: data-testid={testId("key")} (client lib/test-ids.ts), so a renamed id fails to compile instead of silently breaking a selector. See UI-Gates-and-Lessons.md §11.5.';
const FIX =
  'use the typed registry: data-testid={testId("key")}. A baselined id is waived with `@orb-waive testid-typed-only-stories(<position>): <reason naming its burn-down item>` above the element, or `@orb-waive-file` with the same position; <position> is the attribute value exactly as written, quotes included (`"composer-input"`).';

export const gate = defineGate({
  id: "testid-typed-only-stories",
  family: "testid-typed-only",
  authority: "ordinary",
  severity: "error",
  population: { in: ["@tests"], named: ["_*stories.tsx", "*.stories.tsx"] },
  analysis: "syntax",
  execution: "selected-files",
  facts: [],
  resources: [],
  message: MESSAGE,
  fix: FIX,
  create: (ctx) => {
    // One finding per id per file: a repeated id is one registry key to mint, and one file-scoped waiver names it.
    const seen = new Map<SourceFile, Set<string>>();
    return {
      visitors: [
        {
          kinds: [SyntaxKind.JsxAttribute],
          visit: (node, sourceFile) => {
            const init = freeformTestidInitializer(node);
            if (init === undefined) {
              return;
            }
            const text = init.getText();
            const token = waivableCoordinate(text) ?? text;
            const ids = seen.get(sourceFile) ?? new Set<string>();
            seen.set(sourceFile, ids);
            if (!ids.has(token)) {
              ids.add(token);
              ctx.report.node(init, { token, offset: 0 });
            }
          },
        },
      ],
    };
  },
  mustFlag: [
    {
      mode: "source",
      files: {
        "tests/client/features/chat/_ct-stories.tsx": "export const A = () => <div data-testid=\"composer\"><span data-testid={'send' as string} /></div>;\n",
      },
      expect: { count: 2 },
      why: "a bare and a braced freeform id in one story tree, each its own finding",
    },
    {
      mode: "source",
      files: {
        "tests/client/features/chat/_ct-stories.tsx":
          'export const A = () => <div data-testid="state"><span data-testid="state" /></div>;\nexport const B = () => <p data-testid="state" />;\n',
      },
      expect: { count: 1, token: '"state"' },
      why: "one finding per id per file: a repeated id is one registry key, and its one file-scoped waiver stays exact",
    },
    {
      mode: "source",
      files: { "tests/ui/variant-arm-matrix.stories.tsx": 'export const A = () => <div data-testid="matrix" />;\n' },
      expect: { count: 1, token: '"matrix"' },
      why: "the `*.stories.tsx` spelling, and the position is the value as written",
    },
  ],
  mustPass: [
    {
      mode: "source",
      files: {
        "tests/client/features/chat/_ct-stories.tsx": "export const A = () => <div data-testid={testId('composer')} />;\n",
        "tests/client/features/chat/composer.ct.tsx": 'export const B = () => <div data-testid="inline" />;\n',
      },
      why: "a typed id passes, and a CT spec that is not a story module is outside the population",
    },
    {
      mode: "source",
      files: {
        "tests/client/features/chat/_ct-stories.tsx":
          '// @orb-waive-file testid-typed-only-stories("composer"): the proof\'s stand-in reason; ends when this fixture stops flagging.\n' +
          '// @orb-waive-file testid-typed-only-stories("send"): the proof\'s stand-in reason; ends when this fixture stops flagging.\n' +
          'export const A = () => <div data-testid="composer"><span data-testid="send" /></div>;\n',
      },
      why: "POSITIONAL IDENTITY: the value position lets two ids in ONE JSX tree carry two exact waivers, which the attribute-name position of `testid-typed-only` cannot",
    },
  ],
});
