import { randomUUID } from "node:crypto"
import { record } from "./projection.js"

export type Events = { on(name: string, callback: (value: unknown) => void): () => void; emit(name: string, value: unknown): void }

/** Only read-only methods are reachable from this companion. */
export class RpcClient {
  private stopped = false
  private pending = new Set<() => void>()
  constructor(private events: Events, private timeoutMs = 3000) {}
  request(method: "ping" | "status"): Promise<unknown> {
    if (method !== "ping" && method !== "status") return Promise.reject(Error("Activity RPC is read-only"))
    if (this.stopped) return Promise.reject(Error("RPC client disposed"))
    return new Promise((resolve, reject) => {
      const requestId = randomUUID()
      let finished = false
      const finish = (error?: Error, data?: unknown) => {
        if (finished) return
        finished = true; clearTimeout(timer); off(); this.pending.delete(cancel)
        if (error) reject(error); else resolve(data)
      }
      const cancel = () => finish(Error("RPC client disposed"))
      const off = this.events.on(`subagents:rpc:v1:reply:${requestId}`, reply => {
        if (!record(reply) || reply.requestId !== requestId) return
        if (reply.version !== 1) { finish(Error("Unsupported RPC protocol")); return }
        if (reply.success !== true) {
          const code = record(reply.error) && typeof reply.error.code === "string" ? reply.error.code.slice(0, 64) : "request_failed"
          finish(Error(`Activity provider: ${code}`)); return
        }
        finish(undefined, reply.data)
      })
      const timer = setTimeout(() => finish(Error(`Activity ${method} timed out`)), this.timeoutMs)
      this.pending.add(cancel)
      try { this.events.emit("subagents:rpc:v1:request", { version: 1, requestId, method, params: {} }) }
      catch { finish(Error("Activity request failed")) }
    })
  }
  dispose(): void {
    if (this.stopped) return
    this.stopped = true
    for (const cancel of [...this.pending]) cancel()
  }
}
