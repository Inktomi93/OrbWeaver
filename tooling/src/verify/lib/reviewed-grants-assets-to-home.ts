// Reviewed grants: assets-single-writer, biome-grant-liveness, content-part-seam....
// Split from reviewed-grants.ts — see that file for the central home comment.
import type { ReviewedGateGrant } from "../contract/gate-authority.ts";

const STRUCTURAL_LENGTH_OPERATION = "structural-css-length";
// Explicit keys preserve surviving grant identities when an obsolete subject is removed.
const STRUCTURAL_LENGTH_GRANT_SUBJECTS = {
  "01": ".shell-grid { --list-track: 0px }",
  "02": ".shell-grid { --context-track: 0px }",
  "03": ".shell-grid { height: 100vh }",
  "04": ".shell-grid { height: calc(100dvh - var(--orb-keyboard-inset, 0px)) }",
  "05": ".shell-grid { --pane-deficit: max(0px, var(--dimension-content-reading-floor) - (100dvw - var(--rail-w) - var(--panel-w) - var(--panel-context-w))) }",
  "06": ".shell-grid { --content-primacy-deficit: max(0px, calc(var(--rail-w) + (var(--both-docked-list-track) + var(--both-docked-context-track)) * 1.5 - 100%)) }",
  "07": ".shell-content-primacy-sentinel { block-size: 1px }",
  "08": '.shell-panel[data-panel-mode="docked"], .shell-panel[data-panel-mode="overlay"], .shell-panel[data-panel-mode="collapsed"] { width: 100dvw }',
  "09": '.shell-panel[data-panel-side="list"][data-panel-mode="overlay"], .shell-panel[data-panel-side="list"][data-panel-mode="collapsed"], .shell-panel[data-panel-side="context"][data-panel-mode="overlay"], .shell-panel[data-panel-side="context"][data-panel-mode="collapsed"] { width: 100dvw }',
  "10": '.shell-panel[data-panel-side="list"][data-panel-mode="docked"] { width: 100dvw }',
  "11": "@supports (backdrop-filter: blur(1px)) {",
  "12": "@container shell-main (max-width: 30rem) {",
  "13": "@media (max-width: 48rem) {",
  "17": "packages/client/src/features/character/components/character-create-actions.tsx :: @max-[19rem]:hidden",
  "18": "packages/client/src/features/character/components/character-create-actions.tsx :: @[19rem]:hidden",
  "19": "packages/ui/src/markdown/markdown.tsx :: max-h-[60cqh]",
  "20": "packages/ui/src/layout/variants.ts :: @md:grid-cols-[repeat(auto-fill,8.5rem)]",
  "21": "packages/ui/src/layout/variants.ts :: @min-[100rem]:grid-cols-[1.5fr_1.05fr]",
  "23": "packages/ui/src/layout/variants.ts :: grid-cols-[repeat(auto-fit,minmax(min(5rem,100%),1fr))]",
  "24": "packages/ui/src/layout/variants.ts :: grid-cols-[repeat(auto-fit,minmax(min(8.5rem,100%),1fr))]",
  "25": "packages/ui/src/layout/variants.ts :: grid-cols-[repeat(auto-fit,minmax(min(16rem,100%),1fr))]",
  "26": "packages/ui/src/layout/variants.ts :: grid-cols-[repeat(auto-fit,minmax(min(22rem,100%),1fr))]",
  "27": ".shell-grid { --shell-content-track: calc(100dvw - env(safe-area-inset-left) - env(safe-area-inset-right) - var(--rail-w) - var(--list-track) - var(--context-track)) }",
  "28": ".shell-grid { --shell-centre-flip-from: calc( ( max(0px, var(--shell-content-track) + var(--shell-track-shrink) - var(--width-shell-content)) - max(0px, var(--shell-content-track) - var(--width-shell-content)) ) / 2 ) }",
  "29": "@container shell-main (max-width: 56rem) {",
  "30": "@container shell-main (max-width: 72rem) {",
} as const;

