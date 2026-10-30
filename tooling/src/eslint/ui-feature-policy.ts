import { alternation, MATCH_MEDIA, TANSTACK_FORM_MINTS, wholeModule } from "./syntax.ts";

// Attributes that tell a component where it is placed. The container answers that question (UI-Architecture-and-Layout.md §4b axis 1).
// No @orb/ui variant is keyed by these names: `compact` appears only as a value of `size`/`density`/`listSize`.
// React 19 form-state APIs the stack skips: TanStack Form owns the form, TanStack Query owns the optimistic write.
const FORM_STATE_APIS = ["useActionState", "useFormState", "useFormStatus", "useOptimistic"];

const LAYOUT_CONTEXT_PROPS = ["compact", "inDrawer", "inModal", "isMobile", "narrow"];

// `container={false}` turns containment off, so it neither declares nor provides one.
const CONTAINER_ON = "JSXAttribute[name.name='container']:not([value.expression.value=false])";

const CONTAINMENT_OWNER = `:matches(JSXOpeningElement[name.name='Container'], JSXOpeningElement[name.name=/^(Section|Stack)$/]:has(> ${CONTAINER_ON}))`;

// A bare, string or boolean `container` is containment whatever the element is called; a Portal's `container` is an element or a ref.
const CONTAINER_FLAG =
  "JSXAttribute[name.name='container']:matches(:not([value]), [value.type='Literal'], [value.expression.type='Literal']):not([value.expression.value=false])";

const CONTAINER_SPREAD = "JSXSpreadAttribute > ObjectExpression > Property:matches([key.name='container'], [key.value='container']):not([value.value=false])";

// What a surface may not write: the Container element however it is reached, a container flag on any element, and a spread that carries one.
const SURFACE_DECLARATION = `:matches(${CONTAINMENT_OWNER}, JSXOpeningElement[name.type='JSXMemberExpression'][name.property.name='Container'], JSXOpeningElement:has(> ${CONTAINER_FLAG}), JSXOpeningElement:has(${CONTAINER_SPREAD}))`;

// Importing Container is how a surface would declare one under another name.
const CONTAINER_IMPORT = "ImportDeclaration[source.value=/^@orb\\/ui\\/layout/] > ImportSpecifier[imported.name='Container']";

// A dialog's `bodyProps` forwards its props to the body box, so `container` there declares one from the surface.
const BODY_PROPS_CONTAINER =
  "JSXAttribute[name.name='bodyProps'] > JSXExpressionContainer > ObjectExpression > Property:matches([key.name='container'], [key.value='container']):not([value.value=false])";

const BODY_PROPS_OPAQUE =
  "JSXAttribute[name.name='bodyProps'] > JSXExpressionContainer > :matches(:not(ObjectExpression), ObjectExpression:has(> SpreadElement))";

// A dialog or drawer anchor provides its containment as the dialog box itself: the element it returns (beside its sibling dialogs in a fragment), not one nested in another element's children or props.
const DIALOG_BOX = "JSXElement:not(JSXElement JSXElement) > JSXOpeningElement[name.name=/(?:Dialog|Drawer)$/]";

export const UI_FEATURE_RESTRICTIONS = [
  {
    // A surface consumes the containment its anchor provides (UI-Architecture-and-Layout.md §4).
    id: "surface-consumes-container",
    selectors: [
      {
        selector: SURFACE_DECLARATION,
        message: "A surface never declares its own container. Move the <Container> (or `container` prop) to the anchor that mounts it.",
      },
      {
        selector: CONTAINER_IMPORT,
        message: "A surface never imports Container, under any name: it declares no container. Move it to the anchor that mounts the surface.",
      },
      {
        selector: BODY_PROPS_OPAQUE,
        message:
          "A surface passes `bodyProps` as a plain object literal, so its `container` stays visible here; move any spread or shared object to the anchor.",
      },
      {
        selector: BODY_PROPS_CONTAINER,
        message: "A surface never declares its own container, including through `bodyProps`. Move it to the anchor that mounts the surface.",
      },
    ],
  },
  {
    id: "anchor-provides-container",
    selectors: [
      {
        selector: `Program:not(:has(${CONTAINMENT_OWNER})):not(:has(${DIALOG_BOX}))`,
        message: "An anchor provides containment: render <Container> (or <Section container>), or the dialog box it anchors.",
      },
    ],
  },
  {
    id: "no-layout-context-props",
    selectors: [
      {
        selector: `JSXAttribute[name.type='JSXIdentifier'][name.name=${alternation(LAYOUT_CONTEXT_PROPS)}]`,
        message: `A layout-context prop (${LAYOUT_CONTEXT_PROPS.join(", ")}) tells a component where it sits; adapt to the container with a container query instead (UI-Architecture-and-Layout.md §4b axis 1).`,
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
        selector: wholeModule("zustand/middleware"),
        message:
          "The whole `zustand/middleware` module taken by namespace, `export *` or dynamic import outside its sealed homes: import the middleware you need by name, so a raw `persist` stays visible (UI-Gates-and-Lessons.md §11.5).",
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
        selector: `ImportDeclaration[source.value=/^react(?:-dom)?$/] > ImportSpecifier[imported.name=${alternation(FORM_STATE_APIS)}]`,
        message:
          "A React form-state API (useActionState, useFormState, useFormStatus, useOptimistic): TanStack Form owns form state and TanStack Query owns optimistic writes (UI-Architecture-and-Layout.md §4a).",
      },
      {
        selector: `CallExpression[callee.object.name='React'][callee.property.name=${alternation(FORM_STATE_APIS)}]`,
        message:
          "A React form-state API (useActionState, useFormState, useFormStatus, useOptimistic): TanStack Form owns form state and TanStack Query owns optimistic writes (UI-Architecture-and-Layout.md §4a).",
      },
      {
        selector: "JSXOpeningElement[name.type='JSXIdentifier'][name.name='form']:has(> JSXAttribute[name.name='action'])",
        message: "A <form action>: orbweaver submits through TanStack Form and tRPC, never a React form Action (UI-Architecture-and-Layout.md §4a).",
      },
      {
        selector: `ImportDeclaration[source.value='react-dom'] > ImportSpecifier[imported.name='flushSync']`,
        message: "An unsupported react-dom API (flushSync) — let React schedule the flush.",
      },
      {
        selector:
          "AssignmentExpression[left.type='MemberExpression'][left.property.name='title']:matches([left.object.name='document'], [left.object.property.name='document'])",
        message:
          "A `document.title` write: render React 19's `<title>` from the active pane; metadata hoists to the head (ui-architecture-state-and-stack.md §5.1).",
      },
    ],
  },
];
