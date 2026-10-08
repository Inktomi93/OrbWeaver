// Attach from the current CT lease before its cache is deleted; never refetch or rebuild measured code.
import { basename, join } from "node:path";
import { errorMessage } from "@orb/kit/error-message";

export const SELECT_NATIVE_SOURCES_ATTACHMENT = "select-native-source-retention";

interface SourceAttachment {
  readonly path: string;
  readonly contentType: string;
}

interface RetainNativeSourcesOptions {
  readonly cacheDir: string | undefined;
  readonly pageUrl: string;
  readonly scriptUrls: readonly string[];
  readonly attach: (name: string, options: SourceAttachment) => Promise<void>;
}

interface RetainedFile {
  readonly relativePath: string;
  readonly attachmentName: string | null;
  readonly error: string | null;
}

export interface NativeSourcesReceipt {
  readonly complete: boolean;
  readonly error: string | null;
  readonly ignoredUrls: readonly string[];
  readonly assets: readonly {
    readonly url: string;
    readonly source: RetainedFile;
    readonly map: RetainedFile;
  }[];
}

/** Retain exact emitted JS and adjacent external maps through Playwright's copying attachment boundary. */
export async function retainNativeSources(options: RetainNativeSourcesOptions): Promise<NativeSourcesReceipt> {
  const assets: NativeSourcesReceipt["assets"][number][] = [];
  const ignoredUrls: string[] = [];
  const cacheDir = options.cacheDir;
  if (cacheDir === undefined) {
    return { complete: false, error: "The native capture has no CT lease cache directory", assets, ignoredUrls };
  }
  const attachFile = async (relativePath: string, attachmentName: string, contentType: string): Promise<RetainedFile> => {
    try {
      await options.attach(attachmentName, { path: join(cacheDir, relativePath), contentType });
      return { relativePath, attachmentName, error: null };
    } catch (error) {
      return { relativePath, attachmentName: null, error: errorMessage(error) };
    }
  };
  const origin = new URL(options.pageUrl).origin;
  for (const url of new Set(options.scriptUrls)) {
    const parsed = URL.parse(url);
    // CT's emitted chunks are flat assets; evaluation scripts and foreign URLs do not name lease files.
    if (parsed === null || parsed.origin !== origin || !/^\/assets\/[^/]+\.js$/u.test(parsed.pathname)) {
      ignoredUrls.push(url);
      continue;
    }
    const relativePath = parsed.pathname.slice(1);
    const attachmentName = `select-native-source-${String(assets.length)}-${basename(relativePath)}`;
    const source = await attachFile(relativePath, attachmentName, "application/javascript");
    const map = await attachFile(`${relativePath}.map`, `${attachmentName}.map`, "application/json");
    assets.push({ url, source, map });
  }
  return {
    complete: assets.length > 0 && assets.every(({ source, map }) => source.error === null && map.error === null),
    error: assets.length === 0 ? "The native capture referenced no emitted CT JavaScript assets" : null,
    ignoredUrls,
    assets,
  };
}
