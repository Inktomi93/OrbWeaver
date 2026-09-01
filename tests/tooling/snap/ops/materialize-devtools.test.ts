import { literalModuleAssetPaths } from "../../../../tooling/src/snap/lib/devtools-module-assets.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

const REVISION = "33c2f401a9c8ddad2159eb0ab83aa244a5247361";
const MODULE = `/serve_rev/@${REVISION}/models/formatter/formatter.js`;

test("literal closure follows URL and executable resolve edges but not dynamic or CSS source-label forms", () => {
  const paths = literalModuleAssetPaths(
    MODULE,
    `new URL("./formatter.css", import.meta.url);
     import.meta.resolve("../../entrypoints/formatter_worker/formatter_worker-entrypoint.js");
     import.meta.resolve(dynamicPath);
     \`/*# sourceURL=\${import.meta.resolve("./inline-label.css")} */\`;`,
    REVISION,
  );

  expect(paths).toEqual([
    `/serve_rev/@${REVISION}/models/formatter/formatter.css`,
    `/serve_rev/@${REVISION}/entrypoints/formatter_worker/formatter_worker-entrypoint.js`,
  ]);
});
