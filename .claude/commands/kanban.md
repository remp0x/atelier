---
description: Check Atelier kanban state, ensure local dev + ngrok are running, and pick the next card to work on.
allowed-tools: Bash, Read, Edit, Write, Grep, Glob
argument-hint: "[filter: backlog | in_progress | completed | all]  (default: backlog + in_progress)"
---

# /kanban — Atelier kanban state

You are resuming Atelier work in a fresh terminal. Do the following, in order, without asking for confirmation.

## 1. Bring the local stack up (idempotent)

Check what's already running before starting anything:

```bash
lsof -ti:3000 2>/dev/null   # Next dev server
lsof -ti:4040 2>/dev/null   # ngrok web UI
```

- If nothing is on `:3000`, start Next dev in the background from the project root:
  ```bash
  cd "/Users/mmg/PERSONAL/04 REPOS/atelier" && npm run dev > /tmp/atelier-dev.log 2>&1 &
  ```
  Then poll until ready: `until curl -sf http://localhost:3000/api/kanban/me > /dev/null; do sleep 2; done`
- If nothing is on `:4040`, start ngrok in the background:
  ```bash
  ngrok http 3000 --log stdout > /tmp/atelier-ngrok.log 2>&1 &
  ```
  Then read the public URL from `curl -sf http://127.0.0.1:4040/api/tunnels`.

Do NOT restart anything that is already up. Reuse existing tunnels.

## 2. Fetch kanban state

```bash
curl -sf http://localhost:3000/api/kanban/cards
```

`/api/kanban/cards` trusts `localhost` requests (see `src/lib/kanban-auth.ts`), so no auth headers are needed.

Each card has: `id`, `title`, `description`, `status` (`backlog | in_progress | completed`), `position`, `link_url`, `labels[]`, `created_by`, `claude_status`, `claude_last_sent_at`, `created_at`, `updated_at`.

## 3. Report (concise)

Filter by `$ARGUMENTS` if provided (`backlog`, `in_progress`, `completed`, or `all`). Default: show `backlog` + `in_progress`, hide `completed`.

Output format — keep it tight, no preamble:

```
Local:  http://localhost:3000/admin/kanban
Ngrok:  <public_url>/admin/kanban

Backlog (N)
  - <title> [labels]  (<id_short>)  link=<link_url or />
  ...

In progress (N)
  - <title> [labels]  (<id_short>)  claude=<claude_status>
  ...
```

- `id_short` = last 8 chars of the card id.
- Sort each group by `position` ascending.
- If a group is empty, omit it.
- If `$ARGUMENTS` == `completed` or `all`, include the completed group too (sorted by `updated_at` desc, cap at 10).

## 4. Next action

After the listing, recommend exactly one card to work on next, using this priority:

1. `in_progress` with `claude_status = 'sent'` that appears stuck (no update in >2h) — resume it.
2. Oldest `backlog` card with `claude_status` null — start it.
3. Otherwise: say "Kanban clear."

State the recommendation in one sentence with the card id and title. Do NOT start implementing unless the user says to.

## Rules

- Never hardcode the ngrok URL; always read it from `http://127.0.0.1:4040/api/tunnels`.
- Never use `pkill` or kill dev/ngrok processes in this command.
- Never write to the kanban (`POST`/`PATCH`/`DELETE`) from this command — read-only.
- If the dev server fails to boot (log has a fatal error), surface the last 20 lines of `/tmp/atelier-dev.log` and stop.
