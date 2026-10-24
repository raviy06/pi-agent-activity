import assert from "node:assert/strict"
import test from "node:test"
import { EventEmitter } from "node:events"
import { RpcClient } from "../src/rpc.js"

export function bus() {
  const emitter = new EventEmitter()
  return { emitter, events: { on(name: string, callback: (value: unknown) => void) { emitter.on(name, callback); return () => { emitter.off(name, callback) } }, emit(name: string, value: unknown) { emitter.emit(name, value) } } }
}

test("correlates read-only RPC and removes reply listeners", async () => {
  const { emitter, events } = bus()
  emitter.on("subagents:rpc:v1:request", request => {
    assert.equal(request.method, "status")
    events.emit(`subagents:rpc:v1:reply:${request.requestId}`, { version: 1, requestId: "wrong", success: true, data: {} })
    events.emit(`subagents:rpc:v1:reply:${request.requestId}`, { version: 1, requestId: request.requestId, success: true, data: { value: 42 } })
  })
  const client = new RpcClient(events)
  assert.deepEqual(await client.request("status"), { value: 42 })
  assert.equal(emitter.eventNames().length, 1)
  client.dispose()
})

test("runtime rejects mutation methods before emitting an RPC request", async () => {
  const { emitter, events } = bus(); let requests = 0
  emitter.on("subagents:rpc:v1:request", () => { requests++ })
  const client = new RpcClient(events, 5)
  await assert.rejects(client.request("spawn" as "ping"), /read-only/)
  assert.equal(requests, 0)
  client.dispose()
})

test("timeout, provider errors and disposal reject without leaked listeners", async () => {
  const { emitter, events } = bus()
  const client = new RpcClient(events, 5)
  await assert.rejects(client.request("ping"), /timed out/)
  assert.equal(emitter.eventNames().length, 0)
  const pending = client.request("status")
  const rejected = assert.rejects(pending, /disposed/)
  client.dispose(); await rejected
  assert.equal(emitter.eventNames().length, 0)
  await assert.rejects(client.request("status"), /disposed/)
  const next = new RpcClient(events)
  emitter.on("subagents:rpc:v1:request", request => events.emit(`subagents:rpc:v1:reply:${request.requestId}`, { version: 1, requestId: request.requestId, success: false, error: { code: "no_active_session" } }))
  await assert.rejects(next.request("status"), /no_active_session/)
  next.dispose()
})
