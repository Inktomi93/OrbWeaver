import { alternation } from "./syntax.ts";

const TRPC_ROUTE_PATTERN = String.raw`/^\*\*\/api\/trpc/`;

const PAGE_ROUTE_CALL = "CallExpression[callee.object.name='page'][callee.property.name='route']";

const TRPC_PAGE_ROUTES = [
  `${PAGE_ROUTE_CALL}[arguments.0.value=${TRPC_ROUTE_PATTERN}]`,
  `${PAGE_ROUTE_CALL}[arguments.0.expressions.length=0][arguments.0.quasis.0.value.cooked=${TRPC_ROUTE_PATTERN}]`,
  `${PAGE_ROUTE_CALL}[arguments.0.expression.value=${TRPC_ROUTE_PATTERN}]`,
];

const leadingCallStatements = (calls: readonly string[]): string =>
  `:matches(${calls
    .flatMap((call) => [
      `:matches(ExpressionStatement, ReturnStatement):has(> ${call})`,
      `:matches(ExpressionStatement, ReturnStatement):has(> AwaitExpression:has(> ${call}))`,
      `VariableDeclaration:has(> VariableDeclarator:has(> ${call}))`,
      `VariableDeclaration:has(> VariableDeclarator:has(> AwaitExpression:has(> ${call})))`,
    ])
    .join(", ")})`;

export const CT_SPEC_RESTRICTIONS = [
  {
    id: "testid-typed-only-stories",
  },
  {
    id: "route-trpc-lifo-order",
    selectors: [
      {
        selector: `${leadingCallStatements(TRPC_PAGE_ROUTES)} ~ ${leadingCallStatements(["CallExpression[callee.name='routeTrpc']"])}`,
        message:
          'A `page.route("**/api/trpc...")` registered before this routeTrpc never runs: Playwright resolves routes LIFO and routeTrpc answers every trpc request. Register the override after routeTrpc, or use trpcHold() and barrier on hold.requested.',
      },
    ],
  },
];

export const TEST_FABRICATION_RESTRICTIONS = [
  {
    id: "no-test-fabrication",
    selectors: [
      {
        selector: "TSAsExpression[typeAnnotation.type='TSAnyKeyword']",
        message: "An assertion to any erases the test contract; build a real value or keep deliberate invalid-input evidence beside its boundary.",
      },
      {
        selector: "TSAsExpression[expression.type='TSAsExpression'][expression.typeAnnotation.type='TSUnknownKeyword']",
        message: "An unknown double cast fabricates the target contract; build a real value or narrow it instead (D325).",
      },
    ],
  },
];

const APPEARANCE_CHANNEL_NAME = "/(?:data-appearance-|--appearance-)/";

export const TEST_APPEARANCE_RESTRICTIONS = [
  {
    id: "no-hand-typed-appearance-channel",
    selectors: [
      {
        selector: `:matches(Literal[raw=${APPEARANCE_CHANNEL_NAME}], TemplateElement[value.raw=${APPEARANCE_CHANNEL_NAME}])`,
        message:
          "A hand-typed appearance channel name: read the root attribute or property from `APPEARANCE_CHANNEL_ROWS` (`@orb/client/lib`), and the reduced-motion attribute from `APP_REDUCED_MOTION_ATTRIBUTE` (`@orb/ui/lib`), so the test follows the manifest.",
      },
    ],
  },
];

// An exported story mounts one of the testkit's named compositions at its root.
const STORY_ROOTS = ["CtIsolation", "CtClientProviders"];
const NOT_A_STORY_ROOT = `:matches(JSXElement:not([openingElement.name.name=${alternation(STORY_ROOTS)}]), JSXFragment)`;
const STORY_ROOT_MESSAGE =
  "An exported story mounts `CtIsolation` (a named primitive isolation) or `CtClientProviders` (the production providers, with `isolationRegistry` for a registry subset) at its root.";

export const CT_STORY_ROOT_RESTRICTIONS = [
  {
    id: "ct-story-root-composition",
    selectors: [
      {
        selector: `ExportNamedDeclaration > FunctionDeclaration > BlockStatement > ReturnStatement > ${NOT_A_STORY_ROOT}`,
        message: STORY_ROOT_MESSAGE,
      },
      {
        selector: `ExportNamedDeclaration > VariableDeclaration > VariableDeclarator > ArrowFunctionExpression > BlockStatement > ReturnStatement > ${NOT_A_STORY_ROOT}`,
        message: STORY_ROOT_MESSAGE,
      },
      {
        selector: `ExportNamedDeclaration > VariableDeclaration > VariableDeclarator > ArrowFunctionExpression > ${NOT_A_STORY_ROOT}`,
        message: STORY_ROOT_MESSAGE,
      },
    ],
  },
];

const SHELL_CLASS_TOKEN = String.raw`/(?:^|\s)shell-/`;

/** Hand-built shell DOM: a `shell-*` class, or a `data-slot` the app shell owns, spelled in a story outside the shell's own tests. */
export function shellDomSelectors(shellSlots: ReadonlySet<string>): readonly { selector: string; message: string }[] {
  return [
    {
      selector: `JSXAttribute[name.name='className'] :matches(Literal[value=${SHELL_CLASS_TOKEN}], TemplateElement[value.raw=${SHELL_CLASS_TOKEN}])`,
      message: "A story builds the shell by hand: mount the app shell's own surface (`tests/client/features/app-shell`) instead of spelling a `shell-*` class.",
    },
    {
      selector: `JSXAttribute[name.name='data-slot'][value.value=${alternation([...shellSlots].map((slot) => RegExp.escape(slot)))}]`,
      message: "A story builds the shell by hand: this `data-slot` belongs to the app shell, so mount its own component instead of repeating its DOM.",
    },
  ];
}
