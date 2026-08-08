// Gate: baseui-derives-not-respells — a @orb/ui seal's exported props interface DERIVES the props it shares
// with the Base UI component it wraps; it never hand-writes a second spelling of one. A re-spelling is not
// a stylistic duplicate: it is a NARROWER type that silently deletes capability from every caller, and tsc
// cannot tell you, because the seal only ever passes the value onward.
//
// ARM A — HANDLERS (hard, no exemption). A member whose name is a FUNCTION-typed prop of a Base UI part the
// file renders must reference that part's props type. This is the eventDetails class, and it is the whole
// reason the gate exists: Base UI change handlers are `(value, eventDetails) => void`, where `eventDetails`
// carries `cancel()` / `allowPropagation()`. A seal re-declaring `onValueChange?: (value: string) => void`
// strips the second argument out of the TYPE and out of the mapper, and no caller can ever get it back.
// MEASURED AT LANDING: 3 live sites — `Textarea.onValueChange` and `ColorField.onValueChange` (both drop
// `Field.Control`'s eventDetails, arity 2 → 1, while `textarea.tsx`'s own comment claims the opposite), and
// `Meter.getAriaValueText` (same arity, still a hand copy that rots when the signature moves).
//
// ARM B — DATA PROPS (marker-exempt). A NON-function member of a `*Props` interface whose name is a prop of
// the wrapped component's ROOT — the part a seal spreads its rest props onto — must derive too, unless the
// narrowing is DELIBERATE and says so:
//     // @orb-gate-ignore baseui-derives-not-respells(items): Base UI's `items` is `readonly any[]`; the seal
//     // narrows it to the discriminated option union it renders. Ends if Select.Item stops taking objects.
// The marker names its POSITION (§4.3a) because one line can carry two guarded props, and `pass.ts` reds a
// marker that suppressed nothing or over-exempted (gate-ignore-inventory).
//
// WHY ROOT-ONLY FOR ARM B, measured rather than assumed: widening ARM B to every rendered part took the
// population from 19 to 30+ and every one of the additions was a coincidence — `SelectOption.label` colliding
// with `Select.Item`'s `label`, `container: PortalContainer` colliding with `Portal`'s `container`. A gate
// that needs 11 apology rows to be green is an allowlist that lies about what it exempts.
//
// DECLARED LIMITS (each with a mustPass row): "derives" is a SYNTACTIC reference test — the member's type text
// must name a Base UI props type the file imports, or a local alias whose body does (one hop, the
// diagnostic-legibility idiom). A local type that merely happens to be named like a base props type passes.
// And ARM B judges only `*Props` interfaces: a plain data shape in a seal file is not the seal's prop surface.
import type { InterfaceDeclaration, SourceFile } from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";
import type { BaseUiBinding, ManifestPart, SurfaceManifest } from "../baseui-read.ts";
import { BASE_UI_MANIFEST_REL, baseUiBindings, readManifest, renderedTagNames, repoRelative, signatureArity, UI_SRC } from "../baseui-read.ts";
import type { GateDescriptor, GateRunCtx } from "../contract.ts";

const MESSAGE =
  "a @orb/ui seal hand-writes a prop the Base UI component it wraps already declares. The seal's copy is a " +
  "SECOND spelling of one shape: it drifts silently the day Base UI widens the prop (two structurally " +
  "different types are still assignable through the seal's own pass-through), and when the prop is an event " +
  "handler the copy actively DESTROYS capability — Base UI's `(value, eventDetails) => void` becomes " +
  "`(value) => void` and `eventDetails.cancel()` / `.allowPropagation()` stop existing for every caller.";

const FIX =
  'derive it from the part\'s own props type: `onValueChange?: SelectRootProps<Value>["onValueChange"]`, ' +
  '`side?: SelectPositionerProps["side"]`, `type Details = Parameters<NonNullable<BaseRootProps["onValueChange"]>>[1]`, ' +
  "or `extends Omit<SelectRootProps, …>` for the whole surface (packages/ui/src/primitives/select/select.tsx " +
  "and combobox/combobox.tsx are the in-tree forms). If a DATA prop is deliberately narrower than Base UI's, " +
  "keep the hand declaration and say so on the line above: " +
  "`// @orb-gate-ignore baseui-derives-not-respells(<propName>): <why, and what would end it>`.";

