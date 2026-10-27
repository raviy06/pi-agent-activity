import assert from "node:assert/strict"
import test from "node:test"
import { EventEmitter } from "node:events"
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent"
import install from "../src/index.js"

function fixture(mode = "tui") {
  const emitter = new EventEmitter(), handlers = new Map<string, Function>(), commands = new Map<string, any>()
  const rows: any[] = [], requests: string[] = []
  let disposed = 0
  const events = { on(name: string, callback: (value: unknown) => void) { emitter.on(name, callback); return () => { emitter.off(name, callback) } }, emit(name: string, value: unknown) { emitter.emit(name, value) } }
  emitter.on("pi-minimal:footer:v1:register", request => {
    assert.equal(request.slot, "activity")
    request.result = { ok: true, registration: { publish: (data: unknown) => { rows.push(data); return { ok: true } }, dispose: () => { disposed++ } } }
  })
  emitter.on("subagents:rpc:v1:request", request => {
    requests.push(request.method)
    const data = request.method === "ping" ? { capabilities: { activityStatus: { version: 1 }, activityEvents: { version: 1, event: "subagents:activity:changed" } }, events: { jobsChanged: "subagent:jobs-changed" } } : { activity: { version: 1, scope: "current-session", generatedAt: 1, available: true, incomplete: false, omitted: { active: 0, recent: 0, children: 0, scanTruncated: false }, entries: [{ key: "worker", agent: "worker", state: "running", activity: { tool: "read" }, elapsedMs: 1000, usage: { input: 20, output: 5, source: "reported-own" } }] } }
    events.emit(`subagents:rpc:v1:reply:${request.requestId}`, { version: 1, requestId: request.requestId, success: true, data })
  })
  const pi = { events, on: (name: string, handler: Function) => { handlers.set(name, handler) }, registerCommand: (name: string, command: unknown) => { commands.set(name, command) } } as unknown as ExtensionAPI
  const ctx = { mode, sessionManager: { getSessionId: () => "S1" }, ui: { notify() {}, select: async () => undefined } } as unknown as ExtensionContext
  install(pi)
  return { handlers, commands, rows, requests, ctx, emitter, get disposed() { return disposed } }
}

test("TUI bridge publishes activity only, supports plain/static, and shuts down", async () => {
  const f = fixture()
  f.handlers.get("session_start")!({}, f.ctx)
  await new Promise(resolve => setImmediate(resolve))
  assert.deepEqual(f.requests, ["ping", "status"])
  assert.equal(f.rows.at(-1).rows[0].agent, "worker")
  assert.equal(f.rows.at(-1).rows[0].metrics.tokens, 25)
  await f.commands.get("activity").handler("plain", f.ctx)
  assert.equal(f.rows.at(-1).format, "plain")
  await f.commands.get("activity").handler("static", f.ctx)
  assert.equal(f.rows.at(-1).motion, "static")
  f.handlers.get("session_shutdown")!({}, f.ctx)
  assert.equal(f.disposed, 1)
  const previous = f.rows.length
  f.emitter.emit("subagent:child-status", {})
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(f.rows.length, previous)
})

test("non-TUI sessions do not register with the footer or poll providers", async () => {
  const f = fixture("print")
  f.handlers.get("session_start")!({}, f.ctx)
  await new Promise(resolve => setImmediate(resolve))
  assert.deepEqual(f.requests, [])
  assert.deepEqual(f.rows, [])
  f.handlers.get("session_shutdown")!({}, f.ctx)
})

test("advertised change hints trigger a status refresh and are released on shutdown", async () => {
  const f = fixture()
  f.handlers.get("session_start")!({}, f.ctx)
  await new Promise(resolve => setImmediate(resolve))
  assert.deepEqual(f.requests, ["ping", "status"])
  for (const event of ["subagent:jobs-changed", "subagents:activity:changed"]) {
    const before = f.requests.length
    f.emitter.emit(event, { version: 1 })
    await new Promise(resolve => setTimeout(resolve, 300))
    assert.deepEqual(f.requests.slice(before), ["status"], event)
  }
  f.handlers.get("session_shutdown")!({}, f.ctx)
  assert.equal(f.emitter.listenerCount("subagent:jobs-changed"), 0)
  assert.equal(f.emitter.listenerCount("subagents:activity:changed"), 0)
})
