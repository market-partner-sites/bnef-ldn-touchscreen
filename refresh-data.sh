#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# Refresh the kiosk's agenda / speaker data from bbgevent.app.
#
# The kiosk can't call the bbgevent.app API directly from the browser (CORS
# only allows bbgevent.app itself), so it reads the copies in data/*.json.
# This script fetches fresh copies server-side and, optionally, uploads
# them to S3 so every kiosk picks them up on its next 5-minute refresh.
#
# Usage (run from this folder):
#   ./refresh-data.sh                      refresh data/*.json once
#   ./refresh-data.sh --watch              keep refreshing every 5 minutes
#   S3_BUCKET=my-bucket ./refresh-data.sh --watch
#                                          ...and upload to s3://my-bucket/data/
#   S3_BUCKET=my-bucket/kiosk ./refresh-data.sh --watch
#                                          ...if the site lives under a prefix
#
# Options via environment variables:
#   S3_BUCKET   bucket (optionally /prefix) the site is hosted in
#   INTERVAL    seconds between refreshes in --watch mode (default 300)
#   AWS_PROFILE the usual AWS CLI profile variable, if you use one
#
# A failed or invalid download never overwrites the last good file.
# ---------------------------------------------------------------------------
set -u
cd "$(dirname "$0")"

BASE="${BASE:-https://bbgevent.app/api/clients/bnef/events/bnef_summit_london_2026}"
INTERVAL="${INTERVAL:-300}"
S3_BUCKET="${S3_BUCKET:-}"
S3_BUCKET="${S3_BUCKET#s3://}"; S3_BUCKET="${S3_BUCKET%/}"

if [ -n "$S3_BUCKET" ] && ! command -v aws >/dev/null 2>&1; then
  echo "S3_BUCKET is set but the AWS CLI ('aws') isn't installed." >&2
  echo "Install it (e.g. 'brew install awscli') and run 'aws configure' first." >&2
  exit 1
fi

valid_json() {
  if command -v python3 >/dev/null 2>&1; then
    python3 -c 'import json,sys; json.load(open(sys.argv[1]))' "$1" 2>/dev/null
  else
    # no python: at least check it's non-empty and looks like JSON
    [ -s "$1" ] && head -c 1 "$1" | grep -q '[[{]'
  fi
}

fetch() {  # fetch URL name
  local url="$1" name="$2" out="data/$2.json" tmp
  tmp="$(mktemp)"
  if curl -sSfL --max-time 30 "$url" -o "$tmp" && valid_json "$tmp"; then
    if [ -f "$out" ] && cmp -s "$tmp" "$out"; then
      rm -f "$tmp"; echo "  $name: unchanged"
    else
      mv "$tmp" "$out"; chmod 644 "$out"; echo "  $name: UPDATED"; CHANGED=1
    fi
  else
    rm -f "$tmp"; echo "  $name: FAILED - keeping the existing file" >&2
  fi
}

upload() {
  [ -n "$S3_BUCKET" ] || return 0
  local f
  for f in agenda speakers relationships; do
    aws s3 cp "data/$f.json" "s3://$S3_BUCKET/data/$f.json" \
      --content-type 'application/json' \
      --cache-control 'no-cache, no-store, max-age=0' \
      --only-show-errors \
      && echo "  uploaded data/$f.json -> s3://$S3_BUCKET/data/"
  done
}

run_once() {
  CHANGED=0
  echo "[$(date '+%H:%M:%S')] Refreshing event data..."
  mkdir -p data
  fetch "$BASE/agendas" agenda
  fetch "$BASE/registrations?categoryType=Speaker" speakers
  fetch "$BASE/content-relationships" relationships
  # Upload when something changed, and always on the first run so S3 matches.
  if [ "$CHANGED" = 1 ] || [ "${FIRST:-1}" = 1 ]; then upload; fi
  FIRST=0
}

if [ "${1:-}" = "--watch" ]; then
  echo "Refreshing every ${INTERVAL}s. Press Ctrl+C to stop."
  while true; do run_once; sleep "$INTERVAL"; done
else
  run_once
fi
