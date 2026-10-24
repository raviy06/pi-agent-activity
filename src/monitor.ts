import { ActivityStore } from "./activity-store.js"
import { parseActivity, record, safeText } from "./projection.js"

type Reader = { request(method: "ping" | "status"): Promise<unknown> }

export class ActivityMonitor {
  private stopped = false
  private started = false
  private busy = false
  private capable = false
  private hintPending = false
  private timer?: ReturnType<typeof setTimeout>
  constructor(private rpc: Reader, private store: ActivityStore, private changed: () => void,
    private intervals = { activeMs: 2000, idleMs: 10000 }) {}
  start(): void { if (!this.started) { this.started = true; void this.refresh() } }
  nudge(): void {
    if (this.stopped || this.busy || !this.started || this.hintPending) return
    this.hintPending = true
    clearTimeout(this.timer)
    // Coalesce bursts; hints never supply state directly or start a model turn.
    this.timer = setTimeout(() => { void this.refresh() }, 250)
  }
  private async refresh(): Promise<void> {
    if (this.stopped || this.busy) return
    this.busy = true
    this.hintPending = false
    try {
      if (!this.capable) {
        const ping = await this.rpc.request("ping")
        if (this.stopped) return
        this.capable = record(ping) && record(ping.capabilities) && record(ping.capabilities.activityStatus) && ping.capabilities.activityStatus.version === 1
        if (!this.capable) throw Error("Provider requires activityStatus v1 (scoped pi-subagents fork)")
      }
      const status = await this.rpc.request("status")
      if (this.stopped) return
      if (!record(status)) throw Error("Invalid activity response")
      this.store.apply(parseActivity(status.activity), Date.now())
    } catch (error) {
      if (!this.stopped) {
        this.capable = false
        this.store.unavailable(error instanceof Error ? safeText(error.message) : "Activity provider unavailable")
      }
    } finally {
      this.busy = false
      if (!this.stopped) {
        this.changed()
        this.timer = setTimeout(() => { void this.refresh() }, this.store.hasActive ? this.intervals.activeMs : this.intervals.idleMs)
      }
    }
  }
  dispose(): void { this.stopped = true; clearTimeout(this.timer) }
}
