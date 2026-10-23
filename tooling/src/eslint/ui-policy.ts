import { alternation, memberNamed } from "./syntax.ts";

export const STATE_MINT_NAMES = ["create", "createStore", "createGatedStore", "createEntityDraftStore"];

export const STATE_MINT = alternation(STATE_MINT_NAMES);

const STATE_MAX_FIELDS = 10;

const STATE_FIELD_CAP_MESSAGE = `A state store initializer declares more than ${STATE_MAX_FIELDS} top-level fields; the store is doing several jobs, so split it.`;

export const STATE_FILES_SELECTORS = [
  {
    selector: `CallExpression[callee.name=${STATE_MINT}] > ArrowFunctionExpression[body.type='ObjectExpression'][body.properties.length>${STATE_MAX_FIELDS}]`,
    message: STATE_FIELD_CAP_MESSAGE,
  },
  {
    selector: `CallExpression[callee.name=${STATE_MINT}] > :matches(ArrowFunctionExpression, FunctionExpression) > BlockStatement > ReturnStatement > ObjectExpression[properties.length>${STATE_MAX_FIELDS}]`,
    message: STATE_FIELD_CAP_MESSAGE,
  },
];

const CLASS_LITERAL_START = String.raw`(?:^["']|\s)`;

const CLASS_LITERAL_END = String.raw`(?=\s|["']$)`;

const CLASS_SPAN_START = String.raw`(?:^|\s)`;

const CLASS_SPAN_END = String.raw`(?=\s|$)`;

const STATIC_CLASS_SPAN = "TemplateLiteral[expressions.length=0] > TemplateElement";

const ARBITRARY_CLASS = String.raw`(?:[^\s]*:)?(?:[whz]|min-w|min-h|max-w|max-h|size|p[xytrbles]?|m[xytrbles]?|gap(-x|-y)?|space-[xy]|inset(-x|-y)?|top|left|right|bottom|start|end|translate(-x|-y|-z)?|grid-(cols|rows)|text|leading|tracking|rounded)-\[(?!(?:--|var\(|calc\())[^\s:]+\]`;

const NAMED_COLOR = String.raw`\b(bg|text|border|ring|fill|stroke)-(black|white)(\/\d+)?\b`;

const PALETTE_COLOR = String.raw`\b(?:bg|text|border|ring|fill|stroke|from|via|to|outline|decoration|accent|caret|divide|placeholder|shadow|ring-offset)-(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-\d{2,3}(?:\/\d+)?\b`;

const HEX_COLOR = String.raw`-\[#[0-9a-fA-F]{3,8}\]`;

const VIEWPORT_CLASS = String.raw`(?:(?:max-|min-)?(?:sm|md|lg|xl|2xl)|(?:min|max)-\[[^\s\]]+\]):`;

const POINTER_CLASS = "(?:any-)?pointer-(?:coarse|fine):";

const CAPABILITY_MEDIA_CLASS = String.raw`\[@media\([^\s)]*(?:any-pointer|pointer|hover):[^\s)]*\)\]:`;

const WIDTH_CLASS = String.raw`(?:(?:max-|min-)?w-\[[^\s\]]+\]|(?:max-)?w-(?:[1-9]\d*|\d+\.\d+))`;

