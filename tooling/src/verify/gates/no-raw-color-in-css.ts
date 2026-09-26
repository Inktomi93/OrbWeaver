// Gate: no-raw-color-in-css (UI-Architecture-and-Layout.md / D43) — parsed declarations only.
// The generated theme.css is the authoritative raw-color definition surface; comments, selectors, and
// declaration content strings are not color declarations and remain outside this policy.
// FAMILY: a singleton until a second CSS-literal sibling converts. The loader law (lib/policy-module.ts, the
// final contract's "a policy with no proven sibling is a singleton family under its own id") refuses a lone member
// whose `family` is not its id — `css-literal-geometry` was declared here for the 14 LEGACY CSS gates that share the
// authored-css reader, and the mixed door (#1584 §5) is the first loader to have run this module. Re-declare the
// shared family in the same commit that converts the second member.
// POPULATION PORT: an INTENTIONAL CORRECTION, from a filesystem WALK to a declared resource. The legacy
// descriptor at `5c55b1d9c` (the commit before the conversion at `b32797507`) owned its own
// `globSync("packages/{ui,client}/src/**/*.css")` under `scopeSafety: "whole-project"`, plus an `ALLOWLIST:
// ExemptionTable` whose one row was the generated `theme.css` and whose stale arm needed a real-tree ANCHOR
// to prove the run was whole. The final shape carries all three differently and deliberately: the walk
// becomes `resources: [{ kind: "authored-css" }]` (a policy owns no filesystem read), `population: { of:
// "none" }` records that CSS is a ResourceHost fact population rather than a compiler one, and the single
// allowlist row becomes a NAME comparison against the generated file inside `evaluate` — one generated
// artifact is not an exception table, and there is no stale arm to keep because the resource itself refuses
// when the inventory cannot be built. The anchor guard is gone with the walk it guarded.
//
// WHERE A BROKEN RESOURCE REFUSES — not here (mirrors `server-layout.ts`'s header). A declared resource
// that comes back missing/empty/unresolved/malformed makes `resolveResourceDeclarations`
// (`lib/resource-declaration.ts:182`) THROW during the POPULATION phase, and the receipt phase withholds
// every consumer, both before `create`/`evaluate` run (guide §3's acquisition-refusal rule). This module owns no not-ready
// branch: it reads the CSS inventory through `readyResourceValue`, whose throw is an assertion that the
// runtime's own refusal already held.
//
// THE CARRIER / COORDINATE SPLIT (#2107 arm c, ruled 2026-09-12; guide §2.1). A functional color's own text
// carries parentheses, and the `@orb-waive` position grammar admits none — so until this commit the `fix`
// string below instructed a reader to write a marker that the parser rejects as `malformed`, and every
// `oklch(…)`/`rgb(…)` finding was PERMANENTLY UNWAIVABLE while reading like an ordinary one. The repair is
// neither a wider grammar nor a narrower subject: the whole value stays the CARRIER and is named in the
// MESSAGE, while the COORDINATE handed to `report.file` is the value's leading paren-free slice. `#ff0000`
// is already anchorable and keeps its whole self, so nothing that worked before loses precision.
//
// THE COST, CHECKED AND STATED (finding granularity = waiver granularity). A resource marker's carrier is
// exactly the NEXT LINE (`lib/ordinary-waiver.ts` `followingResourceCarrier`), and candidates are the
// findings in that carrier whose token equals the marker position. So two functional colors OF THE SAME
// FUNCTION on ONE authored line now share a coordinate and every marker over them is `over-broad` — a LOUD
// authority alarm, never a silent pass — where before they were unwaivable by paren anyway. Two colors of
// DIFFERENT functions on one line stay separately waivable, and so do two hex values. The pre-existing
// collision (the identical value twice on one line) is unchanged. The author's repair is to put the two
// declarations on separate lines, which the alarm names.
//
// POPULATION PORT — SET DIFFERENCES, MEASURED (standardization §2.1; lane cb-b-header-residue, 2026-09-13). Legacy
// `no-raw-color-in-css` descriptor at 5c55b1d9cf3f2330daf90519327ee72ea07d256d, the parent of the conversion
// `b32797507` (blob read from git with no working-tree plant: a `GateDescriptor`, no `defineGate`). Over the SAME
// 7,034 harness candidates at that tree (`git ls-tree` ∩ `_shared/ts-workspace.ts#harnessGlobs`), the legacy harness
// — no `scanRoot` — dispatched 7,034, and the final `population` admits 0; the subject is the declared
// `authored-css`. legacy − final = all 7,034 harness candidates — dispatched to the legacy `run`, which read none of
// them (its subject came off disk through `globSync("packages/{ui,client}/src/**/*.css")`); retired with that read.
// final − legacy = ∅. Controls: the legacy side is non-empty and the final side is empty by declaration, so equality
// cannot pass vacuously; outside `docs/__cbbhr_out_control.ts` rejected by both.
// OUTSIDE-CONTROL CAVEAT (verifier cb-v-header-residue): `docs/__cbbhr_out_control.ts` is rejected by `harnessGlobs`,
// not by the legacy descriptor — which has no path predicate of its own and admits it — so it proves only that
// neither side reaches outside the harness corpus, not that the legacy filter discriminates.
import { defineGate } from "../contract/policy.ts";
import { readyResourceValue } from "../lib/resource-declaration.ts";
import { waivableCoordinate } from "../lib/waivable-coordinate.ts";

