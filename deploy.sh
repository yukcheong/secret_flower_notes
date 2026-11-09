#!/usr/bin/env bash
# Push the Secret Flower notebook (this folder) to GitHub for Cloudflare Pages.
#
# First run:   ./deploy.sh https://github.com/<you>/<repo>.git
#              (create the EMPTY repo on github.com first: no README / licence)
# Later runs:  ./deploy.sh            (remote is remembered)
#              ./deploy.sh "message"  (custom commit message)
set -euo pipefail
cd "$(dirname "$0")"

# 1. Run the tests; refuse to deploy a broken build.
if command -v node >/dev/null; then
  echo "Running tests..."
  node --test tests/*.test.mjs >/dev/null || { echo "Tests failed - not pushing." >&2; exit 1; }
fi

# 2. Repo setup (first run only).
if [ ! -d .git ]; then
  git init -q -b main
  git config core.autocrlf false
  printf '%s\n' 'node_modules/' '__pycache__/' '*.pyc' '.DS_Store' 'Thumbs.db' > .gitignore
fi

# Arguments: a repo URL and/or a commit message, in any order.
msg=""
remote=""
for a in "$@"; do
  case "$a" in
    https://*|git@*|file://*) remote="$a" ;;
    *) msg="$a" ;;
  esac
done

if [ -n "$remote" ]; then
  git remote remove origin 2>/dev/null || true
  git remote add origin "$remote"
fi
git remote get-url origin >/dev/null 2>&1 || {
  echo "No GitHub remote yet. Run: ./deploy.sh https://github.com/<you>/<repo>.git" >&2; exit 1; }

# 3. Bump the service worker cache version so installed phones get the update.
cur=$(grep -o "sf-notebook-v[0-9]*" sw.js | head -1)
if ! git diff --quiet HEAD -- . ':!sw.js' 2>/dev/null || [ -n "$(git ls-files --others --exclude-standard)" ] || ! git rev-parse -q HEAD >/dev/null; then
  next="sf-notebook-v$(( ${cur##*v} + 1 ))"
  sed -i "s/$cur/$next/" sw.js
  echo "Service worker: $cur -> $next"
else
  next="$cur"
fi
[ -n "$msg" ] || msg="Deploy $(date '+%Y-%m-%d %H:%M') ($next)"

# 4. Commit and push.
git add -A
git commit -q -m "$msg" && echo "Committed: $msg" || echo "Nothing new to commit."
git push -u origin main
echo
echo "Pushed to $(git remote get-url origin)"
echo "Cloudflare Pages redeploys automatically once the repo is connected."
