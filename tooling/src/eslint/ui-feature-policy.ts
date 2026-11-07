import { alternation, MATCH_MEDIA, TANSTACK_FORM_MINTS, wholeModule } from "./syntax.ts";

// Attributes that tell a component where it is placed. The container answers that question (UI-Architecture-and-Layout.md §4b axis 1).
// No @orb/ui variant is keyed by these names: `compact` appears only as a value of `size`/`density`/`listSize`.
// React 19 form-state APIs the stack skips: TanStack Form owns the form, TanStack Query owns the optimistic write.
const FORM_STATE_APIS = ["useActionState", "useFormState", "useFormStatus", "useOptimistic"];

const LAYOUT_CONTEXT_PROPS = ["compact", "inDrawer", "inModal", "isMobile", "narrow"];

// Importing Container is how a surface would declare one under another name.
const CONTAINER_IMPORT = "ImportDeclaration[source.value=/^@orb\\/ui\\/layout/] > ImportSpecifier[imported.name='Container']";

// A dialog's `bodyProps` forwards its props to the body box, so `container` there declares one from the surface.
const BODY_PROPS_CONTAINER =
  "JSXAttribute[name.name='bodyProps'] > JSXExpressionContainer > ObjectExpression > Property:matches([key.name='container'], [key.value='container']):not([value.value=false])";

const BODY_PROPS_OPAQUE =
  "JSXAttribute[name.name='bodyProps'] > JSXExpressionContainer > :matches(:not(ObjectExpression), ObjectExpression:has(> SpreadElement))";

/** The surface selectors that need no import resolution; `ui-containment.ts` adds the resolved ones. */
export const SURFACE_SELECTORS = [
  {
    selector: CONTAINER_IMPORT,
    message: "A surface never imports Container, under any name: it declares no container. Move it to the anchor that mounts the surface.",
  },
  {
    selector: BODY_PROPS_OPAQUE,
    message: "A surface passes `bodyProps` as a plain object literal, so its `container` stays visible here; move any spread or shared object to the anchor.",
  },
  {
    selector: BODY_PROPS_CONTAINER,
    message: "A surface never declares its own container, including through `bodyProps`. Move it to the anchor that mounts the surface.",
  },
] as const;

// The centered editor column: the cap token beside `mx-auto`, in either order. A cap alone is a start-aligned measure.
const EDITOR_COLUMN = String.raw`/mx-auto.*max-inline-\(--width-content-col\)|max-inline-\(--width-content-col\).*mx-auto/`;

// A control that destroys data (docs/law/client-architecture-state-and-gates.md §14, "Destructive confirms") needs a confirm or an undo in its file.
// The word list is the one `pnpm ui-facts` reads; a search or filter clear is not data.
const DESTRUCTIVE_VERB = String.raw`/^\s*(Restore|Delete|Remove|Reset|Discard|Clear|Revert|Drop|Wipe|Erase|Overwrite|Replace)\b(?![^]*\b(search|filters?)\b)/i`;
const ACTION_TAG = "/^(Button|GlyphButton|InlineAction|MenuItem)$/";
// Evidence in the same file: a confirm, a dialog whose Cancel throws the edit away, or an Undo action.
const CONFIRM_IN_FILE =
  "JSXOpeningElement[name.name=/^(ConfirmDialog|AlertDialog|RowActionsMenu|ModelRunConfirmDialog|FormDialog|FormDialogPopup|DismissDialog|ContentDialog|FlowDialog)$/]";
const UNDO_IN_FILE = "Property[key.name='label'][value.value='Undo']";
// An inline confirm step: the destructive control sits after a Keep or Cancel button in the same parent.
// The Cancel word is either literal text or the shared `DIALOG_VERBS.cancel`.
const KEEP_BESIDE = String.raw`:matches(JSXElement:has(> JSXText[value=/^\s*(Cancel|Keep)\s*$/]), JSXElement:has(> JSXExpressionContainer[expression.object.name='DIALOG_VERBS'][expression.property.name='cancel']))`;
const NOT_CONFIRMED_IN_FILE = `:not(Program:has(${CONFIRM_IN_FILE}) *):not(Program:has(${UNDO_IN_FILE}) *)`;
const DESTRUCTIVE_MESSAGE =
  "A control that destroys data needs a ConfirmDialog or an undo (docs/law/client-architecture-state-and-gates.md §14). Wrap it in a ConfirmDialog trigger, or offer Undo.";

// Files exempt from `destructive-needs-confirm`, each with the owner-delegated call that permits it
// (docs/law/client-architecture-state-and-gates.md §14, "Destructive confirms"). `pnpm ui-facts` reads the same list.
export const DESTRUCTIVE_EXEMPT: readonly { readonly path: string; readonly reason: string }[] = [
  { path: "packages/client/src/features/automation/components/rule-*-fields.tsx", reason: "rule editor: removes an optional field from the form being edited" },
  {
    path: "packages/client/src/features/automation/components/rule-editor-settings.tsx",
    reason: "rule editor: removes an optional field from the form being edited",
  },
  { path: "packages/client/src/features/chat/components/injections-manager.tsx", reason: "injection rows are re-added in one step" },
  { path: "packages/client/src/features/chat/components/room-overrides-form.tsx", reason: "clears a field of the override form being edited" },
  { path: "packages/client/src/features/persona/components/persona-room-block.tsx", reason: "Clear pin is one click to undo: re-pin" },
  { path: "packages/client/src/features/persona/components/persona-editor.tsx", reason: "asks the caller to delete; the caller owns the confirm" },
  { path: "packages/client/src/features/character/components/greeting-studio.tsx", reason: "discards a generated preview that was never saved" },
  { path: "packages/client/src/features/refinery/components/accept-review.tsx", reason: "discards a rewrite that was never applied" },
  { path: "packages/client/src/features/refinery/components/apply-outcome.tsx", reason: "discards a refused rewrite that was never applied" },
  { path: "packages/client/src/features/preset/components/staleness-row.tsx", reason: "Clear removes stored values the model ignores, so they are inert" },
  {
    path: "packages/client/src/features/config/components/config-teacher.tsx",
    reason: "resets one setting to the default its row shows; a list or object value gets an Undo toast",
  },
];

