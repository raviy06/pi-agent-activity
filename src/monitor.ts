import { ActivityStore } from "./activity-store.js"
import { parseActivity, record, safeText } from "./projection.js"

type Reader = { request(method: "ping" | "status"): Promise<unknown> }

export class ActivityMonitor {
  private stopped = false
  private started = false
  private busy = false
  private capable = false
  /** Fork 0.83+: the provider pushes `subagents:activity:changed`; polling then only runs at the idle interval as a safety net. */
  changeEvent?: string
  private hintPending = false
  private timer?: ReturnType<typeof setTimeout>
  constructor(private rpc: Reader, private store: ActivityStore, private changed: () => void,
    private intervals = { activeMs: 2000, idleMs: 10000 }, private onCapabilities?: (changeEvent: string | undefined) => void) {}
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
        const events = record(ping) && record(ping.capabilities) && record(ping.capabilities.activityEvents) ? ping.capabilities.activityEvents : undefined
        this.changeEvent = events && events.version === 1 && typeof events.event === "string" && /^[A-Za-z0-9:_.-]{1,128}$/.test(events.event) ? events.event : undefined
        this.onCapabilities?.(this.changeEvent)
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
        this.timer = setTimeout(() => { void this.refresh() }, this.store.hasActive && !this.changeEvent ? this.intervals.activeMs : this.intervals.idleMs)
      }
    }
  }
  dispose(): void { this.stopped = true; clearTimeout(this.timer) }
}
