// The ONE `gh` door. Every failure is translated into an OPERATOR INSTRUCTION before it escapes: a raw
// "GraphQL: ..." dump tells the caller nothing about whether to retry, wait, or stop — the two rate-limit
// shapes need opposite responses and are distinguished here.

import { refuseDirectInvocation } from "../../_shared/entrypoint.ts";
import { execNicedSync } from "../../_shared/proc.ts";
import type { GraphqlVariables } from "../contract/types.ts";
import { MS_PER_SECOND, PRIMARY_RATE_LIMIT_RE, SECONDARY_RATE_LIMIT_RE } from "../lib/vocab.ts";

refuseDirectInvocation(import.meta.url, "pnpm work:item <command>");

/** THE STDOUT CEILING THIS DOOR AGREES TO CAPTURE. Unset means node's implicit ~1 MiB and a KILLED child
 *  (`_shared/proc-contract.ts#CaptureCeilingOption`), which the citation census brought within ~3× — so the
 *  ceiling is DECLARED, generous enough for a repository three times today's size, and named in its own
 *  refusal. It is a defaulted PARAMETER on both doors for the `ops/eslint.ts#readDiscoveredPopulation`
 *  reason: a ceiling nobody can plant is a ceiling whose refusal nobody can prove, and a 16 MiB fixture is
 *  not a fixture anyone will build. */
const BYTES_PER_KIB = 1024;
const KIB_PER_MIB = 1024;
const GH_BUFFER_MIB = 16;
const GH_MAX_BUFFER_BYTES = GH_BUFFER_MIB * KIB_PER_MIB * BYTES_PER_KIB;
const ENOBUFS = "ENOBUFS";
/** Enough of the argv to identify the call without pasting a whole GraphQL document into the message. */
const GH_ARGS_IN_MESSAGE = 2;
const GRAPHQL_ERROR_MAX_CHARS = 300;

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

function ghFailure(error: unknown, args: readonly string[], maxBuffer: number): Error {
  // THE CEILING IS OURS, SO THE REFUSAL MUST SAY SO — the ledger-claims verb's precedent (#2284). `execFileSync`
  // KILLS the child at `maxBuffer` rather than truncating, and the generic path below builds its message
  // from the CAPTURED STDOUT: that turns our own limit into "GitHub returned garbage" AND spills every issue
  // body in the page into stderr and the operator's CI log. The bulk citation read is the payload that made
  // this reachable (`number state` → `number state title body projectItems`, measured 313.5 KiB on the
  // largest of 24 pages), so the refusal names the ceiling and prints NONE of the response.
  if (typeof error === "object" && error !== null && (error as { readonly code?: unknown }).code === ENOBUFS) {
    return new Error(
      `gh ${args.slice(0, GH_ARGS_IN_MESSAGE).join(" ")} produced more than this door's ${String(maxBuffer)}-byte stdout ceiling ` +
        "(GH_MAX_BUFFER_BYTES in tooling/src/workboard/ops/gh.ts), so the child was KILLED with ENOBUFS rather than truncated and NO " +
        "response was read. GitHub did not fail. Narrow the page size, or raise the ceiling. The response is deliberately NOT printed: " +
        "it is over a megabyte of issue bodies.",
    );
  }
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

export function gh(args: readonly string[], maxBuffer: number = GH_MAX_BUFFER_BYTES): string {
  try {
    return execNicedSync("gh", args, { maxBuffer }).trim();
  } catch (error) {
    throw ghFailure(error, args, maxBuffer);
  }
}

/** EVERY GraphQL error is a refusal, even beside a `data` block. GraphQL's own contract allows a response
 *  to carry BOTH — a field-level failure nulls its field and reports why — and keying only on
 *  `data !== undefined` accepts that half-answer as a verdict. Unreachable while `gh` exits non-zero on
 *  errors, which is why it is a two-line guard rather than a subsystem; the reader downstream validates
 *  every field it uses, and this is the layer above that says the SERVER already told us it failed. The
 *  message is the first error only and capped: a refusal that pastes a whole payload is unreadable, and
 *  these payloads carry issue bodies. */
function graphqlErrors(payload: { readonly errors?: unknown }): string | undefined {
  const errors = payload.errors;
  if (!Array.isArray(errors) || errors.length === 0) {
    return;
  }
  const first = errors[0];
  const message = typeof first === "object" && first !== null ? (first as { readonly message?: unknown }).message : undefined;
  const text = typeof message === "string" ? message : JSON.stringify(first);
  return `${text.length > GRAPHQL_ERROR_MAX_CHARS ? `${text.slice(0, GRAPHQL_ERROR_MAX_CHARS)}…` : text}${errors.length > 1 ? ` (+${String(errors.length - 1)} more)` : ""}`;
}

export function graphql<T>(query: string, variables: GraphqlVariables, maxBuffer: number = GH_MAX_BUFFER_BYTES): T {
  const args = ["api", "graphql", "-f", `query=${query}`];
  for (const [name, value] of Object.entries(variables)) {
    args.push(typeof value === "number" ? "-F" : "-f", `${name}=${value}`);
  }
  const payload = JSON.parse(gh(args, maxBuffer)) as { readonly data?: T; readonly errors?: unknown };
  const failed = graphqlErrors(payload);
  if (failed !== undefined) {
    throw new Error(`GitHub GraphQL reported an error, so this response is a PARTIAL answer and not a verdict: ${failed}`);
  }
  if (payload.data === undefined) {
    throw new Error("GitHub GraphQL returned no data");
  }
  return payload.data;
}
