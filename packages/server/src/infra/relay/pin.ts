// The ONE home of the cloudflared pin: the release, and each platform asset's exact size and sha256. To move it, hash
// every asset at `releases/download/<version>/<file>` and check each value against the SHA256 list in that release's
// notes before it lands here; the controller refuses any byte that differs, so a wrong value only ever refuses.

import type { CloudflaredPin } from "./contract.ts";

/** cloudflared 2026.9.3, https://github.com/cloudflare/cloudflared/releases/tag/2026.9.3 */
export const CLOUDFLARED_PIN: CloudflaredPin = {
  version: "2026.9.3",
  releaseBase: "https://github.com/cloudflare/cloudflared/releases/download",
  // github.com answers a release asset with a 302 to release-assets.githubusercontent.com (measured on 2026.9.3).
  downloadHosts: ["github.com", "release-assets.githubusercontent.com"],
  assets: {
    "linux-x64": {
      file: "cloudflared-linux-amd64",
      packaging: "binary",
      bytes: 40_122_749,
      sha256: "77e26d8d900e0b8469f416239d14b5f296525fdf79fee6f511ef55609e3fbac2",
    },
    "linux-arm64": {
      file: "cloudflared-linux-arm64",
      packaging: "binary",
      bytes: 37_685_657,
      sha256: "aaeb2d7d0da3614634c7e03ab13487a1522c2e79165ed2929cfe23d5e95b326d",
    },
    "linux-arm": {
      file: "cloudflared-linux-arm",
      packaging: "binary",
      bytes: 36_573_408,
      sha256: "967dc371a3fedbf09e881c13ee7ba317155ebc336cbd4afb756b46fc6785e5af",
    },
    "linux-ia32": {
      file: "cloudflared-linux-386",
      packaging: "binary",
      bytes: 37_419_453,
      sha256: "d6b2f917e2e78b3e3afba760af726e51751d10c2fcad4a2fb2a69feb4bd47421",
    },
    "darwin-x64": {
      file: "cloudflared-darwin-amd64.tgz",
      packaging: "tgz",
      bytes: 21_740_193,
      sha256: "d1155d0837487f261183b15c1eab6c4ebcad9dc49b94675f1524c3564cea3977",
    },
    "darwin-arm64": {
      file: "cloudflared-darwin-arm64.tgz",
      packaging: "tgz",
      bytes: 19_784_166,
      sha256: "587c2cfb1c230fe36c7fa7727da78be459dae028cabe8c001291999350f07095",
    },
    "win32-x64": {
      file: "cloudflared-windows-amd64.exe",
      packaging: "binary",
      bytes: 55_366_080,
      sha256: "f096265ec2fcbe9bb6e2d64268db167ced3fcbb83d894bdb9e2fcdb26f2ea7e2",
    },
    "win32-ia32": {
      file: "cloudflared-windows-386.exe",
      packaging: "binary",
      bytes: 37_702_280,
      sha256: "9b95ddc2eba67b86ed3dc4cc2a15881960563031b52ce564376af41fb91ad402",
    },
  },
};
