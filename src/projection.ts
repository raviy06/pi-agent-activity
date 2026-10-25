import { stripVTControlCharacters } from "node:util"

export type State = "queued" | "running" | "paused" | "stopping" | "completed" | "failed" | "stopped" | "unknown"
export type Model = { requested?: string; effective?: string; fallbackReason?: string }
// `goal` is the child's task preview. It is deliberately not named `task`: pi-minimal reserves `row.task` for plan-task links.
export type Row = { key: string; agent: string; state: State; text: string; parentKey?: string; goal?: string; model?: Model; metrics: { elapsedMs?: number; tokens?: number } }
export type Projection = { available: boolean; incomplete: boolean; omitted: number; rows: Row[] }
export const record = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value)
const count = (value: unknown): value is number => Number.isSafeInteger(value) && (value as number) >= 0
const identity = (value: unknown): value is string => typeof value === "string" && /^[A-Za-z0-9._:@+-]{1,128}$/.test(value)
const states: State[] = ["queued", "running", "paused", "stopping", "completed", "failed", "stopped", "unknown"]
export function safeText(text: string, limit = 256): string {
  return stripVTControlCharacters(text.slice(0, 4096))
    // Remove control characters and bidi overrides; preserve ordinary Unicode labels.
    // eslint-disable-next-line no-control-regex -- control bytes are the sanitizer's target
    .replace(/[\u0000-\u001f\u007f-\u009f\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069]/g, " ")
    .replace(/\s+/gu, " ").trim().slice(0, limit)
}
export function parseActivity(value: unknown): Projection {
  if (!record(value) || value.version !== 1 || value.scope !== "current-session" || typeof value.available !== "boolean" ||
    typeof value.incomplete !== "boolean" || !count(value.generatedAt) || !Array.isArray(value.entries) || value.entries.length > 64 || !record(value.omitted)) throw Error("Unsupported activity snapshot")
  const omissions = value.omitted
  if (![omissions.active, omissions.recent, omissions.children].every(count) || typeof omissions.scanTruncated !== "boolean") throw Error("Invalid activity omission counts")
  const keys = new Set<string>()
  const rows = value.entries.map((entry): Row => {
    if (!record(entry) || !identity(entry.key) || keys.has(entry.key) || typeof entry.agent !== "string" || !states.includes(entry.state as State)) throw Error("Invalid activity row")
    keys.add(entry.key)
    const agent = safeText(entry.agent, 96)
    if (!agent) throw Error("Missing agent label")
    const activity = record(entry.activity) ? entry.activity : {}
    const tool = typeof activity.tool === "string" ? safeText(activity.tool, 64) : undefined
    const attention = activity.reason === "needs-attention"
    const state = entry.state as State
    const action = tool ? `Last: ${tool}` : ({ queued: "Queued", running: "Working", paused: "Paused", stopping: "Stop requested", completed: "Output available", failed: "Run failed", stopped: "Stopped", unknown: "Status unknown" })[state]
    // Optional fork 0.83+ fields: ignored when absent or malformed, never fatal.
    const goal = typeof entry.task === "string" ? safeText(entry.task, 120) || undefined : undefined
    const modelRecord = record(entry.model) ? entry.model : undefined
    const model: Model | undefined = modelRecord ? Object.fromEntries((["requested", "effective", "fallbackReason"] as const)
      .flatMap(field => typeof modelRecord[field] === "string" && safeText(modelRecord[field] as string, 128) ? [[field, safeText(modelRecord[field] as string, 128)]] : [])) : undefined
    const fallback = model?.fallbackReason && model.effective ? `↷ ${model.effective} (${model.fallbackReason})` : undefined
    // The host rejects a publication whose row text exceeds 256 characters.
    const text = safeText([goal, attention ? `Needs attention · ${action}` : action, fallback].filter((part): part is string => Boolean(part)).join(" · "), 256)
    const usage = record(entry.usage) ? entry.usage : {}
    const own = usage.source === "reported-own" && count(usage.input) && count(usage.output)
    const total = own ? (usage.input as number) + (usage.output as number) : undefined
    return { key: entry.key, agent, state, text,
      ...(identity(entry.parentKey) ? { parentKey: entry.parentKey } : {}),
      ...(goal ? { goal } : {}),
      ...(model && Object.keys(model).length ? { model } : {}),
      metrics: { ...(count(entry.elapsedMs) ? { elapsedMs: entry.elapsedMs } : {}), ...(count(total) ? { tokens: total } : {}) } }
  })
  return { available: value.available, incomplete: value.incomplete || omissions.scanTruncated,
    omitted: Math.min(Number.MAX_SAFE_INTEGER, (omissions.active as number) + (omissions.recent as number) + (omissions.children as number)), rows }
}
export const live = (state: State): boolean => ["running", "queued", "stopping"].includes(state)