const HANDLER_MESSAGE = (prop: string, owner: string, baseArity: number, ourArity: number): string =>
  `\`${prop}\` re-declares \`${owner}\`'s handler by hand${ourArity < baseArity ? ` and DROPS ${baseArity - ourArity} of its ${baseArity} arguments — Base UI passes \`eventDetails\` there (cancel/allowPropagation), and this signature deletes it` : " (same arity today, but a hand copy rots the moment the signature moves)"}. Derive it: \`${prop}?: <BasePropsType>["${prop}"]\`. This arm takes no exemption.`;

/** One file's Base UI context: which props are in play, and which local type names count as a derive. */
interface FileContext {
  /** Prop names this file actually FORWARDS to a Base UI part — by an attribute of that name, or by any
   *  spread onto the part (a spread carries everything, so every handler the part accepts is in play).
   *  THIS IS WHAT KEEPS THE GATE HONEST: a seal may own a callback that merely SHARES a name with a base
   *  handler. `ColorField.onValueChange` is exactly that — it fires only for a value that passed the D44
   *  colour clamp, is never handed to `Field.Control`, and has no eventDetails to preserve. Judging by name
   *  alone reds it, and an exemption row for it would be an apology for the matcher, not a decision. */
  readonly forwarded: Set<string>;
  /** handler prop name → { arity, owner } over the ROOT plus every part the file renders. */
  readonly handlers: Map<string, { arity: number; owner: string }>;
  /** non-handler prop name → owner, over the ROOT only (ARM B's measured scope). */
  readonly rootProps: Map<string, string>;
  /** Local identifiers bound to a Base UI TYPE import — naming one is what "derives" means here. */
  readonly baseTypes: Set<string>;
  /** Local type-alias name → its right-hand text, for the one-hop derive resolution. */
  readonly aliases: Map<string, string>;
}

/** Mutable accumulator for one file's scan — the three maps `fileContext` fills. */
interface Surface {
  readonly handlers: Map<string, { arity: number; owner: string }>;
  readonly rootProps: Map<string, string>;
  readonly baseTags: Set<string>;
}

/** Fold ONE part of ONE binding's component into the file's surface. Handlers come from the Root plus every
 *  part the file renders (a handler travels to whichever part it is wired to); plain data props come from
 *  the ROOT only, which is ARM B's measured scope. */
function foldPart(surface: Surface, binding: BaseUiBinding, part: ManifestPart, at: { name: string; tag: string; isRoot: boolean }): void {
  const owner = `${binding.exported}.${at.name}`;
  surface.baseTags.add(at.tag);
  for (const [prop, arity] of Object.entries(part.handlers)) {
    if (!surface.handlers.has(prop)) {
      surface.handlers.set(prop, { arity, owner });
    }
  }
  if (!at.isRoot) {
    return;
  }
  for (const prop of part.props) {
    if (!(prop in part.handlers || surface.rootProps.has(prop))) {
      surface.rootProps.set(prop, owner);
    }
  }
}

/** Fold ONE value binding's component into the surface. Returns whether the binding named a known component
 *  at all — a file importing only TYPES from Base UI has no seal surface and is not this gate's business. */
function foldBinding(surface: Surface, manifest: SurfaceManifest, binding: BaseUiBinding, tags: ReadonlyMap<string, number>): boolean {
  const component = manifest.components[binding.exported];
  if (component === undefined) {
    return false;
  }
  for (const [name, part] of Object.entries(component.parts)) {
    const isRoot = name === (component.namespaced ? "Root" : binding.exported);
    const tag = component.namespaced ? `${binding.local}.${name}` : binding.local;
    if (isRoot || tags.has(tag)) {
      foldPart(surface, binding, part, { name, tag, isRoot });
    }
  }
  return true;
}

