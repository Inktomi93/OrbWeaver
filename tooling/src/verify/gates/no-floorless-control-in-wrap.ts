// Policy: no-floorless-control-in-wrap — preserve wrap and vertical-pitch collision predicates.
// The shared visitor-fed fact counts descendants once; ordinary coordinates preserve inline waivers.
// The two geometry-ruled sites use exact markers. Central authority replaces their stale-file table.
// Execution port: the shared fact requires entire-population execution; proper subset selections defer
// both owners rather than claiming a complete verdict from a partial collision index.
// The unsuppressible vocabulary arm lives in floorless-control-vocabulary-health, in the same family.
import { defineGate } from "../contract/policy.ts";
import { floorlessControlFact } from "../lib/floorless-control-fact.ts";

const MESSAGE =
  "a floorless-size Button (`inline`/`glyph-*`) repeated at a SUB-FLOOR PITCH — the size arm carries its " +
  "touch floor in an OVERFLOWING ::after (28px fine / 44px coarse), so stacked/wrapped neighbours contest " +
  "the same pixels and the pseudo LOSES hit-testing to whatever flow content it lands on. Token `Stack` = " +
  "the vertical-pitch arm (#850's class: rows of inline-edit affordances in a Stack, each hit box its bare " +
  "text height because the pseudo lands on the neighbour row's text); a size-value token = the flex-wrap " +
  "arm (the ambient-strip weather picker, measured via elementFromPoint at 320px: aiming `clear` committed " +
  "`snow` — packages/client/src/components/tracker-blocks/ambient-strip.tsx records the fix).";
const FIX =
  'vertical pitch: `rows="control"` on the Stack (one token — floors every direct row, layout/variants.ts) ' +
  "or a per-row `min-h-touch-target`/`pointer-coarse:min-h-*`; a wrapping run: a control size (`sm`/`icon` " +
  "— the box IS the target). `inline`/`glyph-*` stay correct for a lone datum/glyph riding inside a row. " +
  "A deliberate exception is waived with `// @orb-waive no-floorless-control-in-wrap(<position>): <reason>` " +
  "at the exact reported position — the bare (unquoted) size value, e.g. `inline` or `glyph-lg`, for the " +
  "flex-wrap arm, or `Stack` for the vertical-pitch arm.";

