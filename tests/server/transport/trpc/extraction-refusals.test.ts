// The transport classifier answers both extraction refusals as client errors, each with its own code, on every door
// that reaches the extraction op. The loader's own text rides only as the cause and is not the message sent.
// @subject packages/server/src/transport/trpc/error-mapping.ts

import { EXTRACTION_OP_CODES, ExtractionFailedError, UnsupportedDocTypeError } from "@orb/contracts/extraction";
import { classifyDomainError } from "@orb/server/transport/trpc";
import { present } from "@orb/testkit/iso";
import { expect, test } from "@orb/testkit/node";

const LOADER_FAULT = new Error("invalid zip data in /srv/orb/uploads/private-ledger.docx");

const REFUSALS = [
  { label: "a failed extraction", error: new ExtractionFailedError("docx", { cause: LOADER_FAULT }), code: EXTRACTION_OP_CODES.failed },
  { label: "an unsupported document type", error: new UnsupportedDocTypeError("text/csv"), code: EXTRACTION_OP_CODES.unsupportedType },
] as const;

test.for(REFUSALS)("$label is a BAD_REQUEST carrying its own code and its own message", ({ error, code }) => {
  const classified = classifyDomainError(error);
  expect(classified).toMatchObject({ code: "BAD_REQUEST", message: error.message, cause: { code } });
  expect(present(classified).message).not.toContain(LOADER_FAULT.message);
});