export const REVIEWED_GRANTS_ASSETS_TO_HOME: readonly ReviewedGateGrant[] = [
  {
    id: "assets-single-writer:persistence-asset-refs",
    policyId: "assets-single-writer",
    subject: "packages/server/src/domain/assets/persistence/asset-refs.ts",
    operation: "asset-write-site",
    why: "This assets-domain module is an audited CAS-coherence writer or storeBlob caller in the D21 single-writer boundary.",
    endsWhen: "the module stops writing assets or calling storeBlob, or the CAS boundary moves to a different exact module.",
  },
  {
    id: "assets-single-writer:persistence-queries",
    policyId: "assets-single-writer",
    subject: "packages/server/src/domain/assets/persistence/queries.ts",
    operation: "asset-write-site",
    why: "This assets-domain module is an audited CAS-coherence writer or storeBlob caller in the D21 single-writer boundary.",
    endsWhen: "the module stops writing assets or calling storeBlob, or the CAS boundary moves to a different exact module.",
  },
  {
    id: "assets-single-writer:verbs-backfill-avatars",
    policyId: "assets-single-writer",
    subject: "packages/server/src/domain/assets/verbs/backfill-avatars.ts",
    operation: "asset-write-site",
    why: "This assets-domain module is an audited CAS-coherence writer or storeBlob caller in the D21 single-writer boundary.",
    endsWhen: "the module stops writing assets or calling storeBlob, or the CAS boundary moves to a different exact module.",
  },
  {
    id: "assets-single-writer:verbs-import-asset",
    policyId: "assets-single-writer",
    subject: "packages/server/src/domain/assets/verbs/import-asset.ts",
    operation: "asset-write-site",
    why: "This assets-domain module is an audited CAS-coherence writer or storeBlob caller in the D21 single-writer boundary.",
    endsWhen: "the module stops writing assets or calling storeBlob, or the CAS boundary moves to a different exact module.",
  },
  {
    id: "assets-single-writer:verbs-rebuild-from-tree",
    policyId: "assets-single-writer",
    subject: "packages/server/src/domain/assets/verbs/rebuild-from-tree.ts",
    operation: "asset-write-site",
    why: "This assets-domain module is an audited CAS-coherence writer or storeBlob caller in the D21 single-writer boundary.",
    endsWhen: "the module stops writing assets or calling storeBlob, or the CAS boundary moves to a different exact module.",
  },
  {
    id: "assets-single-writer:verbs-store",
    policyId: "assets-single-writer",
    subject: "packages/server/src/domain/assets/verbs/store.ts",
    operation: "asset-write-site",
    why: "This assets-domain module is an audited CAS-coherence writer or storeBlob caller in the D21 single-writer boundary.",
    endsWhen: "the module stops writing assets or calling storeBlob, or the CAS boundary moves to a different exact module.",
  },
  // THE THREE BOUNDED DIRECT-SKIN RECIPES (#2181, #1584). They replace `EXPECTED_DIRECT_CLIENT_UI_MECHANISMS`
  // — three hand-spelled COUNTS in `lib/css-family-census.ts` that §12.5 bans and that the §5b audit measured
  // reached by ZERO proof rows (cut f07) and unmoved by a changed number (cut f08). The exemption is real and
  // survives; its cardinality is now the 1:1 grant identity, and its STALENESS is the central
  // `stale-reviewed-grant` alarm rather than a literal nobody re-measured.
  {
    id: "css-family-direct-client-mechanism:alert-dialog-popup",
    policyId: "css-family-direct-client-mechanism",
    subject: "packages/client/src/styles/globals.css",
    operation: "direct-client-mechanism:slot:alert-dialog-popup",
    why: "the alert dialog's popup is positioned against the DOCUMENT, not against a component ancestor: the rule is `html `-rooted because the portal target is the document body, and a `tv()` variant on the primitive cannot express a document-rooted carrier.",
    endsWhen:
      "the alert dialog stops portalling to the document body, or `@orb/ui` gains a document-carrier variant slot — either way client globals stops selecting this hook, the row is consumed zero times and reds STALE.",
  },
  {
    id: "css-family-direct-client-mechanism:dialog-popup",
    policyId: "css-family-direct-client-mechanism",
    subject: "packages/client/src/styles/globals.css",
    operation: "direct-client-mechanism:slot:dialog-popup",
    why: "same document-rooted portal seam as the alert dialog, for the plain dialog. The `html ` prefix is the whole reason the recipe is legitimate and is enforced by the policy rather than by this row.",
    endsWhen:
      "the dialog stops portalling to the document body, or `@orb/ui` gains a document-carrier variant slot; the row then consumes zero candidates and reds STALE.",
  },
  {
    id: "css-family-direct-client-mechanism:message-list-scroll",
    policyId: "css-family-direct-client-mechanism",
    subject: "packages/client/src/styles/globals.css",
    operation: "direct-client-mechanism:slot:message-list-scroll",
    why: "the message list's scroll container is a CLIENT scroll mechanism wearing a UI primitive's slot — the pinning/overflow behaviour belongs to the chat surface that owns the scroll position, not to the primitive that renders the box.",
    endsWhen:
      "the chat surface stops driving the scroll container from client globals (it moves onto a capability carrier or into the primitive), and the row consumes zero candidates and reds STALE. It is ONE row for however many selectors express the recipe: the policy reports one finding per (carrier, hook) class precisely so a reviewer's decision stays 1:1.",
  },
  ...Object.entries(STRUCTURAL_LENGTH_GRANT_SUBJECTS).map(
    ([id, subject]): ReviewedGateGrant => ({
      id: `css-length-tokens-grants:${id}`,
      policyId: "css-length-tokens-grants",
      subject,
      operation: STRUCTURAL_LENGTH_OPERATION,
      why: `${subject} is an exact raw length used as structural mechanics that cannot consume a portable token.`,
      endsWhen: `the exact structural subject ${subject} disappears or becomes token-expressible; central liveness then reports this row stale.`,
    }),
  ),
  ...[
    "--accordion-panel-height",
    "--active-tab-left",
    "--active-tab-width",
    "--anchor-width",
    "--available-height",
    "--available-width",
    "--collapsible-panel-height",
    "--drawer-snap-point-offset",
    "--drawer-swipe-movement-x",
    "--drawer-swipe-movement-y",
    "--toast-swipe-movement-x",
    "--toast-swipe-movement-y",
    "--transform-origin",
  ].map(
    (property): ReviewedGateGrant => ({
      id: `css-var-defined-grants:${property.slice(2)}`,
      policyId: "css-var-defined-grants",
      subject: property,
      operation: "base-ui-runtime-property",
      why: `${property} is a Base UI runtime custom property proved by both the committed API mirror and the installed CssVars declarations; authored consumers may read it although product CSS cannot define its runtime value.`,
      endsWhen: `Delete the unused central grant when no product source or stylesheet references ${property}; the candidate disappears and central liveness reports this row stale.`,
    }),
  ),
  ...[
    [
      "app-shell-width",
      "packages/client/src/features/app-shell/surfaces/app-shell.tsx",
      "--width-shell-content",
      "the user stored chat width is read at runtime",
    ],
    [
      "web-weave-hub-x",
      "packages/ui/src/art/web-weave/web-weave.tsx",
      "--orb-weave-hub-x",
      "the generated weave geometry computes the horizontal hub per instance",
    ],
    [
      "web-weave-hub-y",
      "packages/ui/src/art/web-weave/web-weave.tsx",
      "--orb-weave-hub-y",
      "the generated weave geometry computes the vertical hub per instance",
    ],
    ["waystone-pitch", "packages/ui/src/charts/meter/waystone-layers.tsx", "--orb-ws-pitch", "the lattice pitch is per-layer data"],
    ["waystone-glow", "packages/ui/src/charts/meter/waystone-layers.tsx", "--orb-ws-glow", "the animation floor is computed per frame"],
    ["spinner-length", "packages/ui/src/primitives/spinner/spinner.tsx", "--orb-web-spiral-length", "the dash length derives from the generated spiral path"],
  ].map(
    ([id, subject, property, reason]): ReviewedGateGrant => ({
      id: `css-var-defined-grants:${id}`,
      policyId: "css-var-defined-grants",
      subject: subject ?? "",
      operation: `css-runtime-writer:${property}`,
      why: `${property} is written in ${subject} because ${reason}; no static product-CSS value can serve.`,
      endsWhen: `Delete the stale producer grant or review and repoint it when ${subject} stops writing ${property}, or the value becomes static; central liveness then reports this exact row stale.`,
    }),
  ),
];