const GENERATED_THEME = "packages/ui/src/styles/theme.css";
const MESSAGE =
  "raw color literal in CSS (UI-Architecture-and-Layout.md / D43) — use a var(--color-*) token or a token-derived relative color; raw literals live only in generated theme.css.";
/** The whole raw value, named in the MESSAGE because the position can no longer carry it. */
const valueMessage = (value: string): string => `${MESSAGE} Raw value: \`${value}\`.`;
const HEX_RE = /#[0-9a-fA-F]{3,8}\b/u;
const COLOR_FN_RE = /\b(?:rgb|rgba|hsl|hsla|oklch|oklab|lab|lch)\s*\(/u;

function withoutQuotedContent(value: string): string {
  let authored = "";
  let quote = "";
  let escaped = false;
  for (const char of value) {
    if (escaped) {
      escaped = false;
    } else if (quote !== "" && char === "\\") {
      escaped = true;
    } else if (quote !== "" && char === quote) {
      quote = "";
    } else if (quote === "" && (char === '"' || char === "'")) {
      quote = char;
    } else if (quote === "") {
      authored += char;
    }
  }
  return authored;
}

function rawColor(value: string): boolean {
  const authored = withoutQuotedContent(value);
  return HEX_RE.test(authored) || (COLOR_FN_RE.test(authored) && !authored.includes("var(--"));
}

/** The COORDINATE for one raw value, through the grammar's own shared reader. A value with no anchorable
 *  head at all REFUSES rather than reporting an unnameable finding. */
function valueCoordinate(value: string): string {
  const coordinate = waivableCoordinate(value);
  if (coordinate === undefined) {
    throw new Error(`raw color value has no anchorable coordinate: ${value}`);
  }
  return coordinate;
}

function valuePosition(text: string, declarationOffset: number, value: string): { readonly line: number; readonly column: number } {
  const offset = text.indexOf(value, declarationOffset);
  if (offset === -1) {
    throw new Error(`CSS declaration value has no exact authored position: ${value}`);
  }
  const before = text.slice(0, offset);
  const newline = before.lastIndexOf("\n");
  return { line: before.split(/\r?\n/u).length, column: offset - newline };
}

export const gate = defineGate({
  id: "no-raw-color-in-css",
  family: "no-raw-color-in-css",
  authority: "ordinary",
  severity: "error",
  population: { of: "none", why: "CSS is a ResourceHost fact population, never a compiler population" },
  analysis: "resource",
  execution: "entire-population",
  facts: [],
  resources: [{ kind: "authored-css" }],
  message: MESSAGE,
  fix:
    "use a var(--color-*) token or oklch(from var(--color-*) l c h / α). A deliberate site is waived with " +
    "`@orb-waive no-raw-color-in-css(<position>): <reason>` on the line above, where <position> is the value's " +
    "own text when it has no parenthesis (`#ff0000`) and its leading function name when it does (`oklch`) — the " +
    "waiver grammar admits no parenthesis, so the full value is in the finding's message rather than its position.",
  create: (ctx) => ({
    evaluate: () => {
      const inventory = readyResourceValue(ctx.resources.cssInventory("authored"));
      for (const declaration of inventory.declarations) {
        if (declaration.file !== GENERATED_THEME && rawColor(declaration.value)) {
          const source = inventory.files.find(({ path }) => path === declaration.file);
          if (source === undefined) {
            throw new Error(`CSS declaration has no source resource: ${declaration.file}`);
          }
          ctx.report.file(declaration.file, {
            ...valuePosition(source.text, declaration.offset, declaration.value),
            token: valueCoordinate(declaration.value),
            message: valueMessage(declaration.value),
          });
        }
      }
    },
  }),
  mustFlag: [
    {
      mode: "resource",
      files: {
        "packages/client/src/features/x/x.css": ".a {\n  color: #ff0000;\n}\n",
        "packages/ui/src/styles/clean.css": ".clean { color: var(--color-foreground); }\n",
      },
      expect: { count: 1, line: 2, token: "#ff0000", messageIncludes: "Raw value: `#ff0000`" },
      why: "one raw declaration produces one exact declaration finding, and a hex value is its own coordinate — the #2107 split costs a paren-free value nothing",
    },
    {
      mode: "resource",
      files: {
        "packages/client/src/styles/clean.css": ".clean { color: var(--color-foreground); }\n",
        "packages/ui/src/x/x.css": ".a { background: oklch(0.5 0.2 30); }\n",
      },
      expect: { count: 1, token: "oklch", messageIncludes: "Raw value: `oklch(0.5 0.2 30)`" },
      why: "raw functional color outside generated theme.css, WAIVABLE (#2107 arm c): the coordinate is the paren-free leading slice the marker grammar can hold, and the whole value is in the message. Before this split the position was `oklch(0.5 0.2 30)` and every marker naming it parsed malformed",
    },
  ],
  mustPass: [
    {
      mode: "resource",
      files: {
        "packages/client/src/styles/clean.css": ".clean { color: var(--color-foreground); }\n",
        "packages/ui/src/x/near.css": '/* #abc rgb(0 0 0) */\n.near { content: "#abc"; color: var(--color-foreground); }\n',
      },
      why: "comments, selector text, and content strings are not color declarations",
    },
    {
      mode: "resource",
      files: {
        "packages/client/src/styles/waived.css":
          ".waived {\n  /* @orb-waive no-raw-color-in-css(#ff0000): deliberate external brand color */\n  color: #ff0000;\n}\n",
        "packages/ui/src/styles/clean.css": ".clean { color: var(--color-foreground); }\n",
      },
      why: "one exact ordinary waiver suppresses one raw declaration finding",
    },
    {
      mode: "resource",
      files: {
        "packages/client/src/styles/clean.css": ".clean { color: var(--color-foreground); }\n",
        "packages/ui/src/styles/theme.css": ":root { --color-primary: oklch(0.7 0.1 250); }\n",
      },
      why: "generated theme.css is the exact authoritative raw-color source",
    },
    {
      mode: "resource",
      files: {
        "packages/client/src/styles/clean.css": ".clean { color: var(--color-foreground); }\n",
        "packages/ui/src/x/derived.css": ".a { color: oklch(from var(--color-primary) l c h / .5); }\n",
      },
      why: "token-derived relative color",
    },
  ],
  mustRefuse: [
    {
      mode: "resource",
      files: {
        "packages/client/src/styles/unanchorable.css": ".a {\n  color: (#ff0000);\n}\n",
        "packages/ui/src/styles/clean.css": ".clean { color: var(--color-foreground); }\n",
      },
      expect: { messageIncludes: "raw color value has no anchorable coordinate" },
      why: "a value whose FIRST character is a paren has no leading paren-free slice, so no coordinate the marker grammar can hold exists at all — the policy refuses loudly rather than minting a permanently unwaivable finding (#2160, ledger row 534)",
    },
  ],
});
