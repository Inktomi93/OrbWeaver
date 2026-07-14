// Shared harness for the tool-use domain (NOT a test file). Pure — the domain owns no tables, so no
// db: a frozen injected clock (advanced manually to pin durationMs) + a `can` stub that denies a
// configurable action set by throwing `DomainForbiddenError` (the real seam's contract) + a
// ToolDefinition factory over a recording handler.

import type { Can, Principal } from "@orb/contracts/identity";
import { DomainForbiddenError } from "@orb/kit/errors";
import { castId } from "@orb/kit/ids";
import type { z } from "zod";
import type {
  ToolDefinition,
  ToolExecutionContext,
  ToolHandler,
  ToolUseContext,
} from "../../../../packages/server/src/domain/tool-use";
import { FROZEN_AT_MS } from "../../../support/clock.ts";
import { principal as makePrincipal } from "../../../support/factories/principal.ts";

const FROZEN_AT = FROZEN_AT_MS;

export interface ToolUseHarness {
  readonly ctx: ToolUseContext;
  /** Advance the injected clock (ms) — call from inside a handler to pin durationMs. */
  readonly advance: (ms: number) => void;
  /** Actions the `can` stub denies (everything else allows). */
  readonly denied: Set<string>;
}

export function makeHarness(): ToolUseHarness {
  let at = FROZEN_AT;
  const denied = new Set<string>();
  const canImpl = (_principal: Principal, action: string): void => {
    if (denied.has(action)) {
      throw new DomainForbiddenError(`requires ${action} privilege`);
    }
  };
  // The overloaded Can interface collapses to one impl signature; the stub honors its throw contract.
  const can: Can = canImpl as Can;
  return {
    ctx: { can, clock: (): number => at },
    advance: (ms: number): void => {
      at += ms;
    },
    denied,
  };
}

function principalOf(handle: string): Principal {
  return makePrincipal(castId(`user_${handle}`), { handle: castId(handle) });
}

export function execOf(over: Partial<ToolExecutionContext> = {}): ToolExecutionContext {
  return {
    principal: principalOf("host"),
    triggeredBy: castId("user_trigger"),
    chatId: null,
    roster: null,
    ...over,
  };
}

/** A minimal builtin definition over `schema`, recording handler invocations into `sink`. */
export function defOf<A>(args: {
  readonly name: string;
  readonly schema: z.ZodType<A>;
  readonly handler: ToolHandler<A>;
  readonly capability?: ToolDefinition["capability"];
}): ToolDefinition<A> {
  return {
    name: args.name,
    description: `test tool ${args.name}`,
    argsSchema: args.schema,
    capability: args.capability ?? null,
    source: "builtin",
    handler: args.handler,
  };
}
