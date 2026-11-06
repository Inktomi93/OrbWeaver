import { alternation } from "./syntax.ts";

const SERDE_CARD_MAPPERS = alternation(["cardContentHash", "cardFromJson", "buildCardV3"]);

const SERDE_CARD_HOME = "packages/server/src/primitives/serde/card/index.ts";

const SERDE_CARD_MESSAGE = `A second declaration of a serde-core card mapper; each of cardContentHash, cardFromJson and buildCardV3 is declared once, in ${SERDE_CARD_HOME}. Import it from #primitives/serde/card.`;

export const SERVER_HARD_RESTRICTIONS = [
  {
    id: "types-in-contract",
    selectors: [
      {
        selector: "Program:not(:has(:matches(ExportNamedDeclaration, ExportDefaultDeclaration) > TSInterfaceDeclaration))",
        message:
          "contract/service.ts must declare the exported <Feature>Service interface (the feature's typed API surface, Spine-TypeScript-and-Patterns.md §7.4).",
      },
    ],
  },
  {
    id: "serde-core-definition-uniqueness",
    selectors: [
      `ExportNamedDeclaration > FunctionDeclaration[id.name=${SERDE_CARD_MAPPERS}]`,
      `ExportNamedDeclaration > VariableDeclaration > VariableDeclarator[id.type='Identifier'][id.name=${SERDE_CARD_MAPPERS}]`,
    ].map((selector) => ({ selector, message: SERDE_CARD_MESSAGE })),
  },
];

export const DB_SCHEMA_RESTRICTIONS = [
  {
    id: "db-enum-from-tuple",
    selectors: [
      {
        selector: "Property:matches([key.name='enum'], [key.value='enum']) :matches(ArrayExpression, CallExpression)",
        message:
          "A Drizzle column enum derives from a named tuple (an @orb/contracts or @orb/kit export, or a local `as const satisfies` tuple), never an inline array or a call result (D34).",
      },
    ],
  },
];

const WIRE_OBJECT_MESSAGE =
  "A wire object refuses an undeclared key: write `z.strictObject`. A schema that parses stored, imported, model or guest data writes `z.object(...).strip()` under a one-line reason, or `z.looseObject` to keep unknown keys (Spine-TypeScript-and-Patterns.md, type law 1).";
// The mode check reads the `z` binding by name, so any other value spelling of zod would hide a call from it.
const ZOD_SPELLING_MESSAGE = 'Reach zod only as `import { z } from "zod"` and `z.<builder>(...)`, so the wire-object mode check sees every object call.';
const ZOD_SOURCE = String.raw`/^zod(\W.*)?$/`;
const OBJECT_MODE_METHODS = alternation(["strip", "strict", "loose", "passthrough", "catchall"]);
const DECLARED_CONSTRUCTORS = alternation(["strictObject", "looseObject"]);

const STRING_LITERAL_MEMBER = "TSLiteralType[literal.type='Literal'][literal.value=type(string)]";

export const TYPE_SHAPE_RESTRICTIONS = [
  {
    id: "no-inline-union-alias",
    selectors: [
      {
        // One-off two-state aliases such as `"ok" | "error"` are not axes worth homing; flagging them would price every result type as a defect.
        selector: `TSTypeAliasDeclaration > TSUnionType[types.length>=3]:not(:has(> :not(${STRING_LITERAL_MEMBER})))`,
        message:
          "A string-union axis is declared once as an `as const` tuple and the union derived with `(typeof X)[number]`, never re-spelled as an inline alias (Spine-TypeScript-and-Patterns.md §7.5).",
      },
    ],
  },
  {
    id: "wire-object-declares-mode",
    selectors: [
      {
        // `z.object(...).strip()` is the one spelling left: the call is the receiver of a called `.strip`.
        selector: `CallExpression[callee.object.name='z'][callee.property.name='object']:not(CallExpression > MemberExpression.callee[property.name='strip'] > CallExpression.object)`,
        message: WIRE_OBJECT_MESSAGE,
      },
      {
        selector: "MemberExpression[object.name='z'][property.name='object']:not(CallExpression > MemberExpression.callee)",
        message: `An uncalled \`z.object\` escapes the mode check at its call. ${WIRE_OBJECT_MESSAGE}`,
      },
      {
        selector: `CallExpression[callee.property.name=${OBJECT_MODE_METHODS}][callee.object.type='CallExpression']:matches([callee.object.callee.property.name='strip'], [callee.object.callee.object.name='z'][callee.object.callee.property.name=${DECLARED_CONSTRUCTORS}])`,
        message: "A declared object mode is re-declared by a later mode method: keep the one the constructor or `.strip()` states.",
      },
      {
        selector: `ImportDeclaration[source.value=${ZOD_SOURCE}][importKind!='type'] > :matches(ImportDefaultSpecifier, ImportNamespaceSpecifier, ImportSpecifier[importKind!='type']:not([imported.name='z'][local.name='z']))`,
        message: ZOD_SPELLING_MESSAGE,
      },
      { selector: "MemberExpression[object.name='z'][computed=true]", message: ZOD_SPELLING_MESSAGE },
      { selector: "VariableDeclarator[init.type='Identifier'][init.name='z']", message: ZOD_SPELLING_MESSAGE },
    ],
  },
];
