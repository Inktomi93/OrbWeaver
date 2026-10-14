// Settings writes and native acceptance share invocation order; native issuance never occupies this lane.
import { createSerialLanes } from "@orb/kit/serial-lanes";
import type { CertificateTransitions } from "../contract/service.ts";

const CERTIFICATE_LANE = "certificate";

export function createCertificateTransitions(): CertificateTransitions {
  const lanes = createSerialLanes();
  let closed = false;
  let disposal: Promise<void> | undefined;
  return {
    run: (job) => (closed ? Promise.reject(new Error("The share certificate transitions are disposed")) : lanes.run(CERTIFICATE_LANE, job)),
    [Symbol.asyncDispose](): Promise<void> {
      closed = true;
      disposal ??= lanes.run(CERTIFICATE_LANE, (): Promise<void> => Promise.resolve());
      return disposal;
    },
  };
}
