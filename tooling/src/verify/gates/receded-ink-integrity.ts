// Gate: receded-ink-integrity — `RECEDED_INK` carried behind a Tailwind VARIANT (`hover:${RECEDED_INK}`,
// `md:${RECEDED_INK}`, `group-hover:${RECEDED_INK}`) states nothing about REST, which is the only state the
// recession ruling is about, so the composite silently stops receding while still importing the constant
// that says it does (#1257; the contract is `packages/ui/src/lib/receded-ink.ts`'s own header, in as many
// words: "USE IT UNPREFIXED, on the composite's own control. Unprefixed is load-bearing").
// ARMS: ONE — a reference to the imported `RECEDED_INK` binding that sits in a template span whose
// preceding literal chunk ends in a variant colon. · DECLARED LIMITS, each a mustPass row: (a) an
// OVERRIDE — a later `text-*` ink in the same class string, which tailwind-merge would win — is NOT judged
// here and cannot be without a theme-ink vocabulary this runtime does not expose (see the header note
// below); (b) a bare literal `hover:text-muted-foreground` authored without the constant is outside the
// population by design — this policy judges the CONSTANT'S contract, not the colour; (c) a variant applied
// through `cn()`/a variant prop rather than a template prefix is invisible to a syntax reader.
//
// WHY THE OVERRIDE ARM IS ABSENT AND NOT MERELY UNBUILT. `${RECEDED_INK} text-foreground` erases the
// recession because tailwind-merge keeps the LAST member of a conflict group — but deciding that a later
// `text-*` token is an INK rather than a SIZE needs tailwind-merge's own group table, and the house type
// scale spells its sizes `text-display` / `text-label` / `text-micro`, i.e. exactly like a colour. A
// hardcoded colour allowlist in this policy would go blind the day a theme mints an ink, which is the
// spelling-shaped blind spot the program exists to stop. Measured on the tree at 3a1888c4b: zero of the
// ten consumers carries a later `text-*` of any kind, so nothing is parked — the arm is UNDECIDABLE here,
// not deferred debt, and it is stated so a later reader does not read this policy as covering it.
//
// FAMILY: tailwind-class-token, tooling/src/verify/lib/tailwind-class-token.ts#readTailwindClassTokens —
// consumed in the production hook to read the variant segments off the authored token, the same reader
// `no-hover-display-swap` and `no-banned-tw-utility` use for the same question. The variant split is not
// re-implemented here: an arbitrary variant (`[&:hover]:`) carries a colon inside brackets and a private
// `split(":")` would mis-read it.
//
// POPULATION: `["@client", "@ui"]` — the constant's two possible homes (`@orb/ui/lib` declares it; every
// consumer measured 2026-09-19 is under `packages/client/src`). New policy, so there is no legacy port;
// the fence is the IMPORT, not the path: a file that never imports the binding contributes nothing.
// RETIRED MARKERS: none — new policy, no legacy owner, no marker grammar to translate.
import type { SourceFile } from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";
import { defineGate } from "../contract/policy.ts";
import { MEMBER_ACCESS_KINDS, namespaceImportSpecifier, readMemberAccess } from "../lib/symbol-reference.ts";
import { readTailwindClassTokens } from "../lib/tailwind-class-token.ts";

const RECEDED_INK = "RECEDED_INK";

const MESSAGE =
  "`RECEDED_INK` is carried behind a Tailwind variant, so it states nothing about the control's REST " +
  "state — and rest is the only state the recession ruling is about (#1249/#1257). The composite still " +
  "imports the constant that says 'this control recedes' while rendering at its host surface's full ink " +
  "until the variant engages. See packages/ui/src/lib/receded-ink.ts's header for the whole fork.";

const FIX =
  "carry `RECEDED_INK` UNPREFIXED on the composite's own control and let the variant classes beside it " +
  "(`ACCENT_HOVER`, a selected arm) win their own more-specific contest — that is the shape the constant " +
  "was minted for. If this control genuinely must recede only in a variant state, it is not asking for " +
  "the recession contract at all: author the colour directly. Waivable at the reported position with " +
  "`// @orb-waive receded-ink-integrity(RECEDED_INK): <why rest is not the state this control recedes in>`.";

