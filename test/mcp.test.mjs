import { test, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, readFileSync, mkdirSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { Store } from "../lib/store.mjs";
import { createServer } from "../server.mjs";
import {
  parseGradePercent,
  parseCreditWindows,
  buildCourseGradeHistory,
  analyzeAssignment,
  planDynamicBlocks,
  buildMuseRundown,
  MuseMcpServer,
  RateLimiter,
  autoRegisterMuseMcp,
  syncMuseRundownFile,
} from "../lib/muse.mjs";
import { createStdioMcpRunner } from "../scripts/mcp-server.mjs";

const NOW = new Date("2026-09-12T15:00:00.000Z"); // Sep 12, 2026, 10:00 AM Chicago (CDT)

const sampleAssignments = () => [
  // 1. Past graded CS 128 assignments (showing lower grades -> higher time multiplier & weak areas)
  {
    id: "cs128:lesson:iter",
    source: "cs128",
    course: "CS 128",
    title: "Iteration & Loops",
    dueAt: "2026-09-01T04:59:00.000Z",
    openAt: null,
    url: "https://cs128.org/iter",
    details: "Score 70.00/100.00 (70.00%)",
    status: "submitted",
    grade: "70.00%",
    seenAt: "2026-09-01T00:00:00.000Z",
  },
  {
    id: "cs128:lesson:refs",
    source: "cs128",
    course: "CS 128",
    title: "Reference Passing",
    dueAt: "2026-09-05T04:59:00.000Z",
    openAt: null,
    url: "https://cs128.org/refs",
    details: "Score 0.00/100.00 (0.00%)",
    status: "closed",
    grade: null,
    seenAt: "2026-09-05T00:00:00.000Z",
  },
  // 2. Missed BUT still submittable PrairieLearn assignment (with 80% late credit window) -> MUST PIVOT!
  {
    id: "pl:1:hw3",
    source: "prairielearn",
    course: "CS 173",
    title: "HW3: Structural Induction",
    dueAt: "2026-09-11T04:59:00.000Z", // Past due!
    openAt: null,
    url: "https://us.prairielearn.com/pl/course_instance/1/assessment/3",
    details: "80% until 23:59, Tue, Sep 15\n100%: Sep 4 00:00 – Sep 10 23:59\n80%: Sep 11 00:00 – Sep 15 23:59\nScore: 30%",
    status: "submitted", // PrairieLearn sets status="submitted" when 0 < score < 100
    grade: "30%",
    seenAt: "2026-09-12T12:00:00.000Z",
  },
  // 3. In-progress CS 128 assignment due tonight (40% done, 60% remaining)
  {
    id: "cs128:lesson:pointers",
    source: "cs128",
    course: "CS 128",
    title: "Pointers & Memory",
    dueAt: "2026-09-13T04:59:00.000Z", // Tonight 11:59 PM Chicago
    openAt: null,
    url: "https://cs128.org/pointers",
    details: "Score 40.00/100.00 (40.00%)",
    status: "submitted",
    grade: "40.00%",
    seenAt: "2026-09-12T12:00:00.000Z",
  },
  // 4. Not started Canvas assignment due tonight
  {
    id: "canvas:10:99",
    source: "canvas",
    course: "MATH 257",
    title: "Written Homework 4",
    dueAt: "2026-09-13T04:59:00.000Z",
    openAt: null,
    url: "https://canvas.illinois.edu/courses/10/assignments/99",
    details: "20 pts\nSubmit: online upload",
    status: "open",
    grade: null,
    seenAt: "2026-09-12T12:00:00.000Z",
  },
  // 5. Past graded MATH 257 assignment with high score
  {
    id: "canvas:10:90",
    source: "canvas",
    course: "MATH 257",
    title: "Written Homework 3",
    dueAt: "2026-09-06T04:59:00.000Z",
    openAt: null,
    url: "https://canvas.illinois.edu/courses/10/assignments/90",
    details: "20 pts",
    status: "graded",
    grade: "19/20",
    seenAt: "2026-09-06T12:00:00.000Z",
  },
];

test("parseGradePercent extracts percentages from grades, fractions, details, and letters", () => {
  assert.equal(parseGradePercent("85%"), 85);
  assert.equal(parseGradePercent("19/20"), 95);
  assert.equal(parseGradePercent(null, "Score 40.00/100.00 (40.00%)"), 40);
  assert.equal(parseGradePercent(null, "Score: 30%"), 30);
  assert.equal(parseGradePercent("A"), 95);
  assert.equal(parseGradePercent(null, "No score here"), null);
});

test("parseCreditWindows detects PrairieLearn and SmartPhysics late credit windows", () => {
  const pl = parseCreditWindows(
    "80% until 23:59, Tue, Sep 15\n100%: Sep 4 00:00 – Sep 10 23:59\n80%: Sep 11 00:00 – Sep 15 23:59\nScore: 30%",
    "2026-09-11T04:59:00.000Z",
    "submitted",
    NOW
  );
  assert.equal(pl.hasLateWindow, true);
  assert.equal(pl.currentCreditPercent, 80);
  assert.equal(pl.canSubmit, true);

  const closed = parseCreditWindows("Score 0.00/100.00 (0.00%)", "2026-09-05T04:59:00.000Z", "closed", NOW);
  assert.equal(closed.canSubmit, false);
  assert.equal(closed.currentCreditPercent, 0);
});

test("buildCourseGradeHistory computes course averages, missed counts, weak areas, and time multipliers", () => {
  const history = buildCourseGradeHistory(sampleAssignments(), { now: NOW });
  assert.ok(history["CS 128"]);
  assert.ok(history["MATH 257"]);

  // CS 128 has 70% on Iteration and 0% (missed) on Reference Passing -> average 35%
  assert.equal(history["CS 128"].averagePercent, 35);
  assert.equal(history["CS 128"].missedCount, 1);
  assert.equal(history["CS 128"].inProgressCount, 1);
  assert.ok(history["CS 128"].timeMultiplier > 1.3, "struggling course gets a higher time multiplier");
  assert.ok(history["CS 128"].weakAreas.length >= 2);
  assert.match(history["CS 128"].structuringFeedback, /Reference Passing/);

  // MATH 257 has 19/20 (95%) -> strong mastery, multiplier 1.0
  assert.equal(history["MATH 257"].averagePercent, 95);
  assert.equal(history["MATH 257"].missedCount, 0);
  assert.equal(history["MATH 257"].timeMultiplier, 1);
});

test("analyzeAssignment detects in-progress partial scores and missed-open pivot candidates", () => {
  const history = buildCourseGradeHistory(sampleAssignments(), { now: NOW });
  const items = sampleAssignments();

  const missedPl = analyzeAssignment(items[2], { now: NOW, courseStats: history["CS 173"] });
  assert.equal(missedPl.progressState, "missed_open");
  assert.equal(missedPl.isMissed, true);
  assert.equal(missedPl.isSubmittable, true);
  assert.equal(missedPl.progressPercent, 30);
  assert.equal(missedPl.remainingPercent, 70);
  assert.equal(missedPl.priorityLevel, "critical_pivot");
  assert.match(missedPl.structuringAdvice, /PIVOT REQUIRED/);

  const inProgCs128 = analyzeAssignment(items[3], { now: NOW, courseStats: history["CS 128"] });
  assert.equal(inProgCs128.progressState, "in_progress");
  assert.equal(inProgCs128.progressPercent, 40);
  assert.equal(inProgCs128.remainingPercent, 60);
  assert.equal(inProgCs128.isSubmittable, true);
  assert.ok(inProgCs128.estimatedRemainingMinutes > 0);
});

test("planDynamicBlocks pivots missed assignments to top priority and weights time by remaining progress and course history", () => {
  const blocks = planDynamicBlocks(sampleAssignments(), {
    now: NOW,
    withinHours: 24,
    startHour: 20,
    endHour: 23,
  });

  assert.equal(blocks.length, 1);
  const tonight = blocks[0];
  assert.equal(tonight.date, "2026-09-12");
  assert.equal(tonight.pivoted, true, "missed-open HW3 triggers a pivoted block");

  // First allocation must be the critical_pivot missed assignment (pl:1:hw3)
  assert.equal(tonight.allocations[0].assignmentId, "pl:1:hw3");
  assert.equal(tonight.allocations[0].priorityLevel, "critical_pivot");

  // In-progress CS 128 Pointers (40% done) and not-started MATH 257 HW4 are also allocated in tonight's block
  const ids = tonight.allocations.map((a) => a.assignmentId);
  assert.deepEqual(ids, ["pl:1:hw3", "cs128:lesson:pointers", "canvas:10:99"]);
  for (const alloc of tonight.allocations) {
    assert.ok(alloc.allocatedMinutes >= 15);
    assert.ok(alloc.slotStart && alloc.slotEnd);
  }
});

test("MuseMcpServer handles initialize, tools/list, tools/call, resources/read, prompts/get, and rate limiting", async () => {
  const dir = mkdtempSync(join(tmpdir(), "ucm-mcp-"));
  const store = new Store(join(dir, "state.json"));
  store.state.assignments = sampleAssignments();
  let replanned = null;
  let pollCount = 0;

  const mcp = new MuseMcpServer({
    store,
    getSettings: () => ({ blockStartHour: 20, blockEndHour: 23, blockWithinHours: 24 }),
    poller: {
      run: async () => {
        pollCount++;
        return { changes: [] };
      },
    },
    onReplanBlocks: async (opts) => {
      replanned = opts;
      return { synced: true, created: 1 };
    },
    now: () => NOW,
  });

  // 1. initialize
  const initRes = await mcp.handleJsonRpc({
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: { protocolVersion: "2024-11-05" },
  });
  assert.equal(initRes.result.serverInfo.name, "uiuc-collective-mind-muse");
  assert.ok(initRes.result.capabilities.tools);
  assert.ok(initRes.result.capabilities.resources.subscribe);

  // 2. tools/list
  const toolsRes = await mcp.handleJsonRpc({ jsonrpc: "2.0", id: 2, method: "tools/list" });
  const toolNames = toolsRes.result.tools.map((t) => t.name);
  assert.ok(toolNames.includes("get_homework_rundown"));
  assert.ok(toolNames.includes("get_assignment_progress"));
  assert.ok(toolNames.includes("get_missed_assignments_and_pivot_plan"));
  assert.ok(toolNames.includes("get_course_grades_and_feedback_context"));
  assert.ok(toolNames.includes("replan_homework_blocks"));
  assert.ok(toolNames.includes("refresh_assignments"));

  // 3. tools/call -> get_homework_rundown
  const rundownCall = await mcp.handleJsonRpc({
    jsonrpc: "2.0",
    id: 3,
    method: "tools/call",
    params: { name: "get_homework_rundown", arguments: { course: "CS 128" } },
  });
  assert.equal(rundownCall.result.isError, false);
  const rundownData = rundownCall.result.structuredContent;
  assert.equal(rundownData.assignments.length, 1);
  assert.equal(rundownData.assignments[0].id, "cs128:lesson:pointers");
  assert.equal(rundownData.assignments[0].progressPercent, 40);
  assert.ok(rundownData.courseGrades["CS 128"]);

  // 4. tools/call -> get_missed_assignments_and_pivot_plan
  const pivotCall = await mcp.handleJsonRpc({
    jsonrpc: "2.0",
    id: 4,
    method: "tools/call",
    params: { name: "get_missed_assignments_and_pivot_plan", arguments: {} },
  });
  const pivotData = pivotCall.result.structuredContent;
  assert.equal(pivotData.needsPivot, true);
  assert.equal(pivotData.missedOpenCount, 1);
  assert.equal(pivotData.missedClosedCount, 1);
  assert.ok(pivotData.pivotActions.some((a) => a.assignmentId === "pl:1:hw3"));

  // 5. tools/call -> replan_homework_blocks with Google Calendar sync
  const replanCall = await mcp.handleJsonRpc({
    jsonrpc: "2.0",
    id: 5,
    method: "tools/call",
    params: {
      name: "replan_homework_blocks",
      arguments: { startHour: 19, endHour: 22, withinHours: 36, syncToGoogleCalendar: true },
    },
  });
  assert.equal(replanCall.result.structuredContent.blockCount, 1);
  assert.equal(replanCall.result.structuredContent.calendarSync.synced, true);
  assert.equal(replanned.startHour, 19);

  // 6. tools/call -> refresh_assignments
  const refreshCall = await mcp.handleJsonRpc({
    jsonrpc: "2.0",
    id: 6,
    method: "tools/call",
    params: { name: "refresh_assignments", arguments: {} },
  });
  assert.equal(pollCount, 1);
  assert.equal(refreshCall.result.structuredContent.summary.needsPivot, true);

  // 7. resources/read
  const resRead = await mcp.handleJsonRpc({
    jsonrpc: "2.0",
    id: 7,
    method: "resources/read",
    params: { uri: "muse://homework/grades-feedback" },
  });
  const gradesResource = JSON.parse(resRead.result.contents[0].text);
  assert.equal(gradesResource.courseGrades["CS 128"].averagePercent, 35);

  // 8. prompts/get
  const promptRes = await mcp.handleJsonRpc({
    jsonrpc: "2.0",
    id: 8,
    method: "prompts/get",
    params: { name: "muse_homework_pivot_and_feedback", arguments: { course: "CS 128" } },
  });
  assert.match(promptRes.result.messages[0].content.text, /Pointers & Memory/);
  assert.match(promptRes.result.messages[0].content.text, /Reference Passing/);

  // 9. Validation error on bad tool arguments
  const badArgs = await mcp.handleJsonRpc({
    jsonrpc: "2.0",
    id: 9,
    method: "tools/call",
    params: { name: "replan_homework_blocks", arguments: { startHour: 22, endHour: 19 } },
  });
  assert.equal(badArgs.error.code, -32602);
  assert.match(badArgs.error.message, /endHour must be greater than startHour/);
});

test("RateLimiter enforces call caps to prevent runaway agent loops", async () => {
  const limiter = new RateLimiter({ maxRequests: 2, windowMs: 10_000 });
  const mcp = new MuseMcpServer({
    store: { state: { assignments: [], changes: [] } },
    rateLimiter: limiter,
    now: () => NOW,
  });
  assert.ok((await mcp.handleJsonRpc({ jsonrpc: "2.0", id: 1, method: "ping" })).result);
  assert.ok((await mcp.handleJsonRpc({ jsonrpc: "2.0", id: 2, method: "ping" })).result);
  const third = await mcp.handleJsonRpc({ jsonrpc: "2.0", id: 3, method: "ping" });
  assert.equal(third.error.code, -32029);
});

test("HTTP /mcp, SSE notifications, and /api/muse/rundown work end-to-end with token auth", async () => {
  const dir = mkdtempSync(join(tmpdir(), "ucm-srv-mcp-"));
  mkdirSync(join(dir, "public"));
  writeFileSync(join(dir, "public", "index.html"), "<h1>ui</h1>");
  const settingsFile = join(dir, "settings.json");
  writeFileSync(settingsFile, JSON.stringify({ courses: [] }));

  const store = new Store(join(dir, "state.json"));
  store.state.assignments = sampleAssignments();
  const bus = new EventEmitter();
  const TOKEN = "test-muse-mcp-token-value-32chars-minimum";
  const poller = { run: async () => ({ changes: [] }), running: false, nextAt: null };
  const browser = { openForLogin: async () => {} };
  const auth = { connected: false };

  const mcp = new MuseMcpServer({
    store,
    getSettings: () => ({ courses: [], blockStartHour: 20, blockEndHour: 23, blockWithinHours: 24 }),
    poller,
    now: () => NOW,
  });

  const server = createServer({
    store,
    settingsFile,
    poller,
    browser,
    google: { auth },
    bus,
    log: () => {},
    recentLog: () => [],
    publicDir: join(dir, "public"),
    apiToken: TOKEN,
    mcp,
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${server.address().port}`;
  after(() => server.close());

  // Unauthenticated /mcp and /api/muse/rundown must return 401
  assert.equal((await fetch(`${base}/mcp`, { method: "POST" })).status, 401);
  assert.equal((await fetch(`${base}/api/muse/rundown`)).status, 401);

  // Authenticated GET /api/muse/rundown returns the full Muse AI rundown
  const rundownRes = await fetch(`${base}/api/muse/rundown`, {
    headers: { authorization: `Bearer ${TOKEN}` },
  });
  assert.equal(rundownRes.status, 200);
  const rundownBody = await rundownRes.json();
  assert.equal(rundownBody.summary.needsPivot, true);
  assert.equal(rundownBody.summary.missedOpenCount, 1);

  // Authenticated POST /mcp executes MCP JSON-RPC requests
  const mcpRes = await fetch(`${base}/mcp`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${TOKEN}`,
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 42,
      method: "tools/call",
      params: { name: "get_assignment_progress", arguments: {} },
    }),
  });
  assert.equal(mcpRes.status, 200);
  const mcpBody = await mcpRes.json();
  assert.equal(mcpBody.id, 42);
  assert.equal(mcpBody.result.structuredContent.inProgressCount, 2);

  // SSE stream on GET /mcp receives automatic notifications/resources/updated when state updates
  const controller = new AbortController();
  const sseRes = await fetch(`${base}/mcp?t=${TOKEN}`, { signal: controller.signal });
  assert.equal(sseRes.status, 200);
  const reader = sseRes.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  const readUntil = async (needle) => {
    const deadline = Date.now() + 2000;
    while (!buf.includes(needle)) {
      if (Date.now() > deadline) throw new Error(`Timeout waiting for ${needle} in ${buf}`);
      const { value, done } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
    }
  };
  await readUntil("event: endpoint");
  bus.emit("state", {});
  await readUntil("notifications/resources/updated");
  assert.match(buf, /muse:\/\/homework\/rundown/);
  controller.abort();
});

