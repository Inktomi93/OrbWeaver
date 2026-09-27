// The OS tool parsers behind the platform module, each driven with the documented output shape of its tool
// so the darwin and win32 branches are proven on Linux. A parser that misreads a column returns the wrong
// pid to a kill path, so every column and every state filter has its own row.
import {
  parseCimProcesses,
  parseLsofSockets,
  parseNetstatSockets,
  parseProcNetTcp,
  parseProcStatCpuMs,
  parseProcStatGroup,
  parseProcStatusParent,
  parsePsClock,
  parsePsProcesses,
  parseSocketInode,
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

/** `/proc/net/tcp` as the kernel prints it: a header, then one row per socket ending in its inode, every
 *  address a little-endian hex word and every port big-endian hex. */
const PROC_NET_TCP = [
  "  sl  local_address rem_address   st tx_queue rx_queue tr tm->when retrnsmt   uid  timeout inode",
  "   0: 0100007F:2254 00000000:0000 0A 00000000:00000000 00:00000000 00000000  1000        0 5001 1 0000000000000000 100 0 0 10 0",
  "   1: 00000000:0016 00000000:0000 0A 00000000:00000000 00:00000000 00000000     0        0 5002 1 0000000000000000 100 0 0 10 0",
  "   2: 0100007F:CBA6 0100007F:2254 01 00000000:00000000 00:00000000 00000000  1000        0 5003 1 0000000000000000 20 4 30 10 -1",
  "   3: 0100007F:CBA7 0100007F:2254 06 00000000:00000000 03:00000A2E 00000000     0        0 0 3 0000000000000000",
  "",
].join("\n");

/** `/proc/net/tcp6`: the same columns with 32-hex-digit addresses, four little-endian words. */
const PROC_NET_TCP6 = [
  "  sl  local_address                         remote_address                        st tx_queue rx_queue tr tm->when retrnsmt   uid  timeout inode",
  "   0: 00000000000000000000000001000000:1435 00000000000000000000000000000000:0000 0A 00000000:00000000 00:00000000 00000000  1000        0 6001 1 0000000000000000 100 0 0 10 0",
  "   1: 0000000000000000FFFF00000100007F:1435 0000000000000000FFFF00000100007F:CBE8 01 00000000:00000000 00:00000000 00000000  1000        0 6002 1 0000000000000000 20 4 30 10 -1",
  "   2: 00000000000000000000000001000000:CBE9 B80D0120000000000000000005000000:01BB 01 00000000:00000000 00:00000000 00000000  1000        0 6003 1 0000000000000000 20 4 30 10 -1",
  "",
].join("\n");

test("/proc/net/tcp: LISTEN and ESTABLISHED rows with their inode, little-endian IPv4 hosts, every other state dropped", () => {
  expect(parseProcNetTcp(PROC_NET_TCP)).toEqual([
    { localPort: 8788, peerHost: "", peerPort: 0, listening: true, inode: 5001 },
    { localPort: 22, peerHost: "", peerPort: 0, listening: true, inode: 5002 },
    { localPort: 52_134, peerHost: "127.0.0.1", peerPort: 8788, listening: false, inode: 5003 },
  ]);
});

test("/proc/net/tcp6: four little-endian words, rendered bracketed and compressed the way ss and lsof print them", () => {
  expect(parseProcNetTcp(PROC_NET_TCP6)).toEqual([
    { localPort: 5173, peerHost: "", peerPort: 0, listening: true, inode: 6001 },
    { localPort: 5173, peerHost: "[::ffff:127.0.0.1]", peerPort: 52_200, listening: false, inode: 6002 },
    { localPort: 52_201, peerHost: "[2001:db8::5]", peerPort: 443, listening: false, inode: 6003 },
  ]);
  expect(parseProcNetTcp(""), "an empty table is no rows").toEqual([]);
});

test("a /proc/<pid>/fd link names a socket inode only in the socket:[n] form", () => {
  expect(parseSocketInode("socket:[5001]")).toBe(5001);
  expect(parseSocketInode("pipe:[5001]")).toBeNull();
  expect(parseSocketInode("/dev/null")).toBeNull();
});
