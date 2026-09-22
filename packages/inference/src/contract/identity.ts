// Foreign identities owned by inference integrations. These brands keep external runtime handles distinct
// from canonical Orb TypeIDs while their schemas validate the producer boundary that first observes them.

import type { Branded } from "@orb/kit/ids";
import { brandedId } from "@orb/kit/ids";
import { z } from "zod";

/** The Anthropic Agent SDK daemon's opaque UUID handle. It is never Orb's BFF SessionId. */
export type AgentSdkSessionId = Branded<"AgentSdkSessionId">;
const foreignAgentSdkSessionId = brandedId<AgentSdkSessionId>();
export const agentSdkSessionIdSchema = z.uuid().transform((value) => foreignAgentSdkSessionId.parse(value)) satisfies z.ZodType<AgentSdkSessionId>;
