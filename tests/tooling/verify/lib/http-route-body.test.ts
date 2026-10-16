import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import { Project, SyntaxKind } from "ts-morph";
import { isCappedStreamCall, resolvesCapMiddleware } from "../../../../tooling/src/verify/lib/http-route-body.ts";

test("finite same-file stream and middleware aliases reach their origin without a depth cutoff", () => {
  const project = new Project({ useInMemoryFileSystem: true });
  const source = project.createSourceFile(
    "/body.ts",
    `const body0 = c.req.raw.body;
const cap0 = bodyLimit({maxSize:MAX_BODY_BYTES});
${Array.from({ length: 16 }, (_, index) => `const body${String(index + 1)}=body${String(index)};const cap${String(index + 1)}=cap${String(index)};`).join("\n")}
stageCapped(body16,path,IMPORT_MAX_TOTAL_BYTES);
app.post('/x',cap16,async c=>c.req.json());`,
  );
  const calls = source.getDescendantsOfKind(SyntaxKind.CallExpression);
  const stream = calls.find((call) => call.getExpression().getText() === "stageCapped");
  const middleware = calls.find((call) => call.getExpression().getText() === "app.post")?.getArguments()[1];
  if (stream === undefined || middleware === undefined) {
    throw new Error("body alias controls are missing");
  }
  expect(isCappedStreamCall(stream)).toBe(true);
  expect(resolvesCapMiddleware(middleware)).toBe(true);
});

test("cycles, mutable aliases and imported consts do not prove a body cap", () => {
  const project = new Project({ useInMemoryFileSystem: true });
  project.createSourceFile("/foreign.ts", "export const imported=bodyLimit({maxSize:MAX_BODY_BYTES});");
  const source = project.createSourceFile(
    "/body.ts",
    `import {imported} from './foreign';
const left=right;const right=left;
let mutable=bodyLimit({maxSize:MAX_BODY_BYTES});
const streamLeft=streamRight;const streamRight=streamLeft;
app.post('/cycle',left,async c=>c.req.json());
app.post('/mutable',mutable,async c=>c.req.json());
app.post('/foreign',imported,async c=>c.req.json());
stageCapped(streamLeft,path,IMPORT_MAX_TOTAL_BYTES);`,
  );
  const calls = source.getDescendantsOfKind(SyntaxKind.CallExpression);
  const middleware = calls.filter((call) => call.getExpression().getText() === "app.post").map((call) => call.getArguments()[1]);
  expect(middleware).toHaveLength(3);
  for (const value of middleware) {
    if (value === undefined) {
      throw new Error("body cap refusal control is missing");
    }
    expect(resolvesCapMiddleware(value)).toBe(false);
  }
  const stream = calls.find((call) => call.getExpression().getText() === "stageCapped");
  if (stream === undefined) {
    throw new Error("stream cycle control is missing");
  }
  expect(isCappedStreamCall(stream)).toBe(false);
});
