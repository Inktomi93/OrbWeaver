import type { ReactElement } from "react";
import { trpcErrorCode } from "#lib";

function isGone(error: unknown): boolean {
  return trpcErrorCode(error) === "NOT_FOUND";
}

export function View({ error }: { readonly error: unknown }): ReactElement {
  return <p>{isGone(error) ? "gone" : "failed"}</p>;
}
