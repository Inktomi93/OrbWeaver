import { appendFileSync } from "node:fs";
import type { JsonValue } from "@orb/kit/json";
import { redactSecretsFromText } from "../../../packages/inference/src/backends/kit/openai-body.ts";
import type { ProviderScrubSet } from "../../../packages/inference/src/contract/errors.ts";

/** Append one probe row at its persistent evidence boundary. */
export function appendEvidence(path: string, row: object, secrets: ProviderScrubSet): void {
  appendFileSync(
    path,
    `${JSON.stringify(row, (_key, value: JsonValue | undefined) => {
      if (typeof value === "string") {
        return redactSecretsFromText(value, secrets);
      }
      if (value !== null && typeof value === "object" && !Array.isArray(value)) {
        return Object.fromEntries(Object.entries(value).map(([key, item]) => [redactSecretsFromText(key, secrets), item]));
      }
      return value;
    })}\n`,
  );
}