function fileContext(sf: SourceFile, manifest: SurfaceManifest): FileContext | undefined {
  const bindings = baseUiBindings(sf);
  if (bindings.length === 0) {
    return;
  }
  const surface: Surface = { handlers: new Map(), rootProps: new Map(), baseTags: new Set() };
  const baseTypes = new Set<string>();
  const tags = renderedTagNames(sf);
  let sawValue = false;
  for (const binding of bindings) {
    if (binding.typeOnly) {
      baseTypes.add(binding.local);
      continue;
    }
    sawValue = foldBinding(surface, manifest, binding, tags) || sawValue;
  }
  if (!sawValue) {
    return;
  }
  const aliases = new Map<string, string>();
  for (const alias of sf.getTypeAliases()) {
    aliases.set(alias.getName(), alias.getTypeNode()?.getText() ?? "");
  }
  return { forwarded: forwardedProps(sf, surface), handlers: surface.handlers, rootProps: surface.rootProps, baseTypes, aliases };
}

/** Prop names this file hands to a Base UI part. A named attribute forwards itself; a SPREAD forwards
 *  everything, so a part carrying `{...rest}` puts every prop in play (over-inclusive by design — a spread
 *  really does deliver whatever it holds, and the seal cannot claim otherwise). */
function forwardedProps(sf: SourceFile, surface: Surface): Set<string> {
  const out = new Set<string>();
  const elements = [...sf.getDescendantsOfKind(SyntaxKind.JsxOpeningElement), ...sf.getDescendantsOfKind(SyntaxKind.JsxSelfClosingElement)];
  for (const el of elements) {
    if (!surface.baseTags.has(el.getTagNameNode().getText())) {
      continue;
    }
    for (const attr of el.getAttributes()) {
      if (Node.isJsxAttribute(attr)) {
        out.add(attr.getNameNode().getText());
        continue;
      }
      for (const name of [...surface.handlers.keys(), ...surface.rootProps.keys()]) {
        out.add(name);
      }
    }
  }
  return out;
}

/** Does this member's declared type REFERENCE a Base UI props type — directly, or through one hop of a
 *  same-file type alias? (`ComboboxChangeDetails` → `Parameters<NonNullable<BaseRootProps[…]>>[1]`.) */
function derivesFromBase(text: string, ctx: FileContext): boolean {
  for (const name of ctx.baseTypes) {
    if (text.includes(name)) {
      return true;
    }
  }
  for (const [alias, body] of ctx.aliases) {
    if (!text.includes(alias)) {
      continue;
    }
    for (const name of ctx.baseTypes) {
      if (body.includes(name)) {
        return true;
      }
    }
  }
  return false;
}

function judgeInterface(gateCtx: GateRunCtx, iface: InterfaceDeclaration, ctx: FileContext): void {
  const isPropsInterface = iface.getName().endsWith("Props");
  for (const member of iface.getProperties()) {
    const name = member.getName();
    const typeNode = member.getTypeNode();
    const text = typeNode?.getText() ?? "";
    if (derivesFromBase(text, ctx)) {
      continue;
    }
    // The token is the PROP NAME so a suppression can name its position (§4.3a) and the caret lands on it.
    if (!ctx.forwarded.has(name)) {
      continue;
    }
    const at = { token: name, offset: Math.max(member.getText().indexOf(name), 0) };
    const ourArity = signatureArity(typeNode);
    const handler = ctx.handlers.get(name);
    if (ourArity !== undefined && handler !== undefined) {
      // ARM A keeps the explicit-`Finding` overload DELIBERATELY, and that is the one thing separating it
      // from ARM B one branch below (which uses the node overload). This file's header states the rule —
      // "ARM A — HANDLERS (hard, no exemption)" — and the overload is what enforces it: `hasGateIgnore` only
      // reads leading comments off a NODE, so a Finding-overload arm cannot be marker-suppressed at all
      // (GATE-AUTHORING §1). An `onValueChange` that silently drops Base UI's `eventDetails` deletes
      // capability from every caller with no type error anywhere; there is no site-local reason that makes
      // that correct, so there must be no site-local escape. The finding still carries the member's LINE and
      // the prop NAME as its token so the jump-link and §4.3a position survive.
      // @finding-overload-ok: ARM A is non-suppressible BY DESIGN (this file's header: "hard, no exemption") — the overload is the enforcement, not an oversight; ends if the eventDetails class ever gains a legitimate per-site narrowing, at which point it becomes ARM B
      gateCtx.report({
        file: repoRelative(iface.getSourceFile().getFilePath()),
        line: member.getStartLineNumber(),
        column: 0,
        token: name,
        message: HANDLER_MESSAGE(name, handler.owner, handler.arity, ourArity),
      });
      continue;
    }
    const owner = ourArity === undefined && isPropsInterface ? ctx.rootProps.get(name) : undefined;
    if (owner !== undefined) {
      gateCtx.report(member, at);
    }
  }
}

