import type { EndpointFeatures } from "@orb/contracts/inference";
import { endpointFeaturesSchema, foldFeatures } from "@orb/contracts/inference";

/** Uses the production field-wise fold rather than replacing an entire nested feature block. */
export function makeEndpointFeatures(overrides: EndpointFeatures = {}): EndpointFeatures {
  return endpointFeaturesSchema.parse(foldFeatures(overrides));
}
