// Gate: baseui-portal-container-seam — a @orb/ui seal that portals its popup must let the CALLER choose the
// portal target, and must actually pass the choice on. A Base UI `*.Portal` defaults to `document.body`,
// which is outside every `<ThemeScope>` in the tree: a popup that lands there resolves `var(--color-*)`
// against the ROOT theme, so a menu opened from inside a themed card renders in the wrong palette — and it
// also escapes the dialog's focus scope, which is the accessibility half of the same bug.
//
// TWO ARMS, because either half alone is a dead seam:
//   A the seal renders a `*.Portal` but no exported `*Props` interface in that file declares `container` —
//     the caller has no way to say where the popup goes;
//   B a rendered `*.Portal` carries no `container` attribute — the prop exists but is not wired, which reads
//     like a seam while behaving exactly like the default (the dead-wire class).
//
// MEASURED AT LANDING: zero live sites — all ten portal-bearing seals (popover, menu, tooltip, dialog,
// alert-dialog, drawer, select, combobox, autocomplete, toast) already declare `container?:
// BasePortalProps["container"]` and thread it through `container={container ?? portalContainer}`. An honest
// zero, held as a ratchet: the eleventh seal is the one that would have forgotten.
import type { SourceFile } from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";
import { repoRelative, UI_SRC } from "../baseui-read.ts";
import type { GateDescriptor, GateRunCtx } from "../contract.ts";

const CONTAINER = "container";
const PORTAL_TAG_RE = /(?:^|\.)Portal$/u;

const MESSAGE =
  "a sealed Base UI portal does not expose its `container`. Base UI portals to `document.body` by default, " +
  "which sits outside every `<ThemeScope>`: the popup then resolves its theme variables against the ROOT " +
  "palette instead of the scope it was opened from, and it leaves the surrounding focus scope at the same " +
  "time. Every portal-bearing seal in @orb/ui takes a `container` prop and defaults it to the themed portal " +
  "root (`usePortalContainer()`), so the caller can override it per call site.";

const FIX =
  'declare `container?: BasePortalProps["container"]` on the seal\'s exported props interface (derive it — ' +
  "do not hand-spell the union), and pass it through: `<X.Portal container={container ?? portalContainer}>`. " +
  "packages/ui/src/primitives/dialog/dialog.tsx is the reference shape.";

const NO_PROP = (file: string): string =>
  `${file} renders a Base UI \`*.Portal\` but declares no \`container\` prop, so no caller can place the popup ` +
  "inside its ThemeScope — the popup will always land on document.body with the root palette.";
const NOT_WIRED =
  "this `*.Portal` gets no `container` — the seal's `container` prop exists but never reaches Base UI, which " +
  "reads like a seam while behaving exactly like the default (a dead wire is worse than a missing one). " +
  "packages/ui/src/primitives/dialog/dialog.tsx is the reference wiring.";

function isPortalTag(text: string): boolean {
  return PORTAL_TAG_RE.test(text);
}

/** Does any exported interface in this file declare a `container` member? */
function declaresContainer(sf: SourceFile): boolean {
  return sf.getInterfaces().some((i) => i.isExported() && i.getProperties().some((p) => p.getName() === CONTAINER));
}

function run(ctx: GateRunCtx): void {
  for (const sf of ctx.files) {
    const rel = repoRelative(sf.getFilePath());
    if (!rel.includes(UI_SRC)) {
      continue;
    }
    const portals = [...sf.getDescendantsOfKind(SyntaxKind.JsxOpeningElement), ...sf.getDescendantsOfKind(SyntaxKind.JsxSelfClosingElement)].filter((el) =>
      isPortalTag(el.getTagNameNode().getText()),
    );
    if (portals.length === 0) {
      continue;
    }
    if (!declaresContainer(sf)) {
      const first = portals[0];
      ctx.report({ file: rel, line: first === undefined ? 1 : first.getStartLineNumber(), column: 0, message: NO_PROP(rel) });
    }
    for (const el of portals) {
      const wired = el.getAttributes().some((a) => Node.isJsxAttribute(a) && a.getNameNode().getText() === CONTAINER);
      if (!wired) {
        ctx.report({ file: rel, line: el.getStartLineNumber(), column: 0, message: NOT_WIRED });
      }
    }
  }
}

const AT = "packages/ui/src/primitives/dialog/probe-dialog.tsx";

export const gate: GateDescriptor = {
  name: "baseui-portal-container-seam",
  docRow: "Core-Enforcement-Active-Gates.md (Layer 3)",
  status: "active",
  // Per-file: the portal, the props interface, and the wiring are all in the seal.
  scopeSafety: "incremental-safe",
  message: MESSAGE,
  fix: FIX,
  scanRoot: (p) => p.includes(UI_SRC),
  run,

  mustFlag: [
    {
      files:
        'import { Dialog as BaseDialog } from "@base-ui/react/dialog";\nexport interface DialogPopupProps {\n  className?: string;\n}\nexport const P = () => (\n  <BaseDialog.Portal>\n    <BaseDialog.Popup />\n  </BaseDialog.Portal>\n);\n',
      at: AT,
      expect: { messageIncludes: "declares no `container` prop" },
      why: "ARM A — the seal portals but offers the caller no way to place it, so every popup lands on document.body outside the ThemeScope",
    },
    {
      files:
        'import { Dialog as BaseDialog } from "@base-ui/react/dialog";\nexport interface DialogPopupProps {\n  container?: unknown;\n}\nexport const P = () => (\n  <BaseDialog.Portal>\n    <BaseDialog.Popup />\n  </BaseDialog.Portal>\n);\n',
      at: AT,
      expect: { messageIncludes: "never reaches Base UI" },
      why: "ARM B, the dead-wire half: the prop is declared but not threaded — an affordance that looks live and does nothing, which no type error can catch because the seal simply never reads it",
    },
    {
      files:
        'import { Dialog as BaseDialog } from "@base-ui/react/dialog";\nexport interface DialogPopupProps {\n  container?: unknown;\n}\nexport const P = () => <BaseDialog.Portal container={undefined} />;\nexport const Q = () => <BaseDialog.Portal />;\n',
      at: AT,
      expect: { count: 1 },
      why: "the SELF-CLOSING spelling, and per-OCCURRENCE granularity: one wired portal and one unwired portal in the same file must yield exactly one finding, on the unwired one",
    },
  ],
  mustPass: [
    {
      files:
        'import { Dialog as BaseDialog } from "@base-ui/react/dialog";\nimport type { DialogPortalProps as BasePortalProps } from "@base-ui/react/dialog";\nexport interface DialogPopupProps {\n  container?: BasePortalProps["container"];\n}\nexport const P = ({ container }: DialogPopupProps) => (\n  <BaseDialog.Portal container={container}>\n    <BaseDialog.Popup />\n  </BaseDialog.Portal>\n);\n',
      at: AT,
      why: "the reference shape all ten portal-bearing seals already have: a DERIVED container prop, threaded through to Base UI",
    },
    {
      files: 'export interface CardProps {\n  className?: string;\n}\nexport const C = () => <div className="x" />;\n',
      at: "packages/ui/src/primitives/card/probe-card.tsx",
      why: "a seal with no portal at all owes nothing — the gate keys on the rendered `*.Portal`, not on the package",
    },
  ],
};