/** The fixture's own `${RECEDED_INK}` template span, COMPOSED rather than written inline: a literal `${`
 *  inside an ordinary string reds biome's `noTemplateCurlyInString`, and the placeholder below belongs to
 *  the FIXTURE's source text, not to this module's. Eight rows would otherwise each carry a suppression. */
const SPAN = `\${${RECEDED_INK}}`;
const FIXTURE_IMPORT = `import { ${RECEDED_INK} } from "@orb/ui/lib";\n`;
/** The same fixture one import spelling over — no `ImportSpecifier`, no bare identifier. */
const NAMESPACE_IMPORT = 'import * as ui from "@orb/ui/lib";\n';
const NAMESPACE_SPAN = `\${ui.${RECEDED_INK}}`;

/** One fixture whose `className` is a TEMPLATE carrying `classText` — the only shape this policy can flag,
 *  so every catch row and most near-miss rows are one call here with a different class string. */
function templateFixture(classText: string, prelude = ""): string {
  return `${FIXTURE_IMPORT}${prelude}export const T = <button className={\`${classText}\`} type="button" />;\n`;
}

/** Does this file import the `RECEDED_INK` binding at all? The population fence is the IMPORT rather than
 *  the path: `@client`/`@ui` is thousands of files and exactly ten of them consume the contract, so a file
 *  that never binds the name cannot violate it. Syntax-only by construction — the import declaration's own
 *  named bindings, never a resolved symbol. */
function importsRecededInk(sourceFile: SourceFile): boolean {
  return sourceFile.getImportDeclarations().some((declaration) => declaration.getNamedImports().some((named) => named.getName() === RECEDED_INK));
}

/** The variant prefix, read off the AUTHORED token rather than guessed. The identifier sits inside a
 *  template span; the chunk of literal text immediately before that span is the token's head, and
 *  `readTailwindClassTokens` splits it into variants and a terminal with the arbitrary-variant bracket
 *  depth respected. `hover:${RECEDED_INK}` leaves the head's LAST token as `hover:` — a token whose
 *  terminal is empty and whose variants are non-empty, which is precisely "a prefix awaiting a utility". */
function precedingVariants(head: string): readonly string[] {
  const tokens = readTailwindClassTokens(head);
  const last = tokens.at(-1);
  // The reader strips the node's opening delimiter and its `${` closer, so the authored class text is
  // `head.slice(1, -2)`; the constant is PREFIXED only when that text ends with the last token, i.e. no
  // whitespace separates them. A head ending in whitespace (`"max-w-full ${…}"`) starts a new token.
  if (last === undefined || !head.slice(1, -2).endsWith(last.token)) {
    return [];
  }
  return last.terminal === "" ? last.variants : [];
}

/** WHERE THE REPORTED TOKEN SITS IN `node`, or undefined when `node` is not a `RECEDED_INK` reference at
 *  all — the policy's whole subject test, in EITHER import spelling (#2497).
 *
 *  It shipped keyed on a bare `Identifier` plus `getNamedImports()`, which is the #1506 namespace hole in
 *  its simplest form: `import * as ui from "@orb/ui/lib"` produces no `ImportSpecifier` (so the file read as
 *  "does not import it") AND binds no identifier named `RECEDED_INK` (so the template span held a member
 *  read the visitor never matched). Both halves had to go for the spelling to bite, and the
 *  `gate-spelling-twins` census named it the first time the instrument battery ran after this policy landed.
 *
 *  The OFFSET is why this returns a number rather than a boolean: the reported node is the whole reference,
 *  and in the namespace spelling the token starts inside it (`ui.RECEDED_INK`), so a fixed `offset: 0` would
 *  anchor the finding on the namespace binding and fail the report's own token/offset invariant.
 *
 *  The namespace arm does not constrain the MODULE, exactly as the named arm does not: this policy's fence
 *  has always been the imported NAME (see `importsRecededInk`), and matching any namespace import is the
 *  widening direction — it cannot hide a violation, and a same-named LOCAL constant is still not a
 *  namespace member, so the declared-limit row below keeps its meaning. */
