// The OS tool parsers behind the platform module, each driven with the documented output shape of its tool
// so the darwin and win32 branches are proven on Linux. A parser that misreads a column returns the wrong
// pid to a kill path, so every column and every state filter has its own row.
import {
  parseCimProcesses,
  parseLsofSockets,
  parseNetstatSockets,
  parseProcStatCpuMs,
  parseProcStatGroup,
  parseProcStatusParent,
  parsePsClock,
  parsePsProcesses,
  parseSsSockets,
  splitHostPort,
} from "../../../tooling/src/_shared/platform-parse.ts";
import { expect, test } from "../../support/tool-fixtures.ts";

const SS_LISTENING = [
  "State   Recv-Q  Send-Q   Local Address:Port    Peer Address:Port  Process",
  'LISTEN  0       511      127.0.0.1:8788        0.0.0.0:*          users:(("node",pid=1234,fd=23))',
  'LISTEN  0       511      [::1]:5173            [::]:*             users:(("node",pid=5678,fd=19))',
  "LISTEN  0       128      0.0.0.0:22            0.0.0.0:*",
  "",
].join("\n");

const SS_ESTABLISHED = [
  "Recv-Q Send-Q Local Address:Port  Peer Address:Port Process",
  '0      0      127.0.0.1:8788      127.0.0.1:52134   users:(("node",pid=1234,fd=30))',
  '0      0      127.0.0.1:52134     127.0.0.1:8788    users:(("chrome",pid=999,fd=40))',
  "",
].join("\n");

const LSOF_LISTENING = ["p1234", "f23", "n127.0.0.1:8788", "p5678", "f19", "n[::1]:5173", "n*:5175", ""].join("\n");
const LSOF_ESTABLISHED = ["p999", "f40", "n127.0.0.1:52134->127.0.0.1:8788", ""].join("\n");

const NETSTAT = [
  "",
  "Active Connections",
  "",
  "  Proto  Local Address          Foreign Address        State           PID",
  "  TCP    127.0.0.1:8788         0.0.0.0:0              LISTENING       1234",
  "  TCP    [::1]:5173             [::]:0                 LISTENING       5678",
  "  TCP    127.0.0.1:52134        127.0.0.1:8788         ESTABLISHED     999",
  "  TCP    0.0.0.0:135            0.0.0.0:0              LISTENING       0",
  "  UDP    0.0.0.0:5353           *:*                                    4321",
  "",
].join("\n");

test("splitHostPort splits on the LAST colon, so an IPv6 local address keeps its port", () => {
  expect(splitHostPort("[::1]:5173")).toEqual({ host: "[::1]", port: 5173 });
  expect(splitHostPort("127.0.0.1:8788")).toEqual({ host: "127.0.0.1", port: 8788 });
  expect(splitHostPort("*:8790")).toEqual({ host: "*", port: 8790 });
  expect(splitHostPort("garbage")).toBeNull();
  expect(splitHostPort("host:notaport")).toBeNull();
});

test("ss listeners: the pid comes from the users column, and a socket without one has no owner", () => {
  expect(parseSsSockets(SS_LISTENING)).toEqual([
    { localPort: 8788, peerHost: "", peerPort: 0, listening: true, pid: 1234 },
    { localPort: 5173, peerHost: "", peerPort: 0, listening: true, pid: 5678 },
    { localPort: 22, peerHost: "", peerPort: 0, listening: true, pid: null },
  ]);
});

test("ss under a state filter drops the State column, and the peer is read off the shifted column", () => {
  expect(parseSsSockets(SS_ESTABLISHED)).toEqual([
    { localPort: 8788, peerHost: "127.0.0.1", peerPort: 52_134, listening: false, pid: 1234 },
    { localPort: 52_134, peerHost: "127.0.0.1", peerPort: 8788, listening: false, pid: 999 },
  ]);
});

