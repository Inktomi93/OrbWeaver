// App-level render-throw catch. Unlike QueryBoundary, no query underneath to reset on retry — a stale
// state that threw once will throw again, so the fallback offers no retry, only a full reload.

import type { ErrorInfo, ReactNode } from "react";
import { Component, captureOwnerStack } from "react";
import { IS_DEV } from "./dev-flag.ts";

export interface AppErrorBoundaryProps {
  /** Renders the crash fallback for the caught error. */
  readonly renderFallback: (error: Error) => ReactNode;
  /** Fire-and-forget report hook; never awaited, must not compound the crash it's reporting. */
  readonly onError?: (error: Error, ownerStack: string | null) => void;
  readonly children: ReactNode;
}

interface CatchState {
  readonly error: Error | null;
}

export class AppErrorBoundary extends Component<AppErrorBoundaryProps, CatchState> {
  override state: CatchState = { error: null };

  static getDerivedStateFromError(error: Error): CatchState {
    return { error };
  }

  override componentDidCatch(error: Error, _info: ErrorInfo): void {
    const ownerStack = IS_DEV ? captureOwnerStack() : null;
    // The report path must never compound the crash it exists to report, so a throw from the reporter is logged to the
    // console, the one surface left (the console-error ring records it), and never rethrown.
    try {
      this.props.onError?.(error, ownerStack);
    } catch (reportError) {
      console.error("the crash report could not be sent", reportError);
    }
  }

  override render(): ReactNode {
    const { error } = this.state;
    if (error !== null) {
      return this.props.renderFallback(error);
    }
    return this.props.children;
  }
}