export const gate = defineGate({
  id: "no-floorless-control-in-wrap",
  family: "floorless-control",
  authority: "ordinary",
  severity: "error",
  population: ["@client", "@ui"],
  analysis: "syntax",
  execution: "entire-population",
  facts: [floorlessControlFact],
  resources: [],
  message: MESSAGE,
  fix: FIX,
  create: (ctx) => ({
    evaluate: () => {
      const fact = ctx.fact(floorlessControlFact);
      ctx.receipt({ kind: "population", source: "floorless-control-sources", members: fact.sources });
      for (const hit of fact.occurrences) {
        ctx.report.node(hit.node, { token: hit.token, offset: hit.offset });
      }
    },
  }),
  mustFlag: [
    {
      files: {
        "packages/client/src/features/rpg/components/icon-grid.tsx":
          "const ICONS = ['a', 'b', 'c'];\nexport function IconGrid() {\n  return (\n    <div className=\"max-w-64 flex-wrap\">\n      {ICONS.map((name) => (\n        <Button key={name} size=\"glyph-lg\">{name}</Button>\n      ))}\n    </div>\n  );\n}\n",
      },
      expect: {
        count: 1,
      },
      why: "the founding geometry: ONE mapped floorless Button = N runtime siblings in a wrapping grid (the weather-picker/ItemIconPicker shape)",
      mode: "source",
    },
    {
      files: {
        "packages/client/src/features/preset/components/two-verbs.tsx":
          'export function TwoVerbs() {\n  return (\n    <div className="flex-wrap">\n      <Button size="inline">a</Button>\n      <Button size="inline">b</Button>\n    </div>\n  );\n}\n',
      },
      expect: {
        count: 2,
      },
      why: "the LITERAL-siblings arm: two floorless controls sharing one wrapping container collide without any map",
      mode: "source",
    },
    {
      files: {
        "packages/client/src/features/rpg/components/pitch-editor.tsx":
          'const ATTRS = [\'a\', \'b\'];\nfunction AttributeRow({ k }: { k: string }) {\n  return (\n    <Row gap="field">\n      <span>{k}</span>\n      <Button size="inline">edit</Button>\n    </Row>\n  );\n}\nexport function Editor() {\n  return (\n    <Stack gap="field">\n      {ATTRS.map((k) => (\n        <AttributeRow key={k} k={k} />\n      ))}\n    </Stack>\n  );\n}\n',
      },
      expect: {
        count: 1,
        token: "Stack",
      },
      why: "the vertical-pitch founding shape: a mapped same-file row component carrying an inline Button — #850's 28 P1s (rows of 18px hit boxes whose 28px pseudo lands on the neighbour row's text)",
      mode: "source",
    },
    {
      files: {
        "packages/client/src/features/preset/components/two-rows.tsx":
          'export function TwoRows() {\n  return (\n    <Stack gap="field">\n      <Row><Button size="inline">a</Button></Row>\n      <Row><Button size="inline">b</Button></Row>\n    </Stack>\n  );\n}\n',
      },
      expect: {
        count: 1,
        token: "Stack",
      },
      why: "the LITERAL-rows spelling of the pitch arm: two direct rows each holding a floorless Button, no map needed",
      mode: "source",
    },
  ],
  mustPass: [
    {
      files: {
        "packages/client/src/features/preset/components/floored-stack.tsx":
          'export function TwoRows() {\n  return (\n    <Stack gap="field" rows="control">\n      <Row><Button size="inline">a</Button></Row>\n      <Row><Button size="inline">b</Button></Row>\n    </Stack>\n  );\n}\n',
      },
      why: 'the pitch arm\'s ONE-TOKEN fix: `rows="control"` floors every direct row at the pointer-conditional control height (layout/variants.ts)',
      mode: "source",
    },
    {
      files: {
        "packages/client/src/features/preset/components/fenced-rows.tsx":
          'export function FencedRows() {\n  return (\n    <Stack gap="field">\n      <Row className="pointer-coarse:min-h-touch-target"><Button size="inline">a</Button></Row>\n      <Row className="min-h-control-sm"><Button size="inline">b</Button></Row>\n    </Stack>\n  );\n}\n',
      },
      why: "every counted row carries its OWN floor — the per-row spelling of the same fact passes",
      mode: "source",
    },
    {
      files: {
        "packages/client/src/features/preset/components/one-row.tsx":
          'export function OneRow() {\n  return (\n    <Stack gap="field">\n      <Row><Button size="inline">a</Button></Row>\n      <Row><span>plain text row</span></Row>\n    </Stack>\n  );\n}\n',
      },
      why: "a SINGLE floorless row has no sub-floor neighbour to lend its pseudo to — no pitch population",
      mode: "source",
    },
    {
      files: {
        "packages/client/src/features/rpg/components/cross-file-rows.tsx":
          "import { TrackerValue } from \"#components/tracker-blocks\";\nconst XS = ['a', 'b'];\nexport function CrossFile() {\n  return (\n    <Stack gap=\"field\">\n      {XS.map((x) => (\n        <TrackerValue key={x} />\n      ))}\n    </Stack>\n  );\n}\n",
      },
      why: "DECLARED LIMIT: a CROSS-FILE row component (the live rpg-stat-profile-editor shape — TrackerValue/HintEditor imports) is invisible to the same-file resolution; the founding geometry is proven by the same-file fixture",
      mode: "source",
    },
    {
      files: {
        "packages/client/src/components/tracker-blocks/ambient-strip.tsx":
          "const SKIES = ['clear', 'snow'];\nexport function Picker() {\n  return (\n    <div className=\"flex-wrap\">\n      {SKIES.map((s) => (\n        <Button key={s} size=\"sm\">{s}</Button>\n      ))}\n    </div>\n  );\n}\n",
      },
      why: "the RULED fix shape (side-eye 2026-08-07): a control size in the wrapping run — the box IS the target",
      mode: "source",
    },
    {
      files: {
        "packages/client/src/components/tracker-blocks/tracker-value.tsx":
          'export function Strip() {\n  return (\n    <div className="flex-wrap">\n      <span>Label</span>\n      <Button size="inline">the datum</Button>\n    </div>\n  );\n}\n',
      },
      why: "a LONE display-at-rest datum inside a wrapping strip is the inline arm's sanctioned job — no collision population",
      mode: "source",
    },
    {
      files: {
        "packages/client/src/features/databank/components/databank-library-row.tsx":
          "const CHIPS = ['a', 'b'];\nexport function Chips() {\n  return (\n    <div className=\"flex-wrap\">\n      {CHIPS.map((c) => (\n        <Badge key={c} size=\"inline\">{c}</Badge>\n      ))}\n    </div>\n  );\n}\n",
      },
      why: "Badge's `inline` is the IN-FLOW prose chip — not a control, no touch pseudo; only Button's floorless arms are guarded",
      mode: "source",
    },
    {
      files: {
        "packages/client/src/features/rpg/components/no-wrap-grid.tsx":
          "const ICONS = ['a', 'b'];\nexport function Grid() {\n  return (\n    <div className=\"grid\">\n      {ICONS.map((c) => (\n        <Button key={c} size=\"glyph-md\">{c}</Button>\n      ))}\n    </div>\n  );\n}\n",
      },
      why: "no `flex-wrap` ancestor — a non-wrapping run cannot stack pseudos across a wrapped row pitch (CSS grid spacing is its own axis, out of scope)",
      mode: "source",
    },
  ],
});
