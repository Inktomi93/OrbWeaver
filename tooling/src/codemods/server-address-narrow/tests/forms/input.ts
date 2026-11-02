import type { AddressInfo } from "node:net";
import { createServer } from "node:http";

const server = createServer();
const { port } = server.address() as AddressInfo;
const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
const other = createServer().address();
export { other, port, url };
