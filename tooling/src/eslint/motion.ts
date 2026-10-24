import type { RuleVisitor } from "@eslint/core";
import type { TSESTree } from "@typescript-eslint/utils";
import { accessedName, isStyleMember, staticTextValue, unwrapTsValue } from "./static-values.ts";
import type { OrbRule, OrbRuleContext } from "./syntax.ts";

// Gates for the motion law (motion-and-animation-guide.md §1.5, §5.3). JS may supply the one fact CSS cannot know
// (a measured delta) and nothing else: eslint.config.ts scopes each rule and names every sanctioned home with its reason.

type FunctionLike = TSESTree.ArrowFunctionExpression | TSESTree.FunctionDeclaration | TSESTree.FunctionExpression;

const REQUEST_FRAME = "requestAnimationFrame";

// Reads that make the browser resolve style now, which is what turns an inline write into a transition's FROM state.
const FORCED_LAYOUT_CALLS = new Set(["getBoundingClientRect", "getClientRects", "getComputedStyle"]);
const FORCED_LAYOUT_READS = new Set(["offsetWidth", "offsetHeight", "offsetTop", "offsetLeft", "clientWidth", "clientHeight"]);

// The inline properties a FLIP inverts. A custom property or a paint-only colour is a value, not an inversion.
const MOTION_PROPERTY = /^(?:transform|translate|scale|rotate|opacity|transition[A-Za-z-]*|animation[A-Za-z-]*)$/u;

const FLIP_MESSAGE =
  "An inline motion write flushed by a forced layout read is a FLIP inversion: it is allowed only where a measured delta cannot be spelled in CSS, and each such site is a named home in eslint.config.ts (motion-and-animation-guide.md §1.5).";
const FRAME_STYLE_MESSAGE =
  "A style or animation write inside a requestAnimationFrame callback is JS producing animation values: key the motion off a state attribute and let a CSS transition run it (motion-and-animation-guide.md §1.5).";
const FRAME_LOOP_MESSAGE =
  "A requestAnimationFrame callback that takes the frame time and re-requests itself is a JS tween loop: it needs a named home in eslint.config.ts with its reason (motion-and-animation-guide.md §1.5).";

function enclosingFunction(node: TSESTree.Node): FunctionLike | undefined {
  // `Program.parent` is null at runtime, so the walk ends on a falsy parent.
  for (let current: TSESTree.Node | null | undefined = node.parent; current; current = current.parent) {
    if (current.type === "ArrowFunctionExpression" || current.type === "FunctionDeclaration" || current.type === "FunctionExpression") {
      return current;
    }
  }
  return undefined;
}

function functionName(fn: FunctionLike): string | undefined {
  if (fn.type !== "ArrowFunctionExpression" && fn.id !== null) {
    return fn.id.name;
  }
  const { parent } = fn;
  return parent.type === "VariableDeclarator" && parent.id.type === "Identifier" ? parent.id.name : undefined;
}

function plainMemberName(member: TSESTree.MemberExpression): string | undefined {
  return !member.computed && member.property.type === "Identifier" ? member.property.name : undefined;
}

function calleeName(context: OrbRuleContext, callee: TSESTree.Node): string | undefined {
  const target = unwrapTsValue(callee);
  if (target.type === "Identifier") {
    return target.name;
  }
  return target.type === "MemberExpression" ? accessedName(context, target) : undefined;
}

interface StyleWrite {
  readonly motion: boolean;
}

function assignedStyle(context: OrbRuleContext, node: TSESTree.AssignmentExpression): StyleWrite | undefined {
  if (node.left.type !== "MemberExpression" || !isStyleMember(context, node.left.object)) {
    return undefined;
  }
  const property = accessedName(context, node.left);
  return { motion: property !== undefined && MOTION_PROPERTY.test(property) };
}

function calledStyle(context: OrbRuleContext, node: TSESTree.CallExpression): StyleWrite | undefined {
  if (node.callee.type !== "MemberExpression") {
    return undefined;
  }
  const method = accessedName(context, node.callee);
  const [first] = node.arguments;
  const argument = first === undefined ? undefined : staticTextValue(context, first);
  if (method === "animate") {
    return { motion: true };
  }
  if (method === "setProperty" && isStyleMember(context, node.callee.object)) {
    const camel = typeof argument === "string" ? argument.replaceAll(/-([a-z])/gu, (_, letter: string) => letter.toUpperCase()) : "";
    return { motion: MOTION_PROPERTY.test(camel) };
  }
  return method === "setAttribute" && argument === "style" ? { motion: false } : undefined;
}

