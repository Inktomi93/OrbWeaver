// Policy: no-raw-intl-time (Spine-TypeScript-and-Patterns.md) — time is epoch-ms UTC everywhere and is
// rendered through ONE memoized seam. Two arms, two operations:
//   · `tolocale` — a bare `.toLocaleDateString/String/TimeString()` rebuilds an Intl formatter per call, is
//     locale/tz-inconsistent with every `@orb/kit/time` site, and is unpinnable by the injected clock/locale
//     test discipline;
//   · `intl-formatter` — a raw `Intl.DateTimeFormat`/`Intl.RelativeTimeFormat` bypasses the one seam for time
//     display and zone resolution.
//
// AUTHORITY IS reviewed-grant. `@orb/kit/time` IS the memoized Intl seam — `createTimeLib` constructs the
// formatters it hands every call site — so the home is a recurring repository PERMISSION, SCANNED and
// licensed by an exact `(subject, operation)` row in `lib/reviewed-grants.ts`, not subtracted from the
// corpus. The legacy module carried a DIRECTORY row plus its own rename tripwire; the central row is
// stronger, because a home that stops making the licensed construction stales its row instead of silently
// keeping a directory exemption alive.
//
// IDENTITY, NOT SPELLING. `Intl` was matched by the receiver's TEXT, so a const alias walked past it and a
// project object named `Intl` red; the `.toLocale*` arm matched a method NAME on any receiver, so a project
// interface with a `toLocaleString` method was the offense. Both are resolved now: the ambient global
// through `resolveGlobalMemberOrigin`, and the `.toLocale*` method through the property symbol's declaration
// home — TypeScript's own bundled `lib.*.d.ts`, which is what makes the call the ECMAScript formatter at all.
import type { Node as MorphNode } from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";
import { defineGate } from "../contract/policy.ts";
import { classifyOriginRefusal } from "../lib/origin-verdict.ts";
import { classifyPackageMemberOrigin } from "../lib/project-home-origin.ts";
import { resolveGlobalMemberOrigin } from "../lib/reference-fact.ts";
import type { ReviewedGrantCandidate } from "../lib/reviewed-grant-findings.ts";
import { reportReviewedGrantCandidates } from "../lib/reviewed-grant-findings.ts";

const INTL = "Intl";
const FORMATTERS: ReadonlySet<string> = new Set(["DateTimeFormat", "RelativeTimeFormat"]);
const TO_LOCALE: ReadonlySet<string> = new Set(["toLocaleDateString", "toLocaleString", "toLocaleTimeString"]);
/** TypeScript's own `node_modules` directory: `Date#toLocaleDateString` and friends are declared in its
 *  bundled `lib.*.d.ts`, and that declaration is the whole identity claim behind "this is Intl by the back
 *  door". A project method of the same name is a different symbol entirely. */
const AMBIENT_HOME = "typescript";
const OPERATIONS = { toLocale: "tolocale", intlFormatter: "intl-formatter" } as const;

const MESSAGE =
  "raw Intl API or `.toLocale*()` date formatting — Intl by the back door. A bare `.toLocaleDateString/" +
  "String/TimeString()` is un-memoized (it rebuilds an Intl formatter per call), locale/tz-inconsistent with " +
  "every @orb/kit/time site, and unpinnable by the injected-clock/locale test discipline; a raw " +
  "`Intl.DateTimeFormat`/`Intl.RelativeTimeFormat` bypasses the one seam for time display and zone " +
  "resolution. Time is epoch-ms UTC everywhere, rendered through one helper (Spine-TypeScript-and-Patterns.md).";
const UNREADABLE =
  "this expression is spelled like a raw Intl formatter or a `.toLocale*` call, but the shared readers cannot place its binding, so whether it is the ECMAScript api CANNOT be established. Reported rather than passed: the spelling alone is not the identity.";
const FIX =
  "use @orb/kit/time's createTimeLib — client: timeLib.formatDate/formatDateTime/formatTime/formatRelative; the seam's own construction is licensed by an exact reviewed grant.";

