import type { AddressInfo } from "node:net";
import { createServer } from "node:http";
import { listeningAddress } from "./_server-address.ts";

const server = createServer();
const { port } = listeningAddress(server);
const url = `http://127.0.0.1:${(listeningAddress(server)).port}`;
const other = createServer().address();
export { other, port, url };
