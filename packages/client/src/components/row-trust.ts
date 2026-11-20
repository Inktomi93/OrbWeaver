// The row a framed document reports its trust facts to, so the row says one character-trust notice for every frame it
// draws (`plain-content-notice.tsx`).

import type { CharacterId, ChatId } from "@orb/kit/ids";
import { createContext, use, useEffect, useId, useState } from "react";
import type { FrameTrustFacts } from "#lib";

/** One framed document on a row, with the room it minted under. */
export interface ReportedFrame extends FrameTrustFacts {
  readonly chatId: ChatId;
}

export interface RowTrust {
  readonly report: (key: string, frame: ReportedFrame | undefined) => void;
}

export const RowTrustReport = createContext<RowTrust | null>(null);
RowTrustReport.displayName = "RowTrustReport";
export const RowTrustFrames = createContext<readonly ReportedFrame[]>([]);
RowTrustFrames.displayName = "RowTrustFrames";

function sameIds(left: readonly CharacterId[], right: readonly CharacterId[]): boolean {
  return left.length === right.length && left.every((id, index) => id === right[index]);
}

export function sameFrame(left: ReportedFrame | undefined, right: ReportedFrame | undefined): boolean {
  if (left === undefined || right === undefined) {
    return left === right;
  }
  return (
    left.chatId === right.chatId &&
    left.characterId === right.characterId &&
    sameIds(left.carriedFrom, right.carriedFrom) &&
    left.granted.externalMedia === right.granted.externalMedia &&
    left.granted.interactive === right.granted.interactive &&
    left.needsScripts === right.needsScripts &&
    left.needsMedia === right.needsMedia
  );
}

/** Report one framed document's grant and needs to its row; `undefined` withdraws it. Outside a row (the streaming
 *  ghost), nothing listens and nothing is said. */
export function useReportFrameTrust(frame: ReportedFrame | undefined): void {
  const scope = use(RowTrustReport);
  const key = useId();
  // The report keeps its identity until its content changes, so the effect runs once per real change.
  const [reported, setReported] = useState(frame);
  if (!sameFrame(reported, frame)) {
    setReported(frame);
  }
  useEffect(() => {
    if (scope === null) {
      return;
    }
    scope.report(key, reported);
    return (): void => {
      scope.report(key, undefined);
    };
  }, [scope, key, reported]);
}

/** The frames reported in the enclosing row. */
export function useRowFrames(): readonly ReportedFrame[] {
  return use(RowTrustFrames);
}
