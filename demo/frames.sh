#!/usr/bin/env bash
# usage: demo/frames.sh <file.gif> [outdir]
# Writes <name>-start.png, -mid.png, -end.png and <name>-sheet.png (six evenly spaced frames, tiled) at the
# width the GIF is shown at, so legibility and clipping are judged as a reader sees them.
set -euo pipefail
gif="${1:?gif}"; out="${2:-$(dirname "$gif")/.frames}"
name="$(basename "$gif" .gif)"
mkdir -p "$out"
duration="$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$gif")"
at() { awk "BEGIN{print $duration*$1/100}"; }
for pair in start:3 mid:50 end:96; do   # end is early enough to be before the window closes
  ffmpeg -y -loglevel error -ss "$(at "${pair#*:}")" -i "$gif" -frames:v 1 "$out/$name-${pair%%:*}.png"
done
ffmpeg -y -loglevel error -i "$gif" -vf "fps=6/$duration,scale=400:-1,tile=3x2" -frames:v 1 "$out/$name-sheet.png"
echo "$out/$name-sheet.png"