export const CLASS_RESTRICTIONS = [
  {
    id: "ui-skin-fragment-purity",
    selectors: [
      "focus-visible:ring-",
      "before:size-touch-target",
      "rotate-45 border border-border bg-popover",
      "bg-backdrop",
      "data-disabled:pointer-events-none data-disabled:opacity-50",
      "disabled:pointer-events-none disabled:opacity-50",
    ].map((signature) => ({
      selector: `:matches(Literal[value=type(string)][raw=/${signature}/], TemplateElement[value.raw=/${signature}/])`,
      message: "A string outside the canonical UI lib home hand-spells a skin fragment; compose the matching lib constant instead.",
    })),
  },
  {
    id: "no-arbitrary-tw-values",
    selectors: [
      {
        selector: `:matches(Literal[value=type(string)][raw=/${CLASS_LITERAL_START}${ARBITRARY_CLASS}${CLASS_LITERAL_END}/], ${STATIC_CLASS_SPAN}[value.raw=/${CLASS_SPAN_START}${ARBITRARY_CLASS}${CLASS_SPAN_END}/])`,
        message: "Arbitrary Tailwind layout/size/type value bypasses the token scale; use a token utility or extend tokens.json.",
      },
    ],
  },
  {
    id: "no-color-literals",
    selectors: [
      {
        selector: `:matches(Literal[value=type(string)][raw=/${NAMED_COLOR}/], ${STATIC_CLASS_SPAN}[value.raw=/${NAMED_COLOR}/])`,
        message: "A named non-token color bypasses the theme; use a semantic token, or bg-backdrop for a scrim.",
      },
      {
        selector: String.raw`:matches(Literal[value=type(string)][raw=/${CLASS_LITERAL_START}(?![^\s]*${NAMED_COLOR})[^\s]*${PALETTE_COLOR}/], ${STATIC_CLASS_SPAN}[value.raw=/${CLASS_SPAN_START}(?![^\s]*${NAMED_COLOR})[^\s]*${PALETTE_COLOR}/])`,
        message: "A palette-scale color bypasses the theme; use a semantic token such as text-destructive or bg-primary.",
      },
      {
        selector: String.raw`:matches(Literal[value=type(string)][raw=/${CLASS_LITERAL_START}(?![^\s]*${NAMED_COLOR})(?![^\s]*${PALETTE_COLOR})[^\s]*${HEX_COLOR}/], ${STATIC_CLASS_SPAN}[value.raw=/${CLASS_SPAN_START}(?![^\s]*${NAMED_COLOR})(?![^\s]*${PALETTE_COLOR})[^\s]*${HEX_COLOR}/])`,
        message: "An arbitrary hex color bypasses the theme; use a semantic color token from theme.css.",
      },
    ],
  },
  {
    id: "no-media-queries-in-features",
    selectors: [
      {
        selector: `:matches(Literal[value=type(string)][raw=/${CLASS_LITERAL_START}${VIEWPORT_CLASS}/], TemplateElement[value.raw=/${CLASS_SPAN_START}${VIEWPORT_CLASS}/])`,
        message: "Viewport breakpoints belong to app-shell; adapt to the pane with a container query or Container size.",
      },
    ],
  },
  {
    id: "no-pointer-variants-in-features",
    selectors: [
      {
        selector: `:matches(Literal[value=type(string)][raw=/${CLASS_LITERAL_START}${POINTER_CLASS}|${CAPABILITY_MEDIA_CLASS}/], ${STATIC_CLASS_SPAN}[value.raw=/${CLASS_SPAN_START}${POINTER_CLASS}|${CAPABILITY_MEDIA_CLASS}/])`,
        message: "Device capability adaptation belongs to shared tokens or app-shell, not feature-local pointer/hover capability variants.",
      },
    ],
  },
  {
    id: "no-raw-container-widths",
    selectors: [
      {
        selector: `:matches(Literal[value=type(string)][raw=/${CLASS_LITERAL_START}${WIDTH_CLASS}${CLASS_LITERAL_END}/], ${STATIC_CLASS_SPAN}[value.raw=/${CLASS_SPAN_START}${WIDTH_CLASS}${CLASS_SPAN_END}/])`,
        message: "Raw content widths bypass the container scale; use Container size or a max-w-cq-* token utility.",
      },
    ],
  },
];

export const CLIENT_CONTEXT_RESTRICTIONS = [
  {
    id: "context-shell-chrome",
    selectors: [
      {
        selector: ":matches(Literal[value=type(string)][raw=/shell-panel-header/], TemplateElement[value.raw=/shell-panel-header/])",
        message: "A feature must compose its own band, not paint the shell-panel-header chrome.",
      },
    ],
  },
  {
    id: "no-mutating-register-api",
    selectors: [
      {
        selector:
          "FunctionDeclaration[id.name='register'], :matches(MethodDefinition, TSAbstractMethodDefinition)[computed=false][kind='method'][key.type='Identifier'][key.name='register'], Property[computed=false][method=true][key.type='Identifier'][key.name='register'], TSDeclareFunction[id.name='register']",
        message: "Export definition values for door assembly, not a mutating register API.",
      },
    ],
  },
];

export const CLIENT_STYLE_RESTRICTIONS = [{ id: "no-off-token-inline-style" }, { id: "theme-override-only-via-scope" }];