/** The member name a node reads, across dotted and computed-literal spellings. */
function memberName(node: MorphNode): string | null {
  let name: string | null = null;
  if (Node.isPropertyAccessExpression(node)) {
    name = node.getName();
  }
  if (Node.isElementAccessExpression(node)) {
    const argument = node.getArgumentExpression();
    const literal = argument !== undefined && (Node.isStringLiteral(argument) || Node.isNoSubstitutionTemplateLiteral(argument));
    name = literal ? argument.getLiteralText() : null;
  }
  return name;
}

type IntlVerdict = "intl" | "other" | "unreadable";

/** Is this member read `Intl.<Formatter>` — the AMBIENT global, under any receiver spelling? */
function intlVerdict(node: MorphNode): IntlVerdict {
  const global = resolveGlobalMemberOrigin(node);
  if (global.kind === "resolved") {
    const { globalName, memberPath } = global.value;
    return globalName === INTL && memberPath.length === 1 ? "intl" : "other";
  }
  return classifyOriginRefusal(global.reason, node);
}

/** The kit time seam AS IT IS — it constructs the formatter, which is the licensed occurrence. Only the row
 *  that proves the home reds carries it; a `mustPass` row carrying it would be asserting the opposite. */
const TIME_HOME_PROOF = {
  "packages/kit/src/time/index.ts": "export const createTimeLib = (): unknown => new Intl.DateTimeFormat('en-US');\n",
};
/** The seam's DOOR without its construction, for rows whose subject is a call site importing it — a
 *  specifier that resolved to nothing would make the row pass by fail-closure rather than by identity. */
const TIME_DOOR_PROOF = { "packages/kit/src/time/index.ts": "export declare function createTimeLib(): unknown;\n" };