function recededInkTokenOffset(node: Node, sourceFile: SourceFile): number | undefined {
  if (Node.isIdentifier(node)) {
    return node.getText() === RECEDED_INK && importsRecededInk(sourceFile) ? 0 : undefined;
  }
  // The NAME is checked before the import walk: these kinds are every member access in @client + @ui.
  const read = readMemberAccess(node);
  if (read?.name !== RECEDED_INK || namespaceImportSpecifier(read.receiver) === undefined) {
    return;
  }
  const offset = node.getText().lastIndexOf(RECEDED_INK);
  return offset < 0 ? undefined : offset;
}

export const gate = defineGate({
  id: "receded-ink-integrity",
  family: "tailwind-class-token",
  authority: "ordinary",
  severity: "error",
  population: ["@client", "@ui"],
  analysis: "syntax",
  execution: "selected-files",
  facts: [],
  resources: [],
  message: MESSAGE,
  fix: FIX,
  create: (ctx) => ({
    visitors: [
      {
        kinds: [SyntaxKind.Identifier, ...MEMBER_ACCESS_KINDS],
        visit: (node, sourceFile) => {
          const tokenOffset = recededInkTokenOffset(node, sourceFile);
          if (tokenOffset === undefined) {
            return;
          }
          // NO `=== undefined` GUARD: ts-morph types an Identifier's parent as present (only a SourceFile
          // has none), so the check is unreachable and `@typescript-eslint/no-unnecessary-condition` reds it.
          const span = node.getParent();
          if (!Node.isTemplateSpan(span) || span.getExpression() !== node) {
            return; // a bare `className={RECEDED_INK}` or a record field: no authored prefix is possible
          }
          const template = span.getParent();
          if (!Node.isTemplateExpression(template)) {
            return;
          }
          const spans = template.getTemplateSpans();
          const index = spans.indexOf(span);
          // `getText()`, never `getLiteralText()`: `readTailwindClassTokens` is documented to take the
          // AUTHORED node text WITH its one-character opening delimiter and strips it, so handing it the
          // cooked literal eats the token's first character and its trailing colon — measured, `hover:`
          // came back as the single token `over`. A TemplateHead reads `` `x${ `` and a TemplateMiddle
          // `}x${`; the reader's own two-character close handles both.
          const head = index === 0 ? template.getHead().getText() : (spans[index - 1]?.getLiteral().getText() ?? "");
          if (precedingVariants(head).length === 0) {
            return;
          }
          ctx.report.node(node, { token: RECEDED_INK, offset: tokenOffset });
        },
      },
    ],
  }),
  mustFlag: [
    {
      mode: "source",
      files: { "packages/client/src/features/a/hover-prefixed.tsx": templateFixture(`hover:${SPAN}`) },
      expect: { count: 1, token: RECEDED_INK },
      why: "THE FOUNDING SHAPE: a variant-prefixed constant says nothing about rest, which is the only state the recession ruling is about",
    },
    {
      mode: "source",
      files: { "packages/ui/src/primitives/a/responsive-prefixed.tsx": templateFixture(`md:${SPAN}`) },
      expect: { count: 1, token: RECEDED_INK },
      why: "the SECOND population member (@ui) and a NON-hover variant — the rule is about any prefix, not about hover; cutting the @ui half of the population kills this row",
    },
    {
      mode: "source",
      files: { "packages/client/src/features/a/arbitrary-variant.tsx": templateFixture(`[&:hover]:${SPAN}`) },
      expect: { count: 1, token: RECEDED_INK },
      why: 'THE SHARED-READER PROOF: an arbitrary variant carries a colon INSIDE brackets, so a private `split(":")` would mis-read it — this row dies if the policy stops using readTailwindClassTokens',
    },
    {
      mode: "source",
      files: { "packages/client/src/features/a/mid-string-prefixed.tsx": templateFixture(`min-w-0 group-hover:${SPAN}`) },
      expect: { count: 1, token: RECEDED_INK },
      why: "the prefix is the LAST token of the preceding chunk, not the whole chunk — a head-only read would miss every real call site, which authors layout classes first",
    },
    {
      mode: "source",
      files: {
        "packages/client/src/features/a/namespace-prefixed.tsx": `${NAMESPACE_IMPORT}export const T = <button className={\`hover:${NAMESPACE_SPAN}\`} type="button" />;\n`,
      },
      expect: { count: 1, token: RECEDED_INK },
      why: "THE NAMESPACE SPELLING of the founding row (#2497) — the same violation with no `ImportSpecifier` and no bare `RECEDED_INK` identifier. This policy shipped blind to it and `tests/tooling/gate-spelling-twins.int.test.ts` said so; reverting either half of `recededInkTokenOffset` (the member-access kinds, or the namespace receiver check) kills this row while every row above stays green.",
    },
  ],
  mustPass: [
    {
      mode: "source",
      files: {
        "packages/client/src/features/a/hover-prefixed-waived.tsx": templateFixture(
          `hover:${SPAN}`,
          `// @orb-waive receded-ink-integrity(${RECEDED_INK}): rest is not the state this control recedes in — it recedes only while hovered, by design.\n`,
        ),
      },
      why: "§4.2 IDENTITY, on the founding `mustFlag` row's exact fixture: the correct ordinary waiver at the reported position — the imported binding — suppresses the one finding it produces. Nothing else proves the report's policy id and position are what the central engine binds a waiver to.",
    },
    {
      mode: "source",
      files: { "packages/client/src/features/a/bare.tsx": `${FIXTURE_IMPORT}export const T = <button className={${RECEDED_INK}} type="button" />;\n` },
      why: "THE SANCTIONED SHAPE — the bare identifier, which is what all ten live consumers author",
    },
    {
      mode: "source",
      files: {
        "packages/client/src/features/a/composed.tsx": templateFixture(`${SPAN} \${ROW_REVEAL}`, 'const ROW_REVEAL = "opacity-0 group-hover:opacity-100";\n'),
      },
      why: "row-actions-menu.tsx's real shape: the constant leads and a VARIANT-carrying sibling class follows it — the variant belongs to the other utility, not to the ink, and reading the FOLLOWING chunk instead of the preceding one would red this",
    },
    {
      mode: "source",
      files: { "packages/client/src/features/a/trailing.tsx": templateFixture(`max-w-full justify-start ${SPAN}`) },
      why: "corpus-hit-rows.tsx's real shape: layout classes then the ink, whitespace-separated — the head ends in whitespace, so the constant starts its own token",
    },
    {
      mode: "source",
      files: {
        "packages/client/src/features/a/record-field.tsx": `${FIXTURE_IMPORT}export const P = { off: { restingInk: ${RECEDED_INK} }, on: { restingInk: undefined } };\n`,
      },
      why: "character-filter-rail-parts.tsx's real shape: the constant as a RECORD FIELD, later spread into `cn()` — no authored prefix is possible at this position",
    },
    {
      mode: "source",
      files: { "packages/client/src/features/a/override.tsx": templateFixture(`${SPAN} text-foreground`) },
      why: "DECLARED LIMIT (a): a later ink WOULD win tailwind-merge and erase the recession, and this policy does not judge it — deciding ink-vs-size needs tailwind-merge's group table, and the house type scale spells its SIZES `text-display`/`text-label`/`text-micro`. Stated so the gate is not read as covering the override class; zero live sites today",
    },
    {
      mode: "source",
      files: { "packages/client/src/features/a/literal-colour.tsx": 'export const T = <button className="hover:text-muted-foreground" type="button" />;\n' },
      why: "DECLARED LIMIT (b): the same COLOUR authored as a literal, with no import — this policy judges the CONSTANT'S contract, not the colour, and the import fence is what keeps it off #969's 444 legitimate transparent-intent sites",
    },
    {
      mode: "source",
      files: {
        "packages/client/src/features/a/other-const.tsx": `const ${RECEDED_INK} = "text-muted-foreground";\nexport const T = <button className={\`hover:${SPAN}\`} type="button" />;\n`,
      },
      why: "the import fence is REAL: a same-named LOCAL constant is a different contract and is not this policy's subject — deleting `importsRecededInk` reds this row",
    },
  ],
});