const CAST_ID_CALL = `CallExpression:matches([callee.name='castId'], [callee.computed=false][callee.property.name='castId'], [callee.computed=true][callee.property.value='castId'])`;

const EMPTY_ID_ARGUMENT =
  ":matches([arguments.0.value=''], [arguments.0.expressions.length=0][arguments.0.quasis.0.value.cooked=''], [arguments.0.expression.value=''], " +
  "[arguments.0.expression.expressions.length=0][arguments.0.expression.quasis.0.value.cooked=''], [arguments.0.expression.expression.value=''], " +
  "[arguments.0.expression.expression.expressions.length=0][arguments.0.expression.expression.quasis.0.value.cooked=''])";

export const ID_BRAND_RESTRICTIONS = [
  {
    id: "no-fake-disabled-id",
    selectors: [
      {
        selector: `${CAST_ID_CALL}${EMPTY_ID_ARGUMENT}`,
        message:
          "An empty-string branded id is a fake disabled sentinel that can reach the server if its guard drifts; use useGatedQuery or skipToken so no key exists.",
      },
      {
        selector: "ImportSpecifier[imported.name='castId'][local.name!='castId']",
        message: "Import castId under its own name: the empty-sentinel ban reads the seam by spelling, and an alias would hide it.",
      },
    ],
  },
  { id: "no-raw-id" },
  { id: "wire-json-parsed-at-consumer" },
];

export const CLIENT_CONFIG_HOST_RESTRICTIONS = [
  {
    id: "config-host-no-feature-import",
    selectors: [
      {
        // `#features` door, or two relative hops: the only ways to leave `features/config/` for a sibling feature.
        selector: "ImportDeclaration[source.value=/^(#features.|\\.\\.\\S\\.\\.\\S)/]",
        message: "The config content host reads bodies off the registries; it does not import another feature's internals.",
      },
    ],
  },
];

const REGISTRY_FACTORY_NAMES = ["createRegistry", "createContributorRegistry"];

const REGISTRY_FACTORIES = alternation(REGISTRY_FACTORY_NAMES);

const sealedName = (name: string): string =>
  `ImportSpecifier[imported.name='${name}'], MemberExpression${memberNamed(name)}, ObjectPattern > Property[computed=false][key.name='${name}']`;

export const CLIENT_SEAL_RESTRICTIONS = [
  {
    id: "bound-field-via-hook",
    selectors: [
      {
        selector: sealedName("useFieldContext"),
        message:
          "A bound field reaches the raw useFieldContext form context directly. Use useBoundField<T>(shell) from ./use-bound-field; every bound field's context read, touch-gated error and Field prop bundle live in that one hook.",
      },
    ],
  },
  {
    id: "chat-stream-writes-in-bus-only",
    selectors: [
      {
        selector: sealedName("chatStream"),
        message:
          "The chatStream write api is taken outside the bus applier. Turn slots are driven by bus events through applyChatBusEvent only; components read with useTurnSlot and useTurnPhase.",
      },
    ],
  },
  {
    id: "bus-on-data-no-store-write",
    selectors: [
      {
        selector:
          ":matches(Property, MethodDefinition)[key.name=/^(onData|onConnectionStateChange)$/] CallExpression[callee.type='MemberExpression'][callee.computed=false][callee.property.name='setState']",
        message:
          "A raw store write (.setState) inside a bus onData or onConnectionStateChange body forks canon into a second store. Route into the pure reducer (apply-chat-bus-event.ts), buffer through the chatStream api, or drive the invalidation seam.",
      },
    ],
  },
  {
    id: "selection-store-via-factory",
    selectors: [
      {
        selector: sealedName("createGatedStore"),
        message:
          "A *-selection-store.ts mints the raw createGatedStore door directly. Mint it with createDrillSelectionStore(name, { secondary? }); the per-section drill stores are one shape.",
      },
    ],
  },
  {
    id: "registry-assembly-at-door-only",
    selectors: [
      {
        selector: `ImportSpecifier[imported.name=${REGISTRY_FACTORIES}], ${REGISTRY_FACTORY_NAMES.map((name) => `MemberExpression${memberNamed(name)}`).join(", ")}, ObjectPattern > Property[computed=false][key.name=${REGISTRY_FACTORIES}]`,
        message:
          "createRegistry and createContributorRegistry are called only at the composition root (main.tsx) or in a compose/ module; any other call site is a private assembly outside the one registration door.",
      },
    ],
  },
  {
    id: "registry-context-via-mint",
    selectors: [],
  },
  {
    id: "state-files",
    selectors: STATE_FILES_SELECTORS,
  },
];

