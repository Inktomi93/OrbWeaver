import { alternation, DIRECT_CLASS_LITERAL_TEMPLATE, MATCH_MEDIA, TANSTACK_FORM_MINTS } from "./syntax.ts";
export const UI_FEATURE_RESTRICTIONS = [
  {
    id: "class-token-splice",
    selectors: [
      {
        selector: `${DIRECT_CLASS_LITERAL_TEMPLATE}:matches([quasis.0.value.cooked=/\\S$/][expressions.0.value=/^\\S/], [expressions.0.value=/\\S$/][quasis.1.value.cooked=/^\\S/])`,
        message: "A literal interpolation splits a class token; spell the complete class as one source literal.",
      },
    ],
  },
  {
    id: "no-raw-zustand-persist",
    selectors: [
      {
        selector: "ImportDeclaration[source.value='zustand/middleware'] > ImportSpecifier[imported.name='persist']",
        message:
          "Raw zustand `persist` outside its sealed homes — partialize / version+total-migrate / key uniqueness are baked into `createEntityDraftStore` / `createPersistedStore` (UI-Gates-and-Lessons.md §11.5).",
      },
      {
        selector: "ExportNamedDeclaration[source.value='zustand/middleware'] > ExportSpecifier[local.name='persist']",
        message: "Raw zustand `persist` re-exported outside its sealed homes (UI-Gates-and-Lessons.md §11.5).",
      },
      {
        selector:
          "CallExpression[callee.property.name='setState'][arguments.1.value=true]:has(> CallExpression.arguments[callee.property.name='getInitialState'])",
        message:
          "`setState(store.getInitialState(), true)` on a persist-minted store writes the emptied state through to durable storage; it belongs to the two mint factories, whose `reset` closures the durable-local registry drives behind the storage blindfold.",
      },
    ],
  },
  {
    // The registry's own `reset()` may only run in the function that installs the storage blindfold.
    id: "no-raw-zustand-persist-registry",
    selectors: [
      {
        selector: "CallExpression[callee.property.name='reset']:not(FunctionDeclaration[id.name='resetWithoutPersisting'] CallExpression)",
        message:
          "A registered store's `reset()` inside the durable-local registry may only run from `resetWithoutPersisting`, which blindfolds the store's storage first — anywhere else writes the cleared state to durable storage.",
      },
    ],
  },
  {
    id: "no-direct-useform",
    selectors: [
      {
        selector: `ImportDeclaration[source.value='@tanstack/react-form'] > ImportSpecifier[imported.name=${alternation(TANSTACK_FORM_MINTS)}]`,
        message:
          "TanStack Form's raw mint is used outside the shared form toolkit — use `useAppForm` (and `withForm` / `withFieldGroup`) from `#forms/editor`; the raw mints bypass the bound @orb/ui Field components.",
      },
      {
        selector: `CallExpression[callee.type='MemberExpression'][callee.property.name=${alternation(TANSTACK_FORM_MINTS)}]`,
        message: "TanStack Form's raw mint is called through a namespace outside the shared form toolkit — use `useAppForm` from `#forms/editor`.",
      },
    ],
  },
  {
    id: "no-raw-matchmedia",
    selectors: [
      {
        selector: `CallExpression:matches([callee.name='${MATCH_MEDIA}'], [callee.property.name='${MATCH_MEDIA}'], [callee.property.value='${MATCH_MEDIA}']) > :matches(Literal[value=type(string)], TemplateLiteral)`,
        message:
          "A media query spelled at a `matchMedia` call; read it from `MEDIA_QUERIES` (`@orb/ui/tokens`), the one home the generated `@custom-variant` rules share.",
      },
    ],
  },
  {
    id: "fetch-fn-in-features",
    globals: [
      {
        name: "fetch",
        message:
          "A client feature never writes `fetch(` — HTTP-route egress gets ONE data/ fetch fn each (beside upload-asset.ts / auth-session.ts / post-bug-report.ts), imported via #data; everything else is tRPC (client-architecture-state-and-gates.md §10/§16 R5).",
      },
    ],
    selectors: [
      {
        selector:
          "CallExpression[callee.type='MemberExpression'][callee.object.name=/^(globalThis|window|self)$/]:matches([callee.property.name='fetch'], [callee.property.value='fetch'])",
        message: "A client feature never writes `fetch(` — use the data/ fetch fn for the route, or tRPC (client-architecture-state-and-gates.md §10/§16 R5).",
      },
    ],
  },
  {
    id: "windowed-infinite-query",
    selectors: [
      {
        selector: `Property:matches([key.type='Identifier'][key.name='maxPages'], [key.type='Literal'][key.value='maxPages'])`,
        message:
          "`maxPages` windows an infinite query's cache: evicted head pages cannot be re-fetched and a client lens searches only the window. Delete the cap and push search, sort and filter server-side onto the keyset (client-architecture-lockdown.md).",
      },
    ],
  },
  {
    id: "dialog-via-composite",
    selectors: [
      {
        selector: "ImportDeclaration[source.value='@orb/ui/dialog'] > ImportSpecifier[imported.name='Dialog']",
        message: "A features/** file imports the raw `Dialog` root from @orb/ui/dialog — use FormDialog for a form/prompt or ConfirmDialog for an alert.",
      },
    ],
  },
  {
    id: "no-raw-interactive-intrinsics",
    selectors: [
      {
        selector: `JSXOpeningElement[name.type='JSXIdentifier'][name.name=${alternation(["button", "input", "select", "textarea"])}]`,
        message:
          "A raw interactive intrinsic in a feature (D62) — interactivity comes from an @orb/ui primitive (Button, TextField, Select, TextArea, Link), never a hand-rolled <button>/<input>/<select>/<textarea>.",
      },
      {
        // An `<a>` with no href is an anchor TARGET, not a control.
        selector: "JSXOpeningElement[name.type='JSXIdentifier'][name.name='a']:has(> JSXAttribute[name.name='href'])",
        message: "A raw `<a href>` in a feature (D62) — use the @orb/ui Link primitive.",
      },
    ],
  },
  {
    id: "no-static-staletime",
    selectors: [
      {
        selector: "Property[computed=false][key.name='staleTime'][value.value='static']",
        message:
          "`staleTime: 'static'` silently ignores invalidateQueries — it would disable the SSE bus→cache seam with a green check. Use Infinity (invalidation still overrides it).",
      },
      {
        selector: "Property[computed=false][key.name='staleTime'] > TemplateLiteral[expressions.length=0][quasis.0.value.cooked='static']",
        message: "`staleTime: 'static'` silently ignores invalidateQueries. Use Infinity.",
      },
    ],
  },
  {
    id: "no-legacy-react-api",
    selectors: [
      {
        selector: `ImportDeclaration[source.value='react'] > ImportSpecifier[imported.name=${alternation(["cloneElement", "createRef", "Children", "PureComponent"])}]`,
        message: "A legacy React API (cloneElement, createRef, Children, PureComponent) — use the React 19 function-component equivalent.",
      },
      {
        selector: `ImportDeclaration[source.value='react-dom'] > ImportSpecifier[imported.name=${alternation(["useFormState", "flushSync"])}]`,
        message: "An unsupported react-dom API (useFormState, flushSync) — use `useActionState`, and let React schedule the flush.",
      },
    ],
  },
];
