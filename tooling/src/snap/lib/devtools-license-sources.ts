export interface DevToolsLicenseSource {
  readonly family: string;
  readonly assetPrefix: string;
  readonly paths: readonly string[];
}

export const DEVTOOLS_LICENSE_SOURCES: readonly DevToolsLicenseSource[] = [
  { family: "devtools-frontend", assetPrefix: "", paths: ["LICENSE"] },
  { family: "acorn", assetPrefix: "third_party/acorn/", paths: ["front_end/third_party/acorn/README.chromium"] },
  {
    family: "chromium-client-variations",
    assetPrefix: "third_party/chromium/client-variations/",
    paths: ["front_end/third_party/chromium/README.chromium"],
  },
  {
    family: "codemirror.next",
    assetPrefix: "third_party/codemirror.next/",
    paths: ["front_end/third_party/codemirror.next/LICENSE", "front_end/third_party/codemirror.next/README.chromium"],
  },
  {
    family: "diff",
    assetPrefix: "third_party/diff/",
    paths: ["front_end/third_party/diff/LICENSE", "front_end/third_party/diff/README.chromium"],
  },
  {
    family: "i18n",
    assetPrefix: "third_party/i18n/",
    paths: ["front_end/third_party/i18n/LICENSE", "front_end/third_party/i18n/README.chromium"],
  },
  {
    family: "intl-messageformat",
    assetPrefix: "third_party/intl-messageformat/",
    paths: ["front_end/third_party/intl-messageformat/LICENSE", "front_end/third_party/intl-messageformat/README.chromium"],
  },
  {
    family: "legacy-javascript",
    assetPrefix: "third_party/legacy-javascript/",
    paths: ["front_end/third_party/legacy-javascript/LICENSE", "front_end/third_party/legacy-javascript/README.chromium"],
  },
  {
    family: "lighthouse",
    assetPrefix: "third_party/lighthouse/",
    paths: ["front_end/third_party/lighthouse/LICENSE", "front_end/third_party/lighthouse/README.chromium"],
  },
  {
    family: "lit",
    assetPrefix: "third_party/lit/",
    paths: ["front_end/third_party/lit/LICENSE", "front_end/third_party/lit/README.chromium"],
  },
  {
    family: "marked",
    assetPrefix: "third_party/marked/",
    paths: ["front_end/third_party/marked/LICENSE", "front_end/third_party/marked/README.chromium"],
  },
  {
    family: "source-map-scopes-codec",
    assetPrefix: "third_party/source-map-scopes-codec/",
    paths: ["front_end/third_party/source-map-scopes-codec/LICENSE", "front_end/third_party/source-map-scopes-codec/README.chromium"],
  },
  {
    family: "third-party-web",
    assetPrefix: "third_party/third-party-web/",
    paths: ["front_end/third_party/third-party-web/LICENSE", "front_end/third_party/third-party-web/README.chromium"],
  },
] as const;