function isForcedLayoutRead(context: OrbRuleContext, node: TSESTree.Node): boolean {
  if (node.type === "CallExpression") {
    const name = calleeName(context, node.callee);
    return name !== undefined && FORCED_LAYOUT_CALLS.has(name);
  }
  if (node.type === "MemberExpression") {
    const written = node.parent.type === "AssignmentExpression" && node.parent.left === node;
    const name = accessedName(context, node);
    return !written && name !== undefined && FORCED_LAYOUT_READS.has(name);
  }
  return false;
}

/** True when `call` re-requests a frame callback that is its own enclosing function and takes the frame time. */
function reschedulesItself(call: TSESTree.CallExpression, target: string): boolean {
  for (let fn = enclosingFunction(call); fn !== undefined; fn = enclosingFunction(fn)) {
    if (functionName(fn) === target && fn.params.length > 0) {
      return true;
    }
  }
  return false;
}

function insideFrameCallback(node: TSESTree.Node, callbacks: ReadonlySet<TSESTree.Node>, names: ReadonlySet<string>): boolean {
  for (let fn = enclosingFunction(node); fn !== undefined; fn = enclosingFunction(fn)) {
    const name = functionName(fn);
    if (callbacks.has(fn) || (name !== undefined && names.has(name))) {
      return true;
    }
  }
  return false;
}

/**
 * Three shapes of JS-made motion: an inline motion write flushed by a forced layout read (the FLIP inversion), any
 * style or WAAPI write inside a requestAnimationFrame callback, and a frame-time callback that re-requests itself
 * (a tween loop). A non-style rAF use (focus, scroll, a React state flip, a canvas paint) is not matched.
 * Limit: a callback or write reached through another module is not followed.
 */
export const unruledFlipInversionRule: OrbRule = {
  meta: { type: "problem", schema: [] },
  create(context: OrbRuleContext): RuleVisitor {
    const firstMotionWrite = new Map<FunctionLike, number>();
    const flushes: { readonly fn: FunctionLike; readonly node: TSESTree.Node }[] = [];
    const styleWrites: TSESTree.Node[] = [];
    const frameCallbacks = new Set<TSESTree.Node>();
    const frameCallbackNames = new Set<string>();

    const noteWrite = (node: TSESTree.Node, write: StyleWrite | undefined): void => {
      const fn = enclosingFunction(node);
      if (write === undefined || fn === undefined) {
        return;
      }
      styleWrites.push(node);
      if (write.motion) {
        firstMotionWrite.set(fn, Math.min(firstMotionWrite.get(fn) ?? Number.POSITIVE_INFINITY, node.range[0]));
      }
    };
    const noteFlush = (node: TSESTree.Node): void => {
      const fn = enclosingFunction(node);
      if (fn !== undefined && isForcedLayoutRead(context, node)) {
        flushes.push({ fn, node });
      }
    };
    const noteFrameRequest = (call: TSESTree.CallExpression): void => {
      const callback = call.arguments[0] === undefined ? undefined : unwrapTsValue(call.arguments[0]);
      if (callback?.type === "Identifier") {
        frameCallbackNames.add(callback.name);
        if (reschedulesItself(call, callback.name)) {
          context.report({ node: call, message: FRAME_LOOP_MESSAGE });
        }
      } else if (callback?.type === "ArrowFunctionExpression" || callback?.type === "FunctionExpression") {
        frameCallbacks.add(callback);
      }
    };

    return {
      AssignmentExpression: (node: TSESTree.AssignmentExpression): void => noteWrite(node, assignedStyle(context, node)),
      MemberExpression: noteFlush,
      CallExpression: (call: TSESTree.CallExpression): void => {
        noteWrite(call, calledStyle(context, call));
        noteFlush(call);
        if (calleeName(context, call.callee) === REQUEST_FRAME) {
          noteFrameRequest(call);
        }
      },
      "Program:exit": (): void => {
        for (const { fn, node } of flushes) {
          if ((firstMotionWrite.get(fn) ?? Number.POSITIVE_INFINITY) < node.range[0]) {
            context.report({ node, message: FLIP_MESSAGE });
          }
        }
        for (const node of styleWrites) {
          if (insideFrameCallback(node, frameCallbacks, frameCallbackNames)) {
            context.report({ node, message: FRAME_STYLE_MESSAGE });
          }
        }
      },
    };
  },
};

// Lifecycle state a Base UI part publishes itself; a parallel React boolean for it disagrees through the exit.
const LIFECYCLE_STATE = /^(?:is)?(?:open|opened|closed|visible|shown|mounted|entering|exiting|starting|ending|expanded|collapsed)$/iu;
const LIFECYCLE_ATTRIBUTES = new Set(["data-starting-style", "data-ending-style", "data-open", "data-closed"]);
const STATE_HOOKS = new Set(["useState", "useReducer"]);

const STATE_CLASS_MESSAGE =
  "A Base UI part is styled from a local React state boolean: style its lifecycle from data-starting-style, data-ending-style, data-open and data-closed, which Base UI keeps in step with the exit animation (motion-and-animation-guide.md §5.3).";
