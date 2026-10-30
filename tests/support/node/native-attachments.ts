import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { TestInfo } from "@playwright/test";

type NativeAttachmentOptions = NonNullable<Parameters<TestInfo["attach"]>[1]>;
type NativeBodyAttachment = Omit<NativeAttachmentOptions, "path" | "body"> & {
  readonly body: NonNullable<NativeAttachmentOptions["body"]>;
};

/** Keep text evidence readable through the complete-file reader and preserve image extensions. */
export function nativeAttachmentExtension(contentType: string): string {
  if (contentType === "application/json") {
    return "json";
  }
  if (contentType === "image/png") {
    return "png";
  }
  return "txt";
}

/** Keep complete payloads file-backed in native reports while preserving test or step association. */
export async function attachNativeFile(
  info: TestInfo,
  target: Pick<TestInfo, "attach">,
  name: string,
  { body, ...options }: NativeBodyAttachment,
): Promise<void> {
  const directory = await mkdtemp(info.outputPath("attachment-source-"));
  const contentType = options.contentType ?? (typeof body === "string" ? "text/plain" : "application/octet-stream");
  const path = join(directory, `payload.${nativeAttachmentExtension(contentType)}`);
  await writeFile(path, body);
  await target.attach(name, { ...options, contentType, path });
  // Native attach has copied the file; failures above retain the source for diagnosis.
  await rm(directory, { recursive: true });
}
