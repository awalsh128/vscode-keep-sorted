#!/usr/bin/env bash
# usage: demo/record.sh <scene>   writes media/demo/<scene>.gif
set -euo pipefail
scene="${1:?scene name}"
root="$(cd "$(dirname "$0")/.." && pwd)"
out="$root/media/demo"
work="$(mktemp -d)"

for tool in Xvfb ffmpeg ffprobe node xdotool; do
  command -v "$tool" >/dev/null || { echo "missing $tool" >&2; exit 2; }
done

cleanup() {
  kill "${ffmpeg_pid:-}" "${vscode_pid:-}" "${xvfb_pid:-}" 2>/dev/null || true
  rm -rf "$work"
}
trap cleanup EXIT

export DISPLAY=:99 DEMO_SCENE="$scene" DEMO_READY_FILE="$work/ready" DEMO_DONE_FILE="$work/done"
# On a Wayland desktop Electron would open on the real screen, not Xvfb; force it onto X11.
unset WAYLAND_DISPLAY
export XDG_SESSION_TYPE=x11 ELECTRON_OZONE_PLATFORM_HINT=x11
Xvfb :99 -screen 0 "${DEMO_SIZE:-960x540}x24" &
xvfb_pid=$!
sleep 1

node "$root/demo/out/launch.js" &
vscode_pid=$!
until [ -f "$DEMO_READY_FILE" ]; do
  kill -0 "$vscode_pid" 2>/dev/null || { echo "VS Code exited before the scene was ready" >&2; exit 1; }
  sleep 0.2
done

xdotool mousemove 940 2   # park the pointer in a corner, out of the shot
ffmpeg -y -loglevel error -f x11grab -framerate 30 -video_size "${DEMO_SIZE:-960x540}" -i :99 \
  -c:v libx264 -preset ultrafast -pix_fmt yuv420p "$work/raw.mp4" &
ffmpeg_pid=$!

# Stop filming when the scene is done, not when the window closes, or the take ends on a black frame.
until [ -f "$DEMO_DONE_FILE" ]; do
  kill -0 "$vscode_pid" 2>/dev/null || break   # the scene threw and VS Code exited
  sleep 0.2
done
kill -INT "$ffmpeg_pid"; wait "$ffmpeg_pid" || true
wait "$vscode_pid"                 # nonzero when a scene assertion failed; set -e then discards the take
[ -f "$DEMO_DONE_FILE" ] || { echo "scene did not finish" >&2; exit 1; }

mkdir -p "$out"
ffmpeg -y -loglevel error -i "$work/raw.mp4" \
  -vf "fps=12,scale=800:-1:flags=lanczos,split[a][b];[a]palettegen=stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=4" \
  "$out/$scene.gif"
"$root/demo/frames.sh" "$out/$scene.gif" "$out/.frames"   # add media/demo/.frames/ to .gitignore
