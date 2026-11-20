// The ONE home of the cloudflared pin: the release, and each platform asset's exact size and sha256. To move it, hash
// every asset at `releases/download/<version>/<file>` and check each value against the SHA256 list in that release's
// notes before it lands here; the controller refuses any byte that differs, so a wrong value only ever refuses.
// The notes list a darwin `.tgz` by the sha256 of the `cloudflared` executable inside it, not of the archive: pin the
// archive's own hash, and check its one entry against the notes.
// The tunnel overlay's image tag in `docker/compose.cloudflared.yaml` names this version; move both together.

import type { CloudflaredPin } from "./contract.ts";

/** cloudflared 2026.10.1, https://github.com/cloudflare/cloudflared/releases/tag/2026.10.1 */
export const CLOUDFLARED_PIN: CloudflaredPin = {
  version: "2026.10.1",
  releaseBase: "https://github.com/cloudflare/cloudflared/releases/download",
  // github.com answers a release asset with a 302 to release-assets.githubusercontent.com (measured on 2026.10.1).
  downloadHosts: ["github.com", "release-assets.githubusercontent.com"],
  assets: {
    "linux-x64": {
      file: "cloudflared-linux-amd64",
      packaging: "binary",
      bytes: 40_227_032,
      sha256: "3bfc539f45d2620c71debb7a86be0efa737ed5ccbad9eb85c787116900e5c586",
    },
    "linux-arm64": {
      file: "cloudflared-linux-arm64",
      packaging: "binary",
      bytes: 37_651_992,
      sha256: "2c65dfabf616c40efc7545d107d7a57ad5e21377e2964b7e88af19a238074a46",
    },
    "linux-arm": {
      file: "cloudflared-linux-arm",
      packaging: "binary",
      bytes: 37_121_444,
      sha256: "598445dbe19d789d2901c57bb9df5b070cc2c4f817c48b0ae2702a93d15a468e",
    },
    "linux-ia32": {
      file: "cloudflared-linux-386",
      packaging: "binary",
      bytes: 37_649_732,
      sha256: "9f5794f4e0bf2a4be8b3a3b8cc97720f60b3686089e07cebfd90aa9826b31749",
    },
    "darwin-x64": {
      file: "cloudflared-darwin-amd64.tgz",
      packaging: "tgz",
      bytes: 21_768_449,
      sha256: "3b0dbaf378337e9d7fb6cd235a76d1d6a7dee434c2d8edf9281164fb6a3837ab",
    },
    "darwin-arm64": {
      file: "cloudflared-darwin-arm64.tgz",
      packaging: "tgz",
      bytes: 19_807_806,
      sha256: "647615df99d49cd179ea5e13ef760b9bbfb33630f6ae62f87e33dfadda60adcc",
    },
    "win32-x64": {
      file: "cloudflared-windows-amd64.exe",
      packaging: "binary",
      bytes: 55_325_120,
      sha256: "4d2490e74082c5d48dbfedaf92576fa5bd1702379ab88eb7faa0cfbe8dc891b6",
    },
    "win32-ia32": {
      file: "cloudflared-windows-386.exe",
      packaging: "binary",
      bytes: 38_055_048,
      sha256: "a0c9a47af2cbd681005e4c1210edf95f986ecc66cee6d68b0e42c484af465d2e",
    },
  },
};