export const UI_FEATURE_RESTRICTIONS = [
  {
    id: "destructive-needs-confirm",
    selectors: [
      {
        selector: `JSXElement[openingElement.name.name=${ACTION_TAG}]:has(> JSXText[value=${DESTRUCTIVE_VERB}])${NOT_CONFIRMED_IN_FILE}:not(${KEEP_BESIDE} ~ JSXElement)`,
        message: DESTRUCTIVE_MESSAGE,
      },
      {
        selector: `JSXOpeningElement[name.name=${ACTION_TAG}]:has(> JSXAttribute[name.name='tone'][value.value='destructive'])${NOT_CONFIRMED_IN_FILE}:not(${KEEP_BESIDE} ~ JSXElement > JSXOpeningElement)`,
        message: DESTRUCTIVE_MESSAGE,
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
    // Each signature is owned by exactly one page template in packages/client/src/components/, so a match is a
    // feature rebuilding that template's shape (docs/plans/cross-surface-consistency/design.md "Page templates").
    id: "page-template-shapes",
    selectors: [
      {
        selector: "JSXOpeningElement[name.name='ListSearch']",
        message: "A feature marks its own list search: a LIST pane is a `#components` `ListPage`, which owns the search row, the tier and the scroll box.",
      },
      {
        selector: "JSXAttribute[name.name='data-shell-identity']",
        message:
          "A feature defers its own name to the shell: a CONTENT pane's identity row is a `#components` `DetailHeader`, which keeps the heading in the outline.",
      },
      {
        selector: `:matches(Literal[value=${EDITOR_COLUMN}], TemplateElement[value.raw=${EDITOR_COLUMN}])`,
        message:
          "A feature spells the centered editor column: wrap the editor body in a `#components` `EditorPage`, which owns the cap, the breathe and the tier.",
      },
      {
        selector: "JSXOpeningElement[name.name='Grid']:has(> JSXAttribute[name.name='role'][value.value='list'])",
        message:
          "A feature builds its own list grid: a grid of tiles is a `#components` `CollectionGrid`, which names the list and wraps every cell as a listitem.",
      },
      {
        selector: "JSXOpeningElement[name.name='FieldLayout']:has(> JSXAttribute[name.name='orientation'][value.value='horizontal'])",
        message:
          "A feature builds its own horizontal settings row: a label, a control and a hint in the settings track is a `#components` `SettingRowGroup` holding a `SettingTrackRow` per row, which owns the track geometry.",
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
        selector: `JSXOpeningElement[name.type='JSXIdentifier'][name.name=${alternation(["button", "input", "select", "textarea", "ul", "ol", "label", "hr", "h1", "h2", "h3", "h4", "h5", "h6", "dialog", "table"])}]`,
        message:
          "A raw interactive or structural intrinsic in a feature (D62) — it comes from an @orb/ui primitive (Button, Input, Select, Textarea, Link, Field, Heading, Separator, Table), never a hand-rolled <button>, <input>, <select>, <textarea>, <label>, <ul>, <ol>, <hr>, <h1>-<h6>, <dialog> or <table>.",
      },
      {
        // An `<a>` with no href is an anchor TARGET, not a control.
        selector: "JSXOpeningElement[name.type='JSXIdentifier'][name.name='a']:has(> JSXAttribute[name.name='href'])",
        message: "A raw `<a href>` in a feature (D62) — use the @orb/ui Link primitive.",
      },
    ],
  },
  {
    // The files where a factory may be called are the config block's `ignores`; a component or surface imports the hook.
    id: "mutation-factory-in-hooks-file",
    selectors: [
      {
        selector: "CallExpression[callee.name='createEntityMutation']",
        message: "A `createEntityMutation` call lives in a hooks file (`hooks/`, `*-mutations.ts` or `data/`); the component imports the hook it makes.",
      },
    ],
  },
  {
    id: "copy-ellipsis",
    selectors: [
      {
        selector: ":matches(JSXAttribute[name.name='placeholder'] > Literal, JSXText)[value=/\\.\\.\\./]",
        message: "Write the ellipsis as one character `…`, never three dots.",
      },
      {
        selector: "JSXAttribute[name.name='placeholder'] > Literal[value=/^(Search|Filter)\\b/]:not([value=/…$/])",
        message: "A search or filter placeholder ends in `…`.",
      },
    ],
  },
  {
    id: "library-surface-row",
    selectors: [
      {
        selector: "JSXOpeningElement[name.name='ListRow']",
        message:
          "A list or library surface composes `LibraryRow` (`#components`); its `leading`, `markers`, `trailing` and `actions` slots cover a row's anatomy.",
      },
    ],
  },
  {
    id: "no-single-row-textarea",
    selectors: [
      {
        selector:
          "JSXOpeningElement[name.name='Textarea']:has(> JSXAttribute[name.name='rows'][value.expression.value=1]):not(:has(> JSXAttribute[name.name='maxRows']))",
        message: "A one-row Textarea with no `maxRows` is an Input's job: use Input, or name the ceiling it grows to with `maxRows`.",
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
