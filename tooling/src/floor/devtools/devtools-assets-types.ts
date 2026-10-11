// Shared leaf types for the DevTools asset boundary. Both the front door (devtools-assets.ts) and
// the static server (devtools-assets-server.ts) import from here — never from each other for types —
// so the edge between the two stays one-directional (dependency-cruiser `no-circular`).

export interface DevToolsAssetPin {
  readonly schemaVersion: 1;
  readonly playwrightVersion: string;
  readonly browserVersion: string;
  readonly chromiumRevision: string;
  readonly devtoolsFrontendRevision: string;
  readonly protocolVersion: string;
  readonly resourceCount: number;
  readonly decodedBytes: number;
  readonly manifestSha256: string;
}

export interface DevToolsAssetEntry {
  readonly url: string;
  readonly file: string;
  readonly bytes: number;
  readonly sha256: string;
  readonly mimeType: string;
  readonly licenseFamily: string;
}

export interface DevToolsAssetManifest {
  readonly schemaVersion: 1;
  readonly resources: readonly DevToolsAssetEntry[];
}

export interface VerifiedDevToolsAssets {
  readonly root: string;
  readonly pin: DevToolsAssetPin;
  readonly manifest: DevToolsAssetManifest;
  readonly filesByUrl: ReadonlyMap<string, { readonly entry: DevToolsAssetEntry; readonly body: Buffer }>;
}

export interface DevToolsAssetServer {
  readonly origin: string;
  readonly unexpectedRequests: readonly string[];
  readonly close: () => Promise<void>;
}
