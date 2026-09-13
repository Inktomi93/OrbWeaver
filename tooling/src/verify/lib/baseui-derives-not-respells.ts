// The `baseui-derives-not-respells` family's ONE shared reader: given a @orb/ui seal file and the
// committed Base UI surface ledger, which exported interface members RE-SPELL a prop the wrapped component
// already declares, and which arm each one belongs to.
//
// WHY A `lib/` MODULE RATHER THAN ONE GATE IMPORTING THE OTHER (#2096, owner ruling 2026-09-12): the two
// policies are a SPLIT of one legacy descriptor whose arms differ in AUTHORITY — the handler arm takes no
// exemption and the data-prop arm is waivable — and a gate module never imports another gate module. Both
// siblings import this module; nothing about the computation is duplicated, which is the invariant the
// split depends on (they must agree on what "forwarded", "derives" and "the root" mean, or one arm's
// exemption silently licenses the other's).
//
// WHAT "DERIVES" MEANS, and it is deliberately SYNTACTIC: the member's declared type text must name a Base
// UI props type the file imports, or a local alias whose body does (one hop — the diagnostic-legibility
// idiom, `Parameters<NonNullable<BaseRootProps["onValueChange"]>>[1]`). Identifier identity is exact, so a
// lookalike local name merely CONTAINING the imported type's spelling is not a derive.
import type { InterfaceDeclaration, PropertySignature, SourceFile, TypeNode } from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";
import type { BaseUiBinding, ManifestPart, SurfaceManifest } from "../contract/baseui.ts";
import { signatureArity } from "./baseui-expand.ts";
import { baseUiBindings, renderedTagNames } from "./baseui-read.ts";

/** One file's Base UI context: which props are in play, and which local type names count as a derive. */
export interface FileContext {
  /** Prop names this file actually FORWARDS to a Base UI part — by an attribute of that name, or by any
   *  spread onto the part (a spread carries everything, so every handler the part accepts is in play).
   *  THIS IS WHAT KEEPS THE FAMILY HONEST: a seal may own a callback that merely SHARES a name with a base
   *  handler. `ColorField.onValueChange` is exactly that — it fires only for a value that passed the D44
   *  colour clamp, is never handed to `Field.Control`, and has no eventDetails to preserve. Judging by name
   *  alone reds it, and an exemption row for it would be an apology for the matcher, not a decision. */
  readonly forwarded: Set<string>;
  /** handler prop name → `{ arity, owner }` over the ROOT plus every part the file renders. */
  readonly handlers: Map<string, { arity: number; owner: string }>;
  /** non-handler prop name → owner, over the ROOT only (the data arm's measured scope). */
  readonly rootProps: Map<string, string>;
  /** Local identifiers bound to a Base UI TYPE import — naming one is what "derives" means here. */
  readonly baseTypes: Set<string>;
  /** Local aliases whose bodies structurally reference a Base UI type, for one-hop resolution. */
  readonly derivedAliases: Set<string>;
}

/** Mutable accumulator for one file's scan — the three maps `fileContext` fills. */
interface Surface {
  readonly handlers: Map<string, { arity: number; owner: string }>;
  readonly rootProps: Map<string, string>;
  readonly baseTags: Set<string>;
}

/** Fold ONE part of ONE binding's component into the file's surface. Handlers come from the Root plus every
 *  part the file renders (a handler travels to whichever part it is wired to); plain data props come from
 *  the ROOT only, which is the data arm's measured scope. */
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
 *  at all — a file importing only TYPES from Base UI has no seal surface and is not this family's business. */
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
function referencesIdentifier(type: TypeNode, names: ReadonlySet<string>): boolean {
  return (Node.isIdentifier(type) && names.has(type.getText())) || type.getDescendantsOfKind(SyntaxKind.Identifier).some((id) => names.has(id.getText()));
}

function derivesFromBase(type: TypeNode | undefined, ctx: FileContext): boolean {
  return type !== undefined && (referencesIdentifier(type, ctx.baseTypes) || referencesIdentifier(type, ctx.derivedAliases));
}

export function fileContext(sf: SourceFile, manifest: SurfaceManifest): FileContext | undefined {
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
  const derivedAliases = new Set<string>();
  for (const alias of sf.getTypeAliases()) {
    const type = alias.getTypeNode();
    if (type !== undefined && referencesIdentifier(type, baseTypes)) {
      derivedAliases.add(alias.getName());
    }
  }
  return { forwarded: forwardedProps(sf, surface), handlers: surface.handlers, rootProps: surface.rootProps, baseTypes, derivedAliases };
}

/** One re-spelled member, already classified into the arm that owns it.
 *
 *  `handler` and `rootOwner` are MUTUALLY EXCLUSIVE and at most one is set, which is what makes the split
 *  total: a member with `handler` is the hard sibling's finding, a member with `rootOwner` is the ordinary
 *  sibling's, and a member with neither is nobody's. Deriving both arms in one pass is the point — two
 *  independent classifiers would be two answers to "is this prop forwarded", and the exemption on one arm
 *  would start licensing the other. */
export interface RespelledMember {
  readonly member: PropertySignature;
  readonly name: string;
  /** The offset of the prop name inside the member text — the waiver COORDINATE for the ordinary arm. */
  readonly offset: number;
  readonly handler?: { readonly arity: number; readonly owner: string };
  readonly ourArity?: number;
  readonly rootOwner?: string;
}

/** Every re-spelled member of ONE exported interface, in source order. */
export function respelledMembers(iface: InterfaceDeclaration, ctx: FileContext): readonly RespelledMember[] {
  const isPropsInterface = iface.getName().endsWith("Props");
  const out: RespelledMember[] = [];
  for (const member of iface.getProperties()) {
    const name = member.getName();
    const typeNode = member.getTypeNode();
    if (derivesFromBase(typeNode, ctx) || !ctx.forwarded.has(name)) {
      continue;
    }
    const offset = Math.max(member.getText().indexOf(name), 0);
    const ourArity = signatureArity(typeNode);
    const handler = ctx.handlers.get(name);
    if (ourArity !== undefined && handler !== undefined) {
      out.push({ member, name, offset, handler, ourArity });
      continue;
    }
    const rootOwner = ourArity === undefined && isPropsInterface ? ctx.rootProps.get(name) : undefined;
    if (rootOwner !== undefined) {
      out.push({ member, name, offset, rootOwner });
    }
  }
  return out;
}