function run(gateCtx: GateRunCtx): void {
  const manifest = readManifest(gateCtx.root);
  if (manifest === undefined) {
    return; // baseui-surface-manifest owns the missing-ledger finding.
  }
  for (const sf of gateCtx.files) {
    if (!repoRelative(sf.getFilePath()).includes(UI_SRC)) {
      continue;
    }
    const ctx = fileContext(sf, manifest);
    if (ctx === undefined) {
      continue;
    }
    for (const iface of sf.getInterfaces()) {
      if (iface.isExported()) {
        judgeInterface(gateCtx, iface, ctx);
      }
    }
  }
}

// ── self-proof substrate ────────────────────────────────────────────────────────────────────────────
const MANIFEST_FILE: Readonly<Record<string, string>> = {
  [BASE_UI_MANIFEST_REL]:
    '{ "version": "9.9.9", "components": { "Select": { "module": "@base-ui/react/select", "namespaced": true, "parts": {' +
    '"Root": { "kind": "part", "symbol": "SelectRoot", "from": "./root/SelectRoot.js", "props": ["items", "onValueChange"], "handlers": { "onValueChange": 2 }, "inherits": [], "disposition": "exposed", "why": "" },' +
    '"Value": { "kind": "part", "symbol": "SelectValue", "from": "./value/SelectValue.js", "props": ["placeholder"], "handlers": {}, "inherits": [], "disposition": "exposed", "why": "" }' +
    "} } } }\n",
};
const SEAL_PATH = "packages/ui/src/primitives/select/probe-select.tsx";
const IMPORTS = 'import type { SelectRootProps } from "@base-ui/react/select";\nimport { Select as BaseSelect } from "@base-ui/react/select";\n';
/** The realistic seal shape: the props are SPREAD onto the Base UI Root, which is what puts them in play. */
const RENDER = "export const Seal = (p: SealProps) => <BaseSelect.Root {...p} />;\n";

function seal(body: string): Readonly<Record<string, string>> {
  return { ...MANIFEST_FILE, [SEAL_PATH]: `${IMPORTS}export interface SealProps {\n${body}}\n${RENDER}` };
}

