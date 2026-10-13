// The session lifecycle's browser-document port. Data owns the auth/recovery decisions; main.tsx binds
// the real document once at composition, so those decisions never import DOM types or reach a feature.

export interface SessionDocumentHost {
  /** Current document pathname, or null when no browser document is bound. */
  readonly currentPathname: () => string | null;
  /** Order a whole-document navigation. */
  readonly assign: (path: string) => void;
  /** Whether this document is currently visible. */
  readonly isVisible: () => boolean;
  /** Subscribe to visibility changes; returns the unsubscribe. */
  readonly subscribeVisibility: (listener: () => void) => () => void;
}

const unbound: SessionDocumentHost = {
  currentPathname: (): null => null,
  assign: (): never => {
    throw new Error("Session document host is not bound.");
  },
  isVisible: (): false => false,
  subscribeVisibility: (): (() => void) => (): void => undefined,
};

let current: SessionDocumentHost = unbound;
const mountedHosts = new Map<symbol, SessionDocumentHost>();

function activeHost(): SessionDocumentHost {
  return [...mountedHosts.values()].at(-1) ?? current;
}

/** Composition-root-only: bind the real browser document before the first render. */
export function bindSessionDocumentHost(host: SessionDocumentHost | null): void {
  current = host ?? unbound;
}

/** Scoped composition restores the document port even when nested mounts release out of order. */
export function leaseSessionDocumentHost(host: SessionDocumentHost): Disposable {
  const owner = Symbol("session document mount");
  mountedHosts.set(owner, host);
  return {
    [Symbol.dispose]: (): void => {
      mountedHosts.delete(owner);
    },
  };
}

/** Stable facade used by data-tier session code; every call reaches the currently bound document. */
export const sessionDocument: SessionDocumentHost = {
  currentPathname: () => activeHost().currentPathname(),
  assign: (path) => activeHost().assign(path),
  isVisible: () => activeHost().isVisible(),
  subscribeVisibility: (listener) => activeHost().subscribeVisibility(listener),
};
