import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import { parseRequest } from "../../../../tooling/src/verify/lib/run-argv.ts";

test("native full qualification accepts a runtime partition without turning it into file scope", () => {
  const plan = parseRequest(["--full", "--partition=node", "--shard=1/3"]);
  expect(plan).not.toHaveProperty("error");
  expect(plan).toMatchObject({ tier: "full", applicationOnly: true, partition: "node", shard: "1/3", request: undefined });
});

for (const args of [
  ["--static", "--partition=node", "--shard=1/3"],
  ["--full", "--partition=node"],
  ["--full", "--partition=node", "--shard=1/4"],
  ["--full", "--partition=ct", "--shard=0/5"],
  ["--weekly", "--partition=static"],
  ["--full", "--partition=static", "--file", "package.json"],
  ["--full", "--aggregate=reports", "--partition=static"],
]) {
  test(`invalid application partition refuses ${args.join(" ")}`, () => {
    expect(parseRequest(args)).toHaveProperty("error");
  });
}
