// Test-only constructors for inference's open foreign identities. Production code must validate at its
// own trust boundary; fixtures use these parsers so direct Drizzle writes cannot smuggle bare strings.

import type { ProviderId } from "@orb/contracts/inference";
import { modelIdSchema, providerIdSchema } from "@orb/contracts/inference";
import type { ModelId } from "@orb/kit/ids";

export function testModelId(value: string): ModelId {
  return modelIdSchema.parse(value);
}

export function testProviderId(value: string): ProviderId {
  return providerIdSchema.parse(value);
}
