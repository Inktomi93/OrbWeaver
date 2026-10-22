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
