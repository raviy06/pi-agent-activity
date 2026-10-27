# Pi Agent Activity

A read-only companion connecting the fork's structured subagent activity API to
pi-minimal's footer. The public source checkout is npm-private; a publishable
artifact is built separately. Publication status must be verified on npm.

## Requirements

- Pi >=1.4.0.
- Pi-minimal >=0.2.3 with its activity footer slot.
- `@raviy06/pi-subagents` 0.81.1 or newer (published; 0.83.0 current), advertising
  `activityStatus: { version: 1 }`. Upstream `pi-subagents` does not expose this API.
  From fork 0.83.0 the snapshot also carries optional `task`, `startedAt` and `model`
  fields (`ping.capabilities.activityStatus.fields`), emits `subagents:activity:changed`
  and appends `subagents:record` session entries. This companion subscribes to
  that event, and to the lifecycle and `subagent:jobs-changed` names the provider
  lists under `ping.events` (upstream pi-subagents 0.83.0+), so it refreshes on
  demand; polling remains only as a slow safety net. The read-only `ping`/`status`
  contract is unchanged.

The package uses public event contracts, not private imports into either owner.
It never replaces the footer, spawns/stops agents, updates tasks, or edits another
extension's configuration. Only `ping` and `status` RPC methods are permitted.

## UI and commands

Current-session rows appear in pi-minimal's bottom activity group. They use the
host's icons, colors, width handling and spinner. Optional metrics are observed
elapsed duration and the child's own reported input + output usage. Missing
values stay unavailable. This companion does not yet attach plan/task IDs because
the durable tracker is not built; it does not infer task acceptance from runs.

- `/activity` — select a child and inspect its observed state/metrics.
- `/activity refresh` — request a coalesced refresh.
- `/activity plain` — toggle explicit textual states for this session.
- `/activity static` — toggle static/spinning indicators for this session.
- `/activity dismiss` — hide a retained notice, never stop work. Active rows
  cannot be dismissed. Changed state/activity resurfaces a dismissed notice.
- `/subagents-fleet` — existing provider-owned detailed inspection/control UI.

No global keyboard shortcuts are intercepted. Mode toggles and dismissals are
transient and reset when the extension runtime is replaced.

## State and recovery rules

- Successful completions remain visible for ten seconds from their first local
  terminal observation; failures and stops remain for sixty seconds so they are
  noticed without staying in error colour for the rest of the session. Paused
  and unknown notices may need the user and remain until dismissed. A row whose
  terminal state changes restarts its window.
- The cache is bounded and not a permanent run ledger. A reload can redisplay
  retained owner history because the local display history is intentionally reset.
- A previously active row missing from a snapshot becomes unknown, never done.
- Provider outages preserve last-known metrics and mark live state unknown.
- `needs-attention` is shown as text while preserving the observed execution
  state; it does not invent a human approval request or paused lifecycle.
- Partial/truncated snapshots produce a diagnostic and known omission counts.
  These counts are lower bounds when the provider could not enumerate everything.
- Parent references are repaired after filtering/retention, so missing parents
  cannot make the host reject the entire publication.

## Performance and lifecycle

One request chain at a time, with 3-second RPC deadlines. Change events
advertised in the provider's `ping` reply hint a 250ms coalesced refresh; they
never supply authoritative rows or trigger model turns. With such hints the poll
is a safety net every 10 seconds while tracked work is active, otherwise every
30 seconds; a provider that advertises none is polled every 2 / 10 seconds. Rendering/spinner frames never make provider requests.

Footer publications are skipped when unchanged. Exact-session host registration
supports either extension load order, missing readiness notifications, stale
handles and idempotent teardown. Polling/listeners/pending requests stop on session
shutdown; stale replies cannot publish into the next session. Non-TUI sessions
start no monitor or footer client.

## Development

```sh
npm ci --ignore-scripts
npm run lint
npm run typecheck
npm test
npm run build
npm run build:pkg
npm run check:release -- --packed
python3 scripts/smoke.py \
  --minimal /absolute/path/to/pi-minimal/dist/index.js \
  --fork /absolute/path/to/pi-subagents/dist-pkg/bundle/index.js
```

The POSIX smoke harness uses isolated temporary profiles with no operator
credentials and performs no billable model calls. It checks the actual fork's
idle API, then a separate synthetic running/completed provider through the real
footer. It does not load the real fork alongside the synthetic provider.

The built entry is `dist/index.js`. Generated files are not source-controlled in
this private development package. Tests use fake buses/snapshots; additional
isolated TUI checks exercised the actual fork's idle status and a clearly labelled
sample provider through the real pi-minimal footer. These checks are not a claim
of completed live, model-backed subagent lifecycle testing.

## Activation checkpoint — not performed automatically

1. Back up the current package/config choices and finish active subagent work.
2. Explicitly disable the upstream subagent owner before loading its fork. Do not
   run both owners; their tool/event names intentionally match.
3. Load pi-minimal >=0.2.3, the scoped fork build, and this companion in a fresh
   isolated session first. Confirm `activityStatus` capability and `/activity`.
4. Only after the replacement works, optionally set the provider's `fleetView`
   and `asyncWidget` to false to avoid duplicate live surfaces. Preserve original
   settings for rollback. This package never suppresses their widgets itself.
5. For rollback disable this companion, restore the recorded provider/visual
   settings, and restart the session. No agent or task data is deleted.

See [RELEASING.md](RELEASING.md) for PR checks, artifact packaging, automatic
CI-gated main releases and npm trusted-publisher setup. Ordinary PRs do not need
version or changelog changes. A release PR versions the grouped changes and adds
the batch changelog; unchanged-version main pushes never request publication.
Adding the workflows does not itself publish either package or configure npm
scope ownership.