const STAMPED_ATTRIBUTE_MESSAGE =
  "A Base UI part is handed a lifecycle data attribute: Base UI stamps data-starting-style, data-ending-style, data-open and data-closed itself, and a second writer breaks its exit detection (motion-and-animation-guide.md §5.3).";

function jsxRoot(name: TSESTree.JSXTagNameExpression): string | undefined {
  let current = name;
  while (current.type === "JSXMemberExpression") {
    current = current.object;
  }
  return current.type === "JSXIdentifier" ? current.name : undefined;
}

function hookName(callee: TSESTree.Expression): string | undefined {
  if (callee.type === "Identifier") {
    return callee.name;
  }
  return callee.type === "MemberExpression" ? plainMemberName(callee) : undefined;
}

/** The `className` attribute an identifier sits inside, as long as it is a read of a name rather than a key. */
function classNameOwner(identifier: TSESTree.Identifier): TSESTree.JSXOpeningElement | undefined {
  const { parent } = identifier;
  if (
    (parent.type === "Property" && parent.key === identifier && !parent.computed) ||
    (parent.type === "MemberExpression" && plainMemberName(parent) === identifier.name)
  ) {
    return undefined;
  }
  for (let current: TSESTree.Node | null | undefined = parent; current; current = current.parent) {
    if (current.type === "JSXAttribute") {
      return current.parent;
    }
  }
  return undefined;
}

function lifecycleStateName(node: TSESTree.VariableDeclarator): string | undefined {
  const [value] = node.id.type === "ArrayPattern" ? node.id.elements : [];
  const hook = node.init?.type === "CallExpression" ? hookName(node.init.callee) : undefined;
  return value?.type === "Identifier" && hook !== undefined && STATE_HOOKS.has(hook) && LIFECYCLE_STATE.test(value.name) ? value.name : undefined;
}

function handedLifecycleAttributes(opening: TSESTree.JSXOpeningElement): TSESTree.JSXAttribute[] {
  return opening.attributes.filter(
    (attribute): attribute is TSESTree.JSXAttribute =>
      attribute.type === "JSXAttribute" && attribute.name.type === "JSXIdentifier" && LIFECYCLE_ATTRIBUTES.has(attribute.name.name),
  );
}

/**
 * On a Base UI part, lifecycle styling comes from the part's own state attributes. Matches a lifecycle-named
 * `useState`/`useReducer` value read inside the part's `className`, and a hand-passed lifecycle `data-*` attribute.
 * Limit: lexical by name inside one file, so a state value renamed or derived first is not followed.
 */
export const baseUiStateDataAttributesRule: OrbRule = {
  meta: { type: "problem", schema: [] },
  create(context: OrbRuleContext): RuleVisitor {
    const partRoots = new Set<string>();
    const stateNames = new Set<string>();
    const openings: { readonly opening: TSESTree.JSXOpeningElement; readonly root: string }[] = [];
    const classReads: { readonly identifier: TSESTree.Identifier; readonly opening: TSESTree.JSXOpeningElement }[] = [];

    return {
      ImportDeclaration: (node: TSESTree.ImportDeclaration): void => {
        if (node.importKind === "type" || !node.source.value.startsWith("@base-ui/react")) {
          return;
        }
        for (const specifier of node.specifiers) {
          if (specifier.type !== "ImportSpecifier" || specifier.importKind !== "type") {
            partRoots.add(specifier.local.name);
          }
        }
      },
      VariableDeclarator: (node: TSESTree.VariableDeclarator): void => {
        const name = lifecycleStateName(node);
        if (name !== undefined) {
          stateNames.add(name);
        }
      },
      JSXOpeningElement: (node: TSESTree.JSXOpeningElement): void => {
        const root = jsxRoot(node.name);
        if (root !== undefined) {
          openings.push({ opening: node, root });
        }
      },
      "JSXAttribute[name.name='className'] Identifier": (identifier: TSESTree.Identifier): void => {
        const opening = classNameOwner(identifier);
        if (opening !== undefined) {
          classReads.push({ identifier, opening });
        }
      },
      "Program:exit": (): void => {
        const parts = new Set(openings.filter(({ root }) => partRoots.has(root)).map(({ opening }) => opening));
        for (const { identifier, opening } of classReads) {
          if (parts.has(opening) && stateNames.has(identifier.name)) {
            context.report({ node: identifier, message: STATE_CLASS_MESSAGE });
          }
        }
        for (const opening of parts) {
          for (const attribute of handedLifecycleAttributes(opening)) {
            context.report({ node: attribute, message: STAMPED_ATTRIBUTE_MESSAGE });
          }
        }
      },
    };
  },
};
