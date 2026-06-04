#!/usr/bin/env bash
#
# tmux kill helper — kills a pane/window/session, then keeps the tmux-resurrect
# snapshot honest so killed things don't come back on the next start.
#
# tmux-resurrect saves the *entire* server into one file (~/.tmux/resurrect/last),
# there's no per-pane save. So the strategy is:
#   - kill the thing
#   - if the server is still alive afterward, overwrite the snapshot with current
#     reality (re-save) so survivors restore and the killed thing doesn't
#   - if the kill ends the last session (server exits), wipe the snapshot so the
#     next fresh start comes up clean
#
# tmux's native cascade does the heavy lifting: killing the last pane kills its
# window, killing the last window kills its session, killing the last session
# exits the server.
#
# Concurrency: every kill runs under a mkdir-based mutex (flock isn't on macOS).
# Without it, mashing the kill bind fires overlapping copies of this script —
# a slow re-save (save.sh tars pane contents, then recreates the `last` symlink
# at the very end) from one kill can land *after* the final kill wiped `last`,
# resurrecting the session you just killed. Serializing makes the wipe the last
# word.
#
# Usage: tmux-kill.sh pane|window|session

set -u

scope="${1:-pane}"
resurrect_last="${HOME}/.tmux/resurrect/last"
save_script="${HOME}/.tmux/plugins/tmux-resurrect/scripts/save.sh"
lockdir="${TMPDIR:-/tmp}/tmux-kill.lock"

# Portable mutex via mkdir (atomic create). Spin briefly; steal a stale lock so
# a crashed holder can't wedge the bind forever.
acquire_lock() {
  local tries=0
  while ! mkdir "$lockdir" 2>/dev/null; do
    tries=$((tries + 1))
    if [ "$tries" -ge 100 ]; then  # ~5s of contention -> assume stale, steal it
      rmdir "$lockdir" 2>/dev/null
      continue
    fi
    sleep 0.05
  done
  trap 'rmdir "$lockdir" 2>/dev/null' EXIT
}
acquire_lock

# Snapshot current state *before* killing so we can predict server death.
sessions=$(tmux list-sessions 2>/dev/null | wc -l | tr -d ' ')
cur_session=$(tmux display-message -p '#S')
session_windows=$(tmux display-message -p '#{session_windows}')
window_panes=$(tmux display-message -p '#{window_panes}')

server_dies=false
case "$scope" in
  pane)
    # last pane -> window dies -> if last window, session dies -> if last session, server exits
    if [ "${window_panes:-1}" -le 1 ] && [ "${session_windows:-1}" -le 1 ] && [ "${sessions:-1}" -le 1 ]; then
      server_dies=true
    fi
    ;;
  window)
    if [ "${session_windows:-1}" -le 1 ] && [ "${sessions:-1}" -le 1 ]; then
      server_dies=true
    fi
    ;;
  session)
    if [ "${sessions:-1}" -le 1 ]; then
      server_dies=true
    fi
    ;;
esac

if [ "$server_dies" = true ]; then
  # Wipe the snapshot, then kill the whole server. kill-server (rather than
  # kill-window) guarantees continuum's in-server periodic save can't fire in
  # the gap and recreate `last`; the mutex guarantees no other save is mid-flight.
  rm -f "$resurrect_last"
  tmux kill-server
  exit 0
fi

case "$scope" in
  pane)   tmux kill-pane ;;
  window) tmux kill-window ;;
  session)
    # Switch the client to another session first so killing this one doesn't
    # detach us (or make tmux spawn a fresh session).
    tmux switch-client -n 2>/dev/null
    tmux kill-session -t "$cur_session"
    ;;
esac

# Server survived — overwrite the snapshot with the post-kill reality so the
# killed pane/window/session isn't resurrected, but everything else is. Run it
# synchronously (no `&`) so the mutex is held until the save's `ln -fs ... last`
# completes — that's what keeps a later kill's wipe from racing it.
if [ -x "$save_script" ]; then
  "$save_script" quiet >/dev/null 2>&1
fi
