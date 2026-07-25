#!/usr/bin/env bash
# Downloads the two public-domain Bible source files used by extract_readings.js
set -e
curl -sL "https://raw.githubusercontent.com/scrollmapper/bible_databases/2024/json/t_web.json" -o web.json
curl -sL "https://raw.githubusercontent.com/scrollmapper/bible_databases/master/formats/json/KJVA.json" -o kjva.json
echo "Fetched web.json (World English Bible) and kjva.json (KJV w/ Apocrypha) — both public domain."
