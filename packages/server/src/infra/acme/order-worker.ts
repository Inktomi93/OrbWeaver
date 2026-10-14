// The native ACME order owns its sockets, poll waits and HTTP-01 responder inside one terminable worker.
import { parentPort, workerData } from "node:worker_threads";
import { redactKnownSecrets } from "@orb/kit/secret-redaction";
import { acmeWorkerRequestSchema } from "./contract.ts";
import { openChallengeResponder } from "./http-01.ts";
import { createAcmeIssuer } from "./issuer.ts";

if (parentPort === null) {
  throw new Error("ACME order requires its owning worker channel");
}
const { request, directoryUrl, polling } = acmeWorkerRequestSchema.parse(workerData);
const issuer = createAcmeIssuer({ directoryUrl, polling, openResponder: openChallengeResponder });
const outcome = await issuer.issue({ ...request, bindHost: request.bindHost });
// The native client's authority-error formatter removes LF characters before returning its detail.
parentPort.postMessage(
  outcome.ok ? outcome : { ...outcome, detail: redactKnownSecrets(outcome.detail, [request.accountKeyPem, request.accountKeyPem.replaceAll("\n", "")]) },
);
parentPort.close();