export const gate = defineGate({
  id: "no-raw-intl-time",
  family: "no-raw-intl-time",
  authority: "reviewed-grant",
  severity: "error",
  // The legacy `scanRoot` admitted everything (`(_p) => true`) over the nine-root harness corpus, which is
  // exactly `@authored`. The kit time home is NOT subtracted — it is a grant.
  population: "@authored",
  analysis: "types",
  execution: "entire-population",
  facts: [],
  resources: [],
  message: MESSAGE,
  fix: FIX,
  create: (ctx) => {
    const candidates: ReviewedGrantCandidate[] = [];
    const push = (found: {
      readonly node: MorphNode;
      readonly sourceFile: import("ts-morph").SourceFile;
      readonly operation: string;
      readonly token: string;
      readonly unreadable: boolean;
    }): void => {
      const { node, sourceFile, operation, token, unreadable } = found;
      candidates.push({
        node,
        subject: ctx.relativePath(sourceFile),
        operation,
        unreadable,
        token,
        offset: Math.max(node.getText().lastIndexOf(token), 0),
      });
    };
    return {
      visitors: [
        {
          // The `Intl.<Formatter>` arm: any member read whose leaf is a formatter name is a candidate, and
          // the resolved global says whether the receiver is really `Intl`.
          kinds: [SyntaxKind.PropertyAccessExpression, SyntaxKind.ElementAccessExpression],
          visit: (node, sourceFile): void => {
            const name = memberName(node);
            if (name === null || !FORMATTERS.has(name)) {
              return;
            }
            const verdict = intlVerdict(node);
            if (verdict !== "other") {
              push({ node, sourceFile, operation: OPERATIONS.intlFormatter, token: name, unreadable: verdict === "unreadable" });
            }
          },
        },
        {
          kinds: [SyntaxKind.CallExpression],
          visit: (node, sourceFile): void => {
            if (!Node.isCallExpression(node)) {
              return;
            }
            const callee = node.getExpression();
            const name = memberName(callee);
            if (name === null || !TO_LOCALE.has(name)) {
              return;
            }
            const verdict = classifyPackageMemberOrigin(callee, [AMBIENT_HOME]);
            if (verdict !== "other") {
              push({ node: callee, sourceFile, operation: OPERATIONS.toLocale, token: name, unreadable: verdict === "unreadable" });
            }
          },
        },
      ],
      evaluate: (): void => {
        reportReviewedGrantCandidates(ctx.report, candidates, { message: MESSAGE, fix: FIX, unreadableMessage: UNREADABLE });
      },
    };
  },
  mustFlag: [
    {
      mode: "types",
      files: {
        ...TIME_HOME_PROOF,
        "packages/client/src/comp.tsx": "export function Foo(): unknown {\n  return new Intl.DateTimeFormat('en-US');\n}\n",
      },
      expect: { count: 2 },
      why: "the founding `intl-formatter` shape in a feature, plus the kit time home's own construction — THE PERMISSION IS NOT A CARVE-OUT: the seam reds like any other file and is licensed by an exact grant row",
    },
    {
      mode: "types",
      files: {
        "packages/client/src/comp.tsx": "export function Foo(): string {\n  return new Date().toLocaleDateString();\n}\n",
      },
      expect: { count: 1, token: "toLocaleDateString" },
      why: "the founding `tolocale` shape — an un-memoized per-call formatter that drifts from every kit/time site",
    },
    {
      mode: "types",
      files: {
        "packages/client/src/alias.ts": "const I = Intl;\nexport const f = (): unknown => new I.DateTimeFormat('en-US');\n",
      },
      expect: { count: 1 },
      why: "A CONST ALIAS of the ambient global is the same formatter one binding away; the legacy receiver-TEXT check (`getText() === \"Intl\"`) was offered `I` and answered 'not my subject'",
    },
    {
      mode: "types",
      files: {
        "packages/client/src/computed.ts": 'export const f = (): unknown => new Intl["RelativeTimeFormat"]("en");\n',
      },
      expect: { count: 1 },
      why: "the COMPUTED-LITERAL member spelling of the same formatter (#1506), invisible to the legacy PropertyAccess-only arm",
    },
    {
      mode: "types",
      files: {
        "packages/client/src/both.ts": "export function f(d: Date): string {\n  return d.toLocaleTimeString() + d.toLocaleDateString();\n}\n",
      },
      expect: { count: 1 },
      why: "GRANT GRANULARITY: two `.toLocale*` calls in one file are ONE `(subject, operation)` finding, because a row matching both would be OVER-BROAD and would license neither",
    },
  ],
  mustPass: [
    {
      mode: "types",
      files: {
        ...TIME_DOOR_PROOF,
        "packages/client/src/ok.ts": 'import { createTimeLib } from "../../kit/src/time/index.ts";\nexport const f = (): unknown => createTimeLib();\n',
      },
      why: "the fix: the call site reads through the memoized kit seam and constructs nothing. The seam's DOOR is planted so the specifier really resolves — an unresolvable import would make this row pass by fail-closure instead of by identity",
    },
    {
      mode: "types",
      files: {
        "packages/client/src/local.ts": "interface Money {\n  toLocaleString(): string;\n}\nexport const f = (m: Money): string => m.toLocaleString();\n",
      },
      why: "SAME METHOD NAME, PROJECT TYPE: an interface declaring its own `toLocaleString` is not the ECMAScript formatter — the legacy name-only arm red it, and only the declaring lib can say otherwise",
    },
    {
      mode: "types",
      files: {
        "packages/client/src/shadow.ts": "const Intl = {\n  DateTimeFormat: class {},\n};\nexport const f = (): unknown => new Intl.DateTimeFormat();\n",
      },
      why: "A LOCAL BINDING named `Intl` proves a DIFFERENT identity (case (a) of the refusal classifier) — the legacy receiver-text check red exactly this",
    },
    {
      mode: "types",
      files: {
        "packages/client/src/number.ts": "export const f = (n: number): unknown => new Intl.NumberFormat('en-US').format(n);\n",
      },
      why: "`Intl.NumberFormat` is not a TIME formatter and is out of subject — number formatting has its own home (`@orb/kit/strings`), and this policy's vocabulary is exact",
    },
  ],
});
