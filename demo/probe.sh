#!/usr/bin/env bash
# usage: demo/probe.sh <scene> <out.png>   screenshots a held state to read pixel coordinates
set -euo pipefail
scene="$1"; shot="$2"
root="$(cd "$(dirname "$0")/.." && pwd)"; work="$(mktemp -d)"
cleanup(){ kill "${vp:-}" "${xp:-}" 2>/dev/null || true; rm -rf "$work"; }; trap cleanup EXIT
export DISPLAY=:99 DEMO_SCENE="$scene" DEMO_READY_FILE="$work/ready" DEMO_DONE_FILE="$work/done"
unset WAYLAND_DISPLAY; export XDG_SESSION_TYPE=x11 ELECTRON_OZONE_PLATFORM_HINT=x11
Xvfb :99 -screen 0 "960x540x24" & xp=$!; sleep 1
node "$root/demo/out/launch.js" & vp=$!
until [ -f "$DEMO_READY_FILE" ]; do sleep 0.2; done
xdotool mousemove 940 2
sleep 6
ffmpeg -y -loglevel error -f x11grab -video_size 960x540 -i :99 -frames:v 1 "$shot"
wait "$vp" || true
