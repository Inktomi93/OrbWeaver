import type { ReactElement } from "react";

function isGone(error: unknown): boolean {
  return (error as { data?: { code?: string } } | null | undefined)?.data?.code === "NOT_FOUND";
}

export function View({ error }: { readonly error: unknown }): ReactElement {
  return <p>{isGone(error) ? "gone" : "failed"}</p>;
}
