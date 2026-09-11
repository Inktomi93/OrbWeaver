// The ONE `gh` door. Every failure is translated into an OPERATOR INSTRUCTION before it escapes: a raw
// "GraphQL: ..." dump tells the caller nothing about whether to retry, wait, or stop — the two rate-limit
// shapes need opposite responses and are distinguished here.

import { refuseDirectInvocation } from "../../_shared/entrypoint.ts";
import { execNicedSync } from "../../_shared/proc.ts";
import type { GraphqlVariables } from "../contract/types.ts";
import { MS_PER_SECOND, PRIMARY_RATE_LIMIT_RE, SECONDARY_RATE_LIMIT_RE } from "../lib/vocab.ts";

refuseDirectInvocation(import.meta.url, "pnpm work:item <command>");

function execOutput(error: unknown, channel: "stdout" | "stderr"): string {
  if (typeof error !== "object" || error === null) {
    return "";
  }
  const value = (error as Record<string, unknown>)[channel];
  if (typeof value === "string") {
    return value;
  }
  return Buffer.isBuffer(value) ? value.toString("utf8") : "";
}

function graphqlResetTime(): string {
  // The REST rate_limit endpoint is free — probing it never spends the budget it reports.
  // @orb-waive caught-failure-ownership(catch): only used to make an already-thrown rate-limit error message more specific — a failed probe of the reset time just falls back to a vaguer but still-actionable phrase in that same message, it never suppresses the real rate-limit failure itself. Ends if this return value starts being used outside a message string.
  try {
    const payload = JSON.parse(execNicedSync("gh", ["api", "rate_limit"])) as {
      readonly resources?: { readonly graphql?: { readonly reset?: number } };
    };
    const reset = payload.resources?.graphql?.reset;
    return typeof reset === "number" ? new Date(reset * MS_PER_SECOND).toISOString() : "the top of the hour";
  } catch {
    return "the top of the hour";
  }
}

function ghFailure(error: unknown, args: readonly string[]): Error {
  const detail = `${execOutput(error, "stderr")}\n${execOutput(error, "stdout")}`.trim();
  if (args[0] === "api" && args[1] === "graphql" && SECONDARY_RATE_LIMIT_RE.test(detail)) {
    return new Error(
      "GitHub GraphQL secondary rate limit hit; GitHub does not expose Retry-After through this tool, so back off per its documented guidance — wait at least one minute, then retry with exponential backoff if it fails again. Rerun this exact command after backing off.",
    );
  }
  if (args[0] === "api" && args[1] === "graphql" && PRIMARY_RATE_LIMIT_RE.test(detail)) {
    return new Error(`GitHub GraphQL rate limit exhausted; it resets at ${graphqlResetTime()}. Rerun this exact command after the reset.`);
  }
  if (detail !== "") {
    return new Error(detail);
  }
  return error instanceof Error ? error : new Error(String(error));
}

export function gh(args: readonly string[]): string {
  try {
    return execNicedSync("gh", args).trim();
  } catch (error) {
    throw ghFailure(error, args);
  }
}

export function graphql<T>(query: string, variables: GraphqlVariables): T {
  const args = ["api", "graphql", "-f", `query=${query}`];
  for (const [name, value] of Object.entries(variables)) {
    args.push(typeof value === "number" ? "-F" : "-f", `${name}=${value}`);
  }
  const payload = JSON.parse(gh(args)) as { readonly data?: T };
  if (payload.data === undefined) {
    throw new Error("GitHub GraphQL returned no data");
  }
  return payload.data;
}
