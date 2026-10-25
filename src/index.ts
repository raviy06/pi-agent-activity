import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent"
import { ActivityStore } from "./activity-store.js"
import { FooterClient } from "./footer-client.js"
import { ActivityMonitor } from "./monitor.js"
import { RpcClient } from "./rpc.js"
import type { Row } from "./projection.js"

type SessionView = {
  id: string; store: ActivityStore; footer: FooterClient; monitor: ActivityMonitor
  render(): void; togglePlain(): void; toggleStatic(): void; dispose(): void
}

export default function activityExtension(pi: ExtensionAPI): void {
  let active: SessionView | undefined
  pi.on("session_start", (_event, ctx) => {
    active?.dispose(); active = undefined
    if (ctx.mode !== "tui") return
    const id = ctx.sessionManager.getSessionId(), store = new ActivityStore()
    const rpc = new RpcClient(pi.events)
    let alive = true, format: "icons" | "plain" = "icons", motion: "spinner" | "static" = "spinner"
    const footer = new FooterClient(pi.events, id, message => { if (alive) ctx.ui.notify(message, "warning") })
    const render = () => {
      if (!alive) return
      let rows = store.rows()
      let omitted = store.omitted
      if (store.diagnostic) {
        if (rows.length >= 64) omitted++
        rows = [{ key: "companion:provider", agent: "activity", state: "unknown" as const, text: store.diagnostic, metrics: {} }, ...rows].slice(0, 64)
      }
      const keys = new Set(rows.map(row => row.key))
      rows = rows.map(row => {
        if (row.parentKey && !keys.has(row.parentKey)) { const copy = { ...row }; delete copy.parentKey; return copy }
        return row
      })
      footer.publish({ rows, omitted, format, motion })
    }
    const off: Array<() => void> = []
    let changeSubscribed: string | undefined
    const monitor = new ActivityMonitor(rpc, store, render, undefined, changeEvent => {
      // Fork 0.83+ advertises a coalesced change event; subscribe once and let it drive refreshes.
      if (!alive || !changeEvent || changeEvent === changeSubscribed) return
      changeSubscribed = changeEvent
      off.push(pi.events.on(changeEvent, () => monitor.nudge()))
    })
    off.push(...["subagents:rpc:v1:ready", "subagent:child-status", "subagent:async-complete"].map(event => pi.events.on(event, () => monitor.nudge())))
    active = {
      id, store, footer, monitor, render,
      togglePlain() { format = format === "icons" ? "plain" : "icons"; render() },
      toggleStatic() { motion = motion === "spinner" ? "static" : "spinner"; render() },
      dispose() {
        if (!alive) return
        alive = false; monitor.dispose(); rpc.dispose()
        for (const unsubscribe of off) unsubscribe()
        footer.dispose()
      },
    }
    monitor.start()
  })
  pi.on("session_shutdown", () => { active?.dispose(); active = undefined })
  pi.registerCommand("activity", {
    description: "Inspect current-session child activity; plain, static, refresh, or dismiss",
    handler: async (args, ctx) => {
      const view = active
      if (ctx.mode !== "tui" || !view || view.id !== ctx.sessionManager.getSessionId()) {
        ctx.ui.notify("Activity view requires an active TUI session", "warning"); return
      }
      const action = args.trim()
      if (action === "plain") { view.togglePlain(); return }
      if (action === "static") { view.toggleStatic(); return }
      if (action === "refresh") { view.monitor.nudge(); return }
      if (action && action !== "dismiss") { ctx.ui.notify("Use /activity [plain|static|refresh|dismiss]", "info"); return }
      const rows = view.store.rows()
      if (!rows.length) { ctx.ui.notify(view.store.diagnostic ?? view.footer.diagnostic ?? "No current-session child activity", "info"); return }
      const labels = rows.map((row, index) => `${index + 1}. ${row.agent} · ${row.state} · ${row.text}`)
      const selected = await ctx.ui.select(action === "dismiss" ? "Dismiss a retained notice (does not stop work)" : "Current-session activity", labels)
      if (active !== view || selected === undefined) return
      const row = rows[labels.indexOf(selected)]
      if (!row) return
      if (action === "dismiss") {
        ctx.ui.notify(view.store.dismiss(row.key) ? "Notice dismissed; execution unchanged" : "Active work cannot be dismissed", "info")
        view.render(); return
      }
      showDetails(ctx, row, view.store.diagnostic ?? view.footer.diagnostic)
    },
  })
}

function showDetails(ctx: ExtensionContext, row: Row, diagnostic?: string): void {
  ctx.ui.notify([
    `${row.agent} · ${row.state}`, row.text,
    `Elapsed: ${row.metrics.elapsedMs === undefined ? "unavailable" : `${row.metrics.elapsedMs} ms`}`,
    `Own input + output tokens: ${row.metrics.tokens ?? "unavailable"}`,
    ...(diagnostic ? [diagnostic] : []),
    "Use /subagents-fleet for provider-owned inspection and controls.",
  ].join("\n"), "info")
}
