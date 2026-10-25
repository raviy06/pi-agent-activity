import assert from "node:assert/strict"
import test from "node:test"
import { parseActivity } from "../src/projection.js"
import { ActivityStore } from "../src/activity-store.js"

const entry = (state = "running", key = "activity-a") => ({ key, agent: "worker", state, activity: { tool: "read" }, elapsedMs: 1000, usage: { input: 20, output: 5, source: "reported-own" } })
const dto = (entries: unknown[] = [entry()], extra: Record<string, unknown> = {}) => ({ version: 1, scope: "current-session", generatedAt: 1000, available: true, entries, incomplete: false, omitted: { active: 0, recent: 0, children: 0, scanTruncated: false }, ...extra })

test("parses only supported scoped snapshots and own usage", () => {
  const result = parseActivity(dto())
  assert.equal(result.rows[0].metrics.tokens, 25)
  assert.equal(result.rows[0].text, "Last: read")
  assert.equal(result.rows[0].state, "running")
  for (const value of [null, {}, dto([], { version: 2 }), dto([], { scope: "global" }), dto([], { available: "true" }), dto([entry("invented")]), dto([entry(), entry()]), dto([], { omitted: { active: -1 } })]) assert.throws(() => parseActivity(value))
})

test("shows the task preview and a fallback marker when the fork supplies them (0.83+)", () => {
  const rich = { ...entry(), task: "  Review   the auth\u001b[31m module  ", model: { requested: "nope/none", effective: "openai/gpt-5-mini", fallbackReason: "unregistered" } }
  const result = parseActivity(dto([rich]))
  assert.equal(result.rows[0].text, "Review the auth module · Last: read · ↷ openai/gpt-5-mini (unregistered)")
  assert.equal(result.rows[0].goal, "Review the auth module")
  assert.deepEqual(result.rows[0].model, { requested: "nope/none", effective: "openai/gpt-5-mini", fallbackReason: "unregistered" })
  const plain = parseActivity(dto([{ ...entry(), model: { effective: "openai/gpt-5-mini" } }]))
  assert.equal(plain.rows[0].text, "Last: read", "an effective model without a fallback adds nothing to the row")
  const long = parseActivity(dto([{ ...entry(), task: "x".repeat(500) }]))
  assert.ok(long.rows[0].goal!.length <= 120)
  assert.ok(long.rows[0].text.length <= 256)
  assert.equal((long.rows[0] as Record<string, unknown>).task, undefined, "row.task stays free for the host's plan-task link")
  assert.equal(parseActivity(dto([{ ...entry(), task: 42, model: "bad" }])).rows[0].goal, undefined, "malformed optional fields are ignored, never fatal")
})

test("sanitizes text, keeps attention independent and omits unknown metrics", () => {
  const input = { ...entry(), agent: "worker\u001b]0;secret\u0007", usage: undefined, activity: { tool: "read\nfile", reason: "needs-attention" } }
  const result = parseActivity(dto([input]))
  assert.equal(result.rows[0].agent, "worker")
  assert.equal(result.rows[0].metrics.tokens, undefined)
  assert.equal(result.rows[0].state, "running")
  assert.equal(result.rows[0].text, "Needs attention · Last: read file")
})

test("retains successes for 10s, failures for 60s, and resurfaces changed observations", () => {
  const store = new ActivityStore()
  store.apply(parseActivity(dto([entry("completed"), entry("failed", "activity-b")])), 0)
  assert.equal(store.rows(9999).length, 2)
  assert.equal(store.rows(10000).length, 1)
  assert.equal(store.rows(59999).length, 1)
  assert.equal(store.rows(60000).length, 0)
})

test("dismissal hides a failure early and only a changed observation resurfaces it", () => {
  const store = new ActivityStore()
  store.apply(parseActivity(dto([entry("failed", "activity-c")])), 0)
  assert.equal(store.dismiss("activity-c"), true)
  assert.equal(store.rows(1000).length, 0)
  store.apply(parseActivity(dto([entry("failed", "activity-c")])), 2000)
  assert.equal(store.rows(2000).length, 0)
  store.apply(parseActivity(dto([{ ...entry("failed", "activity-c"), activity: { tool: "bash" } }])), 3000)
  assert.equal(store.rows(3000).length, 1)
})

test("stopped rows age out like failures; paused and unknown stay until dismissed", () => {
  const store = new ActivityStore()
  store.apply(parseActivity(dto([entry("stopped", "s"), entry("paused", "p"), entry("unknown", "u")])), 0)
  assert.equal(store.rows(59999).length, 3)
  assert.deepEqual(store.rows(60000).map(row => row.key).sort(), ["p", "u"])
  assert.deepEqual(store.rows(10 * 60_000).map(row => row.key).sort(), ["p", "u"])
})

test("a terminal row that changes state restarts its retention window", () => {
  const store = new ActivityStore()
  store.apply(parseActivity(dto([entry("completed")])), 0)
  store.apply(parseActivity(dto([entry("failed")])), 9000)
  assert.equal(store.rows(10000).length, 1)
  assert.equal(store.rows(68999).length, 1)
  assert.equal(store.rows(69000).length, 0)
})

test("disappearance and provider outage never manufacture completion", () => {
  const store = new ActivityStore()
  store.apply(parseActivity(dto()), 0)
  assert.equal(store.dismiss("activity-a"), false)
  store.apply(parseActivity(dto([])), 2000)
  assert.equal(store.rows(2000)[0].state, "unknown")
  assert.match(store.rows(2000)[0].text, /no longer observed/)
  store.apply(parseActivity(dto()), 3000)
  store.unavailable("Provider unavailable")
  assert.equal(store.rows(4000)[0].state, "unknown")
  assert.equal(store.rows(4000)[0].metrics?.elapsedMs, 1000)
  store.apply(parseActivity(dto()), 5000)
  assert.equal(store.rows(5000)[0].state, "running")
})

test("filtered parent references are removed and retained cache is bounded", () => {
  const store = new ActivityStore()
  const child = { ...entry("running", "child"), parentKey: "parent" }
  store.apply(parseActivity(dto([entry("completed", "parent"), child])), 0)
  assert.equal(store.rows(10000)[0].parentKey, undefined)
  for (let i = 0; i < 300; i++) store.apply(parseActivity(dto([entry("running", `child-${i}`)])), i * 1000)
  assert.ok(store.rows(300000).length <= 64)
  assert.ok(store.omitted > 0)
})
