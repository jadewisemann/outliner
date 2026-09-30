#!/usr/bin/env bash
# Pushes a folder of CI evidence (screenshots, result JSON) to an orphan branch
# `ci-evidence/<name>`, so it can be read with plain git from anywhere that can
# reach the repository. Overwritten on every run; safe to delete.
#
#   publish-evidence.sh <dir> <name>
set -euo pipefail
dir="$1"
name="$2"
if [ ! -d "$dir" ]; then
  echo "no evidence in $dir"
  exit 0
fi
work="$(mktemp -d)"
cp -r "$dir"/. "$work"/
cd "$work"
echo "${GITHUB_SHA:-local} ${GITHUB_RUN_ID:-} $(date -u +%FT%TZ)" > RUN
git init -q -b "ci-evidence/$name"
git config user.name "evidence-bot"
git config user.email "evidence-bot@users.noreply.github.com"
git add -A
git commit -qm "evidence: $name at ${GITHUB_SHA:-local}"
git push -qf "https://x-access-token:${GITHUB_TOKEN}@github.com/${GITHUB_REPOSITORY}.git" "ci-evidence/$name"
