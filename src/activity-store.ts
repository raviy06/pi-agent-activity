import { live, type Projection, type Row } from "./projection.js"

type Entry = { row: Row; terminalAt?: number; signature: string }
const signature = (row: Row) => JSON.stringify([row.agent, row.state, row.text])

/** Transient session view only. Never updates provider execution or task state. */
export class ActivityStore {
  private entries = new Map<string, Entry>()
  private dismissed = new Map<string, string>()
  private error: string | undefined
  private dropped = 0
  private sourceOmitted = 0
  incomplete = false

  apply(projection: Projection, now: number): void {
    if (!projection.available) { this.unavailable("Activity status unavailable"); return }
    this.error = undefined
    this.incomplete = projection.incomplete
    this.sourceOmitted = projection.omitted
    const next = new Map<string, Entry>()
    for (const row of projection.rows) {
      const previous = this.entries.get(row.key)
      next.set(row.key, { row, signature: signature(row), terminalAt: row.state === "completed" ? previous?.terminalAt ?? now : undefined })
    }
    for (const [key, previous] of this.entries) {
      if (next.has(key)) continue
      if (live(previous.row.state)) {
        const row = { ...previous.row, state: "unknown" as const, text: "Status no longer observed" }
        next.set(key, { row, signature: signature(row) })
      } else next.set(key, previous)
    }
    this.dropped = Math.max(0, next.size - 128)
    this.entries = new Map([...next].slice(0, 128))
    for (const key of this.dismissed.keys()) if (!this.entries.has(key)) this.dismissed.delete(key)
  }
  unavailable(reason: string): void { this.error = reason }
  get diagnostic(): string | undefined { return this.error ?? (this.incomplete ? "Partial activity snapshot" : undefined) }
  get hasActive(): boolean { return [...this.entries.values()].some(entry => live(entry.row.state)) }
  get omitted(): number { return Math.min(Number.MAX_SAFE_INTEGER, this.sourceOmitted + this.dropped + Math.max(0, this.visible().length - 64)) }
  private visible(now = Date.now()): Row[] {
    return [...this.entries.values()].filter(entry => {
      if (this.dismissed.get(entry.row.key) === entry.signature) return false
      return entry.terminalAt === undefined || now - entry.terminalAt < 10000
    }).map(entry => {
      const row = { ...entry.row, metrics: { ...entry.row.metrics } }
      if (this.error && live(row.state)) { row.state = "unknown"; row.text = "Provider unavailable · last known activity retained" }
      return row
    })
  }
  rows(now = Date.now()): Row[] {
    const rows = this.visible(now).slice(0, 64)
    const byKey = new Map(rows.map(row => [row.key, row]))
    for (const row of rows) {
      const seen = new Set([row.key]); let parent = row.parentKey
      while (parent) {
        if (seen.has(parent) || !byKey.has(parent)) { delete row.parentKey; break }
        seen.add(parent); parent = byKey.get(parent)?.parentKey
      }
    }
    return rows
  }
  dismiss(key: string): boolean {
    const entry = this.entries.get(key)
    if (!entry || live(entry.row.state)) return false
    this.dismissed.set(key, entry.signature)
    return true
  }
}