const BANNED_UTILITY = String.raw`(?:[^\s]*:)?!?max-w-prose!?`;

export const CLASS_TOKEN_RESTRICTIONS = [
  {
    id: "no-banned-tw-utility",
    selectors: [
      {
        selector: `:matches(Literal[value=type(string)][raw=/${CLASS_LITERAL_START}${BANNED_UTILITY}${CLASS_LITERAL_END}/], ${STATIC_CLASS_SPAN}[value.raw=/${CLASS_SPAN_START}${BANNED_UTILITY}${CLASS_SPAN_END}/])`,
        message:
          "Tailwind's max-w-prose matches no house reading measure. Body/teaching prose takes max-w-(--reading-measure-prose) on the paragraph; editor content takes max-w-(--width-content-col).",
      },
    ],
  },
];

const PORTAL_FLOAT_CLASS = String.raw`z-\(--z-(?:modal|popover|toast|tooltip)\)`;

// A portal-float token orders anything only for a surface that leaves its subtree by mount position, so it is
// legal only in the files eslint.config.ts allowlists; every other file is isolated inside a stacking context.
export const PORTAL_FLOAT_RESTRICTIONS = [
  {
    id: "no-portal-float-token",
    selectors: [
      {
        selector: `:matches(Literal[value=type(string)][value=/${PORTAL_FLOAT_CLASS}/], TemplateElement[value.raw=/${PORTAL_FLOAT_CLASS}/])`,
        message:
          'A portal-float z token (--z-modal, --z-popover, --z-toast, --z-tooltip) is legal only in a primitive that portals to [data-slot="portal-root"] or mounts at the document root: a float escapes its stacking context by mount position, and the token only orders floats against each other. Use --z-base or --z-raised for a sibling, or --z-overlay for the shell frame\'s own rung. A new portal primitive is added to PORTAL_FLOAT_HOMES in eslint.config.ts.',
      },
    ],
  },
];

const OVERLAY_PART = (part: string): string => `:matches(MemberExpression[computed=false], JSXMemberExpression)[property.name='${part}']`;

export const UI_PRIMITIVE_RESTRICTIONS = [
  {
    id: "ui-variants-barrel-private",
    selectors: [
      {
        selector: ":matches(ExportAllDeclaration, ExportNamedDeclaration)[source.value=/(^|\\u002F)variants$/]",
        message: "A barrel never re-exports its private variants: a feature composing raw variants bypasses the component skin.",
      },
    ],
  },
  {
    id: "ui-no-inline-svg",
    selectors: [
      {
        selector: "JSXOpeningElement[name.type='JSXIdentifier'][name.name='svg']",
        message: "No inline <svg> outside the chart layer: render the governed Icon component.",
      },
    ],
  },
];

export const UI_HARD_RESTRICTIONS = [
  {
    id: "ui-ct-no-inline-provider",
    selectors: [
      {
        selector:
          "JSXOpeningElement:matches([name.type='JSXIdentifier'][name.name=/Provider$/], [name.type='JSXMemberExpression'][name.property.name=/Provider$/])",
        message: "An inline provider in a test: global providers live in CtProviders.",
      },
    ],
  },
  {
    id: "ui-overlay-anchored-anatomy",
    selectors: [
      {
        selector: `Program:has(${OVERLAY_PART("Popup")}):not(:has(${OVERLAY_PART("Positioner")}))`,
        message: "An anchored overlay with a .Popup needs its .Positioner.",
      },
    ],
  },
  {
    id: "ui-overlay-modal-anatomy",
    selectors: [
      { selector: `Program:not(:has(${OVERLAY_PART("Backdrop")}):has(${OVERLAY_PART("Popup")}))`, message: "A modal overlay must use .Backdrop + .Popup." },
      { selector: `Program:has(${OVERLAY_PART("Positioner")})`, message: "A modal overlay must NOT have a .Positioner." },
    ],
  },
];