test("Stdio MCP runner processes JSON-RPC messages and auto-registration writes 0600 config", async () => {
  const dir = mkdtempSync(join(tmpdir(), "ucm-stdio-"));
  const dataDir = join(dir, "data");
  mkdirSync(dataDir, { recursive: true });
  const store = new Store(join(dataDir, "state.json"));
  store.state.assignments = sampleAssignments();
  store.save();

  // Verify syncMuseRundownFile writes muse-rundown.json
  const rundown = syncMuseRundownFile({ store, dataDir, now: NOW });
  assert.ok(rundown.summary.needsPivot);
  const savedRundown = JSON.parse(readFileSync(join(dataDir, "muse-rundown.json"), "utf8"));
  assert.equal(savedRundown.summary.missedOpenCount, 1);

  // Verify autoRegisterMuseMcp merges with existing mcpServers and sets 0600 permissions
  const customMcpConfig = join(dir, ".mcp.json");
  writeFileSync(
    customMcpConfig,
    JSON.stringify({ mcpServers: { existing_agent: { command: "echo", args: ["hi"] } } })
  );
  const reg = autoRegisterMuseMcp({
    rootDir: dir,
    dataDir,
    port: 4258,
    apiToken: "tok123",
    configPaths: [customMcpConfig],
  });
  assert.deepEqual(reg.registered, [customMcpConfig]);
  const parsedCfg = JSON.parse(readFileSync(customMcpConfig, "utf8"));
  assert.ok(parsedCfg.mcpServers.existing_agent, "preserves existing MCP servers");
  assert.ok(parsedCfg.mcpServers["uiuc-collective-mind"], "registers uiuc-collective-mind MCP server");
  assert.equal(parsedCfg.mcpServers["uiuc-collective-mind"].env.UCM_DATA_DIR, dataDir);
  if (process.platform !== "win32") {
    assert.equal(statSync(customMcpConfig).mode & 0o777, 0o600);
  }

  // Verify Stdio runner handles newline-delimited JSON-RPC
  const input = new PassThrough();
  const output = new PassThrough();
  const runner = createStdioMcpRunner({ dataDir, input, output });
  let outBuf = "";
  output.on("data", (c) => {
    outBuf += String(c);
  });

  input.write(JSON.stringify({ jsonrpc: "2.0", id: 101, method: "tools/list" }) + "\n");
  const deadline = Date.now() + 2000;
  while (!outBuf.includes('"id":101') && Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 20));
  }
  runner.close();
  const line = outBuf.trim().split("\n")[0];
  const parsedReply = JSON.parse(line);
  assert.equal(parsedReply.id, 101);
  assert.equal(parsedReply.result.tools.length, 6);
});
