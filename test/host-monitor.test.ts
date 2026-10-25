import assert from "node:assert/strict"
import test from "node:test"
import { EventEmitter } from "node:events"
import { FooterClient } from "../src/footer-client.js"
import { ActivityStore } from "../src/activity-store.js"
import { ActivityMonitor } from "../src/monitor.js"

function bus() {
  const emitter = new EventEmitter()
  return { emitter, events: { on(name: string, callback: (value: unknown) => void) { emitter.on(name, callback); return () => { emitter.off(name, callback) } }, emit(name: string, value: unknown) { emitter.emit(name, value) } } }
}
const empty = { rows: [], omitted: 0, motion: "static" as const, format: "icons" as const }
const status = { activity: { version: 1, scope: "current-session", generatedAt: 0, available: true, entries: [], incomplete: false, omitted: { active: 0, recent: 0, children: 0, scanTruncated: false } } }

test("footer handles late host readiness and disposal without replacing UI", () => {
  const { emitter, events } = bus(); const warnings: string[] = [], publications: unknown[] = []
  let disposed = 0
  const client = new FooterClient(events, "S1", message => warnings.push(message))
  client.publish(empty)
  assert.equal(warnings.length, 1)
  emitter.on("pi-minimal:footer:v1:register", request => {
    assert.equal(request.sessionId, "S1"); assert.equal(request.slot, "activity")
    request.result = { ok: true, registration: { publish: (value: unknown) => { publications.push(value); return { ok: true } }, dispose: () => { disposed++ } } }
  })
  events.emit("pi-minimal:footer:v1:ready", { sessionId: "foreign", version: 1 })
  assert.equal(publications.length, 0)
  events.emit("pi-minimal:footer:v1:ready", { sessionId: "S1", version: 1 })
  assert.equal(publications.length, 1)
  client.publish(empty)
  assert.equal(publications.length, 1, "identical data is not needlessly republished")
  client.dispose(); client.dispose()
  events.emit("pi-minimal:footer:v1:ready", { sessionId: "S1", version: 1 })
  assert.equal(publications.length, 1); assert.equal(disposed, 1)
})

test("footer re-registers after stale handle rejection and reports occupancy honestly", () => {
  const { emitter, events } = bus(); let registrations = 0
  emitter.on("pi-minimal:footer:v1:register", request => {
    registrations++
    const first = registrations === 1
    request.result = { ok: true, registration: { publish: () => first ? { ok: false, code: "disposed" } : { ok: true }, dispose() {} } }
  })
  const client = new FooterClient(events, "S1", () => {})
  client.publish(empty)
  assert.equal(registrations, 2)
  assert.equal(client.diagnostic, undefined)
  client.dispose()
})

test("a ready hint probes an unchanged snapshot after a missed unavailable event", () => {
  const { emitter, events } = bus(); let generation = 0, registrations = 0
  emitter.on("pi-minimal:footer:v1:register", request => {
    const ownGeneration = generation; registrations++
    request.result = { ok: true, registration: { publish: () => ownGeneration === generation ? { ok: true } : { ok: false, code: "disposed" }, dispose() {} } }
  })
  const client = new FooterClient(events, "S1", () => {})
  client.publish(empty); generation++
  events.emit("pi-minimal:footer:v1:ready", { version: 1, sessionId: "S1" })
  assert.equal(registrations, 2)
  client.dispose()
})

test("monitor is single-flight and shutdown prevents late publication", async () => {
  const store = new ActivityStore(); let resolveStatus!: (value: unknown) => void, calls = 0, updates = 0
  const rpc = { request: async (method: "ping" | "status") => { calls++; if (method === "ping") return { capabilities: { activityStatus: { version: 1 } } }; return new Promise(resolve => { resolveStatus = resolve }) } }
  const monitor = new ActivityMonitor(rpc, store, () => { updates++ })
  monitor.start()
  await new Promise(resolve => setImmediate(resolve))
  monitor.nudge(); monitor.nudge()
  assert.equal(calls, 2)
  monitor.dispose(); resolveStatus(status)
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(updates, 0)
})

test("monitor checks capability, polls cached data and cancels scheduled refresh", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] })
  const store = new ActivityStore(); let calls = 0, updates = 0
  const rpc = { request: async (method: "ping" | "status") => { calls++; return method === "ping" ? { capabilities: { activityStatus: { version: 1 } } } : status } }
  const monitor = new ActivityMonitor(rpc, store, () => { updates++ }, { activeMs: 10, idleMs: 20 })
  monitor.start(); await new Promise(resolve => setImmediate(resolve))
  assert.equal(calls, 2); assert.equal(updates, 1)
  t.mock.timers.tick(20); await new Promise(resolve => setImmediate(resolve))
  assert.equal(calls, 3)
  monitor.dispose(); const stopped = calls
  t.mock.timers.tick(100); await new Promise(resolve => setImmediate(resolve))
  assert.equal(calls, stopped)
})

test("continuous hint bursts cannot postpone refresh forever", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] })
  const store = new ActivityStore(); let calls = 0
  const monitor = new ActivityMonitor({ request: async (method) => { calls++; return method === "ping" ? { capabilities: { activityStatus: { version: 1 } } } : status } }, store, () => {})
  monitor.start(); await new Promise(resolve => setImmediate(resolve))
  monitor.nudge(); t.mock.timers.tick(100); monitor.nudge(); t.mock.timers.tick(100); monitor.nudge(); t.mock.timers.tick(50)
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(calls, 3)
  monitor.dispose()
})

test("unsupported providers surface a diagnostic rather than fabricated idle", async () => {
  const store = new ActivityStore()
  const monitor = new ActivityMonitor({ request: async () => ({ capabilities: {} }) }, store, () => {})
  monitor.start(); await new Promise(resolve => setImmediate(resolve))
  assert.match(store.diagnostic ?? "", /activityStatus v1/)
  monitor.dispose()
})

test("with activityEvents advertised the monitor polls at the idle interval and refreshes on the change event", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] })
  const store = new ActivityStore()
  let statusCalls = 0
  const status = { activity: { version: 1, scope: "current-session", generatedAt: 1, available: true, incomplete: false, omitted: { active: 0, recent: 0, children: 0, scanTruncated: false }, entries: [{ key: "activity-a", agent: "worker", state: "running" }] } }
  const monitor = new ActivityMonitor({ request: async (method) => {
    if (method === "ping") return { capabilities: { activityStatus: { version: 1, fields: ["task"] }, activityEvents: { version: 1, event: "subagents:activity:changed" } } }
    statusCalls++; return status
  } }, store, () => {}, { activeMs: 10, idleMs: 1000 })
  monitor.start(); await Promise.resolve(); await Promise.resolve(); await Promise.resolve()
  assert.equal(statusCalls, 1)
  assert.equal(monitor.changeEvent, "subagents:activity:changed")
  t.mock.timers.tick(50); await Promise.resolve(); await Promise.resolve(); await Promise.resolve()
  assert.equal(statusCalls, 1, "active work does not trigger fast polling when the provider pushes changes")
  monitor.nudge(); t.mock.timers.tick(250); await Promise.resolve(); await Promise.resolve(); await Promise.resolve()
  assert.equal(statusCalls, 2, "a change event (nudge) refreshes once")
  t.mock.timers.tick(1000); await Promise.resolve(); await Promise.resolve(); await Promise.resolve()
  assert.equal(statusCalls, 3, "the idle interval remains as a safety net")
  monitor.dispose()
})
