// Story freeform IDs retain their custom value-coordinate permissions; production literals use native lint.
import type { SourceFile } from "ts-morph";
import { SyntaxKind } from "ts-morph";
import { defineGate } from "../contract/policy.ts";
import { freeformTestidInitializer } from "../lib/testid-value.ts";
import { waivableCoordinate } from "../lib/waivable-coordinate.ts";

const MESSAGE =
  'freeform data-testid string in a CT story — use a typed registry: data-testid={storyTestId("key")} (tests/support/browser/story-test-ids.ts) for a story-only id, or testId("key") (client lib/test-ids.ts) for a production id, so a renamed id fails to compile instead of silently breaking a selector. See UI-Gates-and-Lessons.md §11.5.';
const FIX =
  'add a row to STORY_TEST_IDS and stamp data-testid={storyTestId("key")}, or use testId("key") when the id is a production TEST_IDS value. A deliberate raw id is waived with `@orb-waive testid-typed-only-stories(<position>): <reason + end condition>` above the element, or `@orb-waive-file` with the same position; <position> is the attribute value exactly as written, quotes included (`"composer-input"`).';

export const gate = defineGate({
  id: "testid-typed-only-stories",
  family: "testid-typed-only-stories",
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
      files: { "tests/client/features/chat/_ct-stories.tsx": 'export const A = () => <div data-testid={storyTestId("rowScrollport")} />;\n' },
      why: "a story-registry id passes: the story-side typed door is the sanctioned spelling for a story-only id",
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