export const gate: GateDescriptor = {
  name: "baseui-derives-not-respells",
  docRow: "Core-Enforcement-Active-Gates.md (Layer 3)",
  status: "active",
  // Per-FILE verdicts: a seal file plus the committed ledger is everything the answer needs, so a scoped
  // run over the changed seals is correct for those seals.
  scopeSafety: "incremental-safe",
  message: MESSAGE,
  fix: FIX,
  scanRoot: (p) => p.includes(UI_SRC),
  // The ledger is read off disk.
  fsBacked: true,
  run,

  mustFlag: [
    {
      files: seal("  onValueChange?: (value: string) => void;\n"),
      expect: { messageIncludes: "DROPS 1 of its 2 arguments" },
      why: "ARM A, THE FOUNDING DEFECT (crunch item 6): the seal re-declares Base UI's change handler one argument short, deleting `eventDetails.cancel()` from every caller — still live in Textarea and ColorField at authoring time",
    },
    {
      files: seal("  onValueChange?: (value: string, details: unknown) => void;\n"),
      expect: { messageIncludes: "a hand copy rots" },
      why: "ARM A's second flavour: the arity matches, so an arity-only rule would pass it — but `details: unknown` is a hand copy that stops agreeing with Base UI the day the details type grows a member",
    },
    {
      files: seal("  items?: readonly string[];\n"),
      expect: { messageIncludes: "SECOND spelling" },
      why: "ARM B: a DATA prop of the Root re-spelled by hand with no marker — the narrowing may well be right, but it has to be stated",
    },
    {
      files: seal("  // @orb-gate-ignore baseui-derives-not-respells(placeholder): a different prop's position\n  items?: readonly string[];\n"),
      expect: { messageIncludes: "SECOND spelling" },
      why: "§4.3a two-sidedness: a marker naming a position that is NOT the violating one must not absolve it — a positioned marker that could absolve any neighbour is the loaded gun the grammar exists to prevent",
    },
    {
      files: seal("  // @orb-gate-ignore baseui-derives-not-respells(items)\n  items?: readonly string[];\n"),
      expect: { messageIncludes: "SECOND spelling" },
      why: "§4.3 MALFORMED marker — no `: <reason>`. It must suppress NOTHING, precisely so it cannot sit there looking like protection",
    },
  ],
  mustPass: [
    {
      files: seal('  onValueChange?: SelectRootProps["onValueChange"];\n  items?: SelectRootProps["items"];\n'),
      why: "the remedy: an indexed access into the part's own props type — one shape, one home, and a Base UI widening arrives for free",
    },
    {
      files: seal(
        "  // @orb-gate-ignore baseui-derives-not-respells(items): the seal narrows Base UI's `readonly any[]` to the option union it renders. Ends if Select.Item stops taking objects.\n  items?: readonly string[];\n",
      ),
      why: "the SANCTIONED narrowing: a positioned marker carrying its reason AND its end condition — ARM B is about stating the decision, not forbidding it",
    },
    {
      files: seal("  placeholder?: string;\n"),
      why: "a DECLARED LIMIT: `placeholder` is a prop of `Select.Value`, not of Root. Widening ARM B past the Root took the population from 19 to 30+, every addition a coincidence — the scope is measured, not assumed",
    },
    {
      files: {
        ...MANIFEST_FILE,
        [SEAL_PATH]: `${IMPORTS}export interface SelectOption {\n  items?: readonly string[];\n}\n${RENDER}export interface SealProps { x?: number }\n`,
      },
      why: "a DECLARED LIMIT: a plain DATA shape in a seal file is not the seal's prop surface — ARM B judges `*Props` interfaces only, or `SelectOption.value`/`SelectOptionGroup.items` would need apology rows for a collision that means nothing",
    },
    {
      files: {
        ...MANIFEST_FILE,
        [SEAL_PATH]: `${IMPORTS}type Details = Parameters<NonNullable<SelectRootProps["onValueChange"]>>[1];\nexport interface SealProps {\n  onValueChange?: (value: string, details?: Details) => void;\n}\n${RENDER}`,
      },
      why: "the one-hop alias derive — the live `combobox.tsx` shape: the handler is hand-written so the seal can synthesize a change with no originating event, but its DETAILS type is pinned to Base UI's, so eventDetails survives",
    },
    {
      files: { ...MANIFEST_FILE, "packages/ui/src/primitives/x/x.tsx": "export interface SealProps {\n  items?: readonly string[];\n}\n" },
      why: "a file with no Base UI binding at all has no base surface to re-spell — the gate must not fire on the word `items` alone",
    },
    {
      files: {
        ...MANIFEST_FILE,
        [SEAL_PATH]: `${IMPORTS}export interface SealProps {\n  onValueChange?: (value: string) => void;\n}\nexport const Seal = (p: SealProps) => {\n  const commit = (v: string) => p.onValueChange?.(v);\n  return <BaseSelect.Root items={[]} render={<button type="button" onClick={() => commit("x")} />} />;\n};\n`,
      },
      why: "THE FORWARDING TEST, and the reason the gate needs no apology row: a seal's OWN callback that merely SHARES a name with a base handler is never handed to Base UI, so there is no eventDetails to preserve. `ColorField.onValueChange` is the live case — it fires only for a value that passed the D44 colour clamp. Judging by name alone would red it",
    },
  ],
};
