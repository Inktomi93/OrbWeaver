import { observeViewTransition } from "../lib/view-transition-settlement.ts";

type RouterUpdate = () => Promise<void>;
type NativeUpdate = () => void | Promise<void>;
type NativeStartArgument = NativeUpdate | { readonly update: NativeUpdate; readonly types?: readonly string[] };

interface RouterViewTransitionPort {
  startViewTransition: (update: RouterUpdate) => void;
}

interface NativeTransition {
  readonly ready?: Promise<unknown>;
  readonly finished?: Promise<unknown>;
  readonly updateCallbackDone?: Promise<unknown>;
}

interface ViewTransitionDocument {
  startViewTransition?: (update: NativeStartArgument) => NativeTransition | undefined;
}

interface ViewTransitionGlobals {
  readonly document?: ViewTransitionDocument;
}

/** Observe settlement for TanStack's retained navigation transitions. Router-core owns the update. */
export function observeRouterViewTransitions(router: RouterViewTransitionPort): void {
  const originalRouterStart = router.startViewTransition.bind(router);
  router.startViewTransition = (update): void => {
    const globals = globalThis as ViewTransitionGlobals;
    const transitionDocument = globals.document;
    const nativeStart = transitionDocument?.startViewTransition;
    if (transitionDocument === undefined || nativeStart === undefined) {
      originalRouterStart(update);
      return;
    }
    transitionDocument.startViewTransition = (argument): NativeTransition | undefined => {
      const transition = nativeStart.call(transitionDocument, argument);
      observeViewTransition(transition);
      return transition;
    };
    try {
      originalRouterStart(update);
    } finally {
      transitionDocument.startViewTransition = nativeStart;
    }
  };
}
