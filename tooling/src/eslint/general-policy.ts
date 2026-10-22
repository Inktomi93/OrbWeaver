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

const STRING_LITERAL_MEMBER = "TSLiteralType[literal.type='Literal'][literal.value=type(string)]";

export const TYPE_SHAPE_RESTRICTIONS = [
  {
    id: "no-inline-union-alias",
    selectors: [
      {
        selector: `TSTypeAliasDeclaration > TSUnionType[types.length>=3]:not(:has(> :not(${STRING_LITERAL_MEMBER})))`,
        message:
          "A string-union axis is declared once as an `as const` tuple and the union derived with `(typeof X)[number]`, never re-spelled as an inline alias (Spine-TypeScript-and-Patterns.md §7.5).",
      },
    ],
  },
];
