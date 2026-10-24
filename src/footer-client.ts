import { record } from "./projection.js"
import type { Row } from "./projection.js"
import type { Events } from "./rpc.js"

type Body = { rows: Row[]; omitted: number; motion: "spinner" | "static"; format: "icons" | "plain" }
type Registration = { publish(value: unknown): { ok: boolean; code?: string }; dispose(): void }

export class FooterClient {
  private handle?: Registration
  private last?: Body
  private sent?: string
  private revision = 0
  private stopped = false
  private error?: string
  private off: Array<() => void>
  constructor(private events: Events, private sessionId: string, private notify: (message: string) => void) {
    const matches = (value: unknown) => record(value) && value.version === 1 && value.sessionId === this.sessionId
    this.off = [
      events.on("pi-minimal:footer:v1:ready", value => { if (matches(value) && this.last) { this.sent = undefined; this.publish(this.last) } }),
      events.on("pi-minimal:footer:v1:unavailable", value => { if (matches(value)) { this.handle = undefined; this.sent = undefined } }),
    ]
  }
  get diagnostic(): string | undefined { return this.error }
  private fail(message: string): void {
    if (this.error !== message) this.notify(message)
    this.error = message
  }
  private register(): boolean {
    const request: Record<string, unknown> = { version: 1, sessionId: this.sessionId, owner: "pi-agent-activity", slot: "activity" }
    this.events.emit("pi-minimal:footer:v1:register", request)
    const result = request.result
    if (!record(result) || result.ok !== true || !record(result.registration) || typeof result.registration.publish !== "function" || typeof result.registration.dispose !== "function") {
      const code = record(result) && typeof result.code === "string" ? result.code : "pi-minimal >=0.2.3 required"
      this.fail(`Activity footer unavailable: ${code}`); return false
    }
    this.handle = result.registration as unknown as Registration
    this.revision = 0; this.sent = undefined
    return true
  }
  publish(body: Body): void {
    if (this.stopped) return
    this.last = body
    try {
      if (!this.handle && !this.register()) return
      const key = JSON.stringify(body)
      if (this.sent === key) return
      let result = this.handle!.publish({ ...body, revision: this.revision++ })
      if (!result.ok && result.code === "disposed") {
        this.handle = undefined
        if (!this.register()) return
        result = this.handle!.publish({ ...body, revision: this.revision++ })
      }
      if (!result.ok) { this.fail(`Activity footer rejected snapshot: ${result.code ?? "unknown"}`); return }
      this.sent = key; this.error = undefined
    } catch { this.fail("Activity footer communication failed") }
  }
  dispose(): void {
    if (this.stopped) return
    this.stopped = true
    for (const off of this.off) off()
    try { this.handle?.dispose() } catch { /* Host may already be gone. */ }
    this.handle = undefined; this.last = undefined
  }
}
