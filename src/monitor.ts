import { ActivityStore } from "./activity-store.js"
import { parseActivity, record, safeText } from "./projection.js"

type Reader = { request(method: "ping" | "status"): Promise<unknown> }

export type MonitorIntervals = {
  /** Poll period while tracked work is active and no change hints are advertised. */
  activeMs: number
  /** Poll period while idle and no change hints are advertised. */
  idleMs: number
  /** Safety-net poll periods once the provider advertises change events; hints drive refreshes. */
  hintedActiveMs?: number
  hintedIdleMs?: number
}

const DEFAULT_INTERVALS: Required<MonitorIntervals> = { activeMs: 2000, idleMs: 10000, hintedActiveMs: 10000, hintedIdleMs: 30000 }

/** `ping.events` keys whose values name a "state changed, read status again" hint. Transport keys are excluded. */
const HINT_EVENT_KEYS = ["childStatus", "asyncStarted", "asyncComplete", "processTerminal", "jobsChanged"] as const
const MAX_EVENT_NAME = 128

/**
 * Reads the change-hint event names a provider advertises in its `ping` reply: the fork's coalesced
 * `capabilities.activityEvents.event` and upstream's lifecycle/`jobsChanged` names under `events`.
 * Names are taken from the reply rather than hardcoded so a renamed event cannot silently stop refreshes.
 */
export function discoverHintEvents(ping: unknown): string[] {
  if (!record(ping)) return []
  const names: string[] = []
  const add = (value: unknown) => {
    if (typeof value !== "string" || !value || value.length > MAX_EVENT_NAME || names.includes(value)) return
    names.push(value)
  }
  if (record(ping.capabilities) && record(ping.capabilities.activityEvents) && ping.capabilities.activityEvents.version === 1) add(ping.capabilities.activityEvents.event)
  if (record(ping.events)) for (const key of HINT_EVENT_KEYS) add(ping.events[key])
  return names
}

export class ActivityMonitor {
  private stopped = false
  private started = false
  private busy = false
  private capable = false
  private hinted = false
  private hintPending = false
  private timer?: ReturnType<typeof setTimeout>
  private readonly intervals: Required<MonitorIntervals>
  constructor(private rpc: Reader, private store: ActivityStore, private changed: () => void,
    intervals: MonitorIntervals = DEFAULT_INTERVALS, private onHintEvents?: (names: string[]) => void) {
    this.intervals = { ...DEFAULT_INTERVALS, ...intervals }
  }
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
        const hints = discoverHintEvents(ping)
        if (hints.length) { this.hinted = true; this.onHintEvents?.(hints) }
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
        this.timer = setTimeout(() => { void this.refresh() }, this.nextDelay())
      }
    }
  }
  private nextDelay(): number {
    const { activeMs, idleMs, hintedActiveMs, hintedIdleMs } = this.intervals
    if (this.hinted) return this.store.hasActive ? hintedActiveMs : hintedIdleMs
    return this.store.hasActive ? activeMs : idleMs
  }
  dispose(): void { this.stopped = true; clearTimeout(this.timer) }
}