test("lsof field output: a process set opens with p, every n line is one of its sockets, other letters are skipped", () => {
  expect(parseLsofSockets(LSOF_LISTENING, true)).toEqual([
    { localPort: 8788, peerHost: "", peerPort: 0, listening: true, pid: 1234 },
    { localPort: 5173, peerHost: "", peerPort: 0, listening: true, pid: 5678 },
    { localPort: 5175, peerHost: "", peerPort: 0, listening: true, pid: 5678 },
  ]);
  expect(parseLsofSockets(LSOF_ESTABLISHED, false)).toEqual([{ localPort: 52_134, peerHost: "127.0.0.1", peerPort: 8788, listening: false, pid: 999 }]);
  expect(parseLsofSockets("n127.0.0.1:1\n", true), "a name line before any process set has no owner and is dropped").toEqual([]);
});

test("netstat -ano: TCP rows by state, the idle-process pid 0 reads as no owner, UDP rows are dropped", () => {
  expect(parseNetstatSockets(NETSTAT)).toEqual([
    { localPort: 8788, peerHost: "", peerPort: 0, listening: true, pid: 1234 },
    { localPort: 5173, peerHost: "", peerPort: 0, listening: true, pid: 5678 },
    { localPort: 52_134, peerHost: "127.0.0.1", peerPort: 8788, listening: false, pid: 999 },
    { localPort: 135, peerHost: "", peerPort: 0, listening: true, pid: null },
  ]);
});

test("/proc/<pid>/stat: the group and CPU fields are read past a command name holding spaces and parentheses", () => {
  const stat = "77 (node (watch) x) S 1 4321 4321 0 -1 4194560 100 0 0 0 250 50 0 0 20 0 11 0 12345 0 0";
  expect(parseProcStatGroup(stat)).toBe(4321);
  expect(parseProcStatCpuMs(stat)).toBe(3000);
  expect(parseProcStatGroup("not a stat line")).toBeNull();
  expect(parseProcStatCpuMs("77 (x) S 1")).toBeNull();
  expect(parseProcStatusParent("Name:\tnode\nPPid:\t4321\nThreads:\t11\n")).toBe(4321);
  expect(parseProcStatusParent("Name:\tnode\n")).toBeNull();
});

test("ps clock text: mm:ss, hh:mm:ss and dd-hh:mm:ss to whole seconds; anything else is null", () => {
  expect(parsePsClock("05:07")).toBe(307);
  expect(parsePsClock("01:02:03")).toBe(3723);
  expect(parsePsClock("2-03:04:05")).toBe(183_845);
  expect(parsePsClock("0:00.12")).toBe(0);
  expect(parsePsClock("")).toBeNull();
  expect(parsePsClock("soon")).toBeNull();
});

test("ps process rows: three numeric columns lead and the command runs to the end, with -E's environment in the same blob", () => {
  const rows = parsePsProcesses(
    ["  1234     1 0:01.23 /usr/bin/node --watch x.ts ORB_RUN_MARKER=1-2-abcdef12 PATH=/bin", "  PID  PPID TIME COMMAND", ""].join("\n"),
  );
  expect(rows).toEqual([
    {
      pid: 1234,
      ppid: 1,
      cmdline: "/usr/bin/node --watch x.ts ORB_RUN_MARKER=1-2-abcdef12 PATH=/bin",
      environ: "/usr/bin/node --watch x.ts ORB_RUN_MARKER=1-2-abcdef12 PATH=/bin",
      cpuMs: 1000,
    },
  ]);
});

test("PowerShell CIM JSON: an array or one bare object, CPU from the two 100 ns counters, no environment", () => {
  // The keys are Windows CIM field names, spelled as the JSON PowerShell emits.
  const one = '{"ProcessId":10,"ParentProcessId":4,"CommandLine":"node x.ts","KernelModeTime":5000000,"UserModeTime":5000000}';
  expect(parseCimProcesses(one)).toEqual([{ pid: 10, ppid: 4, cmdline: "node x.ts", environ: null, cpuMs: 1000 }]);
  expect(parseCimProcesses(`[${one},{"ProcessId":11,"CommandLine":null}]`)).toEqual([
    { pid: 10, ppid: 4, cmdline: "node x.ts", environ: null, cpuMs: 1000 },
    { pid: 11, ppid: null, cmdline: "", environ: null, cpuMs: 0 },
  ]);
  expect(parseCimProcesses("")).toEqual([]);
});
