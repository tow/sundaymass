#!/usr/bin/env bash
# Downloads the two public-domain Bible source files used by extract_readings.js
set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SOURCE_DIR="$SCRIPT_DIR/../data/sources"
mkdir -p "$SOURCE_DIR"
curl -sL "https://raw.githubusercontent.com/scrollmapper/bible_databases/2024/json/t_web.json" -o "$SOURCE_DIR/web.json"
curl -sL "https://raw.githubusercontent.com/scrollmapper/bible_databases/master/formats/json/KJVA.json" -o "$SOURCE_DIR/kjva.json"
echo "Fetched web.json (World English Bible) and kjva.json (KJV w/ Apocrypha) — both public domain."
