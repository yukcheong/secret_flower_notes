Secret Flower Notebook
======================

A private, offline-capable phone notebook that replaces the paper note sheet for
The Secret Flower. Static site: plain HTML/CSS/JS, no build step, no backend.
Each player opens it on their own phone; notes stay on that device (localStorage).

Run locally
-----------
  python serve.py            -> http://127.0.0.1:8765/
(Use serve.py, not "python -m http.server": on this Windows machine the stock
server sends .js as text/plain, which browsers refuse for ES modules.)

To open on a phone on the same Wi-Fi, edit serve.py to bind "0.0.0.0" and browse
to http://<PC-IP>:8765/ . Offline mode / install-to-home-screen need HTTPS
(or localhost), so for real use deploy it:

Deploy (any static host)
------------------------
Upload this folder as-is. E.g. GitHub Pages: push the folder contents to a repo,
Settings -> Pages -> deploy from branch. Netlify/Cloudflare Pages: drag & drop.
Exclude tests/, package.json, serve.py if you like (harmless either way).

On the phone: open the URL once while online -> "Offline ready" appears in the
menu -> Add to Home Screen. After that it works with no connection.

Updating
--------
When you change any file, bump VERSION in sw.js. Open copies will show
"A new version is available - Update now".

Tests
-----
  npm test        (Node 18+; game data, state/undo, storage/import validation)

Files
-----
  index.html, styles.css      UI shell (phone-first; side-by-side on tablet/desktop)
  js/game-data.js             flowers, groups, setup tables from the rulebook
  js/state.js                 pure notebook state + undo/redo
  js/storage.js               save/load/export/import with validation
  js/rules.js                 short rule reminders (paraphrased, with page refs)
  js/app.js                   rendering and events
  sw.js, manifest.webmanifest offline cache + installable app

## Deploy (GitHub → Cloudflare Pages)

1. Create an empty repo on github.com (no README/licence).
2. `./deploy.sh https://github.com/<you>/<repo>.git` (or `deploy.cmd <url>` from Explorer/cmd).
   It runs the tests, bumps the `sw.js` cache version, commits and pushes `main`.
3. Later updates: just `./deploy.sh` or `./deploy.sh "what changed"`.
4. Cloudflare dashboard → Workers & Pages → Create → Pages → Connect to Git → pick the repo.
   Framework preset: None. Build command: (empty). Build output directory: `/`.
