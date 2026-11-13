# Ghar — Hindi Learning Studio

A standalone React application for **Alex and Andrew**, with a Node/Express API and SQLite database. Choose a name to begin: no account setup or passwords. Both learners use the same deployed URL, while progress stays separate.

## Live app

- [Open Ghar Hindi](https://ghar-hindi.up.railway.app)
- [Public GitHub repository](https://github.com/alexgushulak/ghar-hindi)
- [Railway project](https://railway.com/project/6e60f781-3ddb-432d-8fd6-c7c0934d25cc)

Production is connected to `main`, with a 512 MB `ghar-progress` volume at `/data`, `DATA_DIR=/data`, and one replica in `us-west2`. Pushes to `main` deploy automatically.

## Run locally

Install **Node.js 22.13 or newer**, then run these commands inside this app folder:

```sh
npm ci
npm run dev
```

Open http://localhost:3000. Development serves React and the API from one origin, with hot reload. Local progress lives in `data/ghar.sqlite`, which is ignored by Git.

Production:

```sh
npm run build
npm start
```

Run `npm test` for curriculum, scheduling, scoring, user isolation, retry safety, concurrent-client, and database-restart checks.

## GitHub

To publish a fresh copy, create an empty GitHub repository and run inside this folder:

```sh
git init
git add .
git commit -m "Build Ghar Hindi React application"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/ghar-hindi.git
git push -u origin main
```

Replace the account/repository names. The `.gitignore` excludes dependencies, build output, environment secrets, and personal learning databases.

## Railway deployment and persistence

1. Create a Railway project using **Deploy from GitHub repo**. Select this repository, with this app folder at the repository root.
2. Railway uses the included `Dockerfile` to install, build, and start. `railway.json` sets `/api/health` as the health check. No separate frontend or database service is needed.
3. **Attach a persistent volume to the app service, mounted at exactly `/data`.** Set service variable `DATA_DIR=/data` (also the Docker image default). Do this before using the app for real progress.
4. Keep **one replica**. SQLite is on this service’s volume; independent replicas would not share a database. Use PostgreSQL if you later need multiple replicas.
5. Let Railway supply `PORT`; the server listens on `0.0.0.0` and that port. Generate a public domain in the service Networking settings.
6. Open the same domain on both devices. Select Alex, review a card, then select Alex on another device. Progress and the scoreboard refresh every five seconds.

**The volume is essential:** ordinary container files can disappear when Railway replaces the container. The app creates its database at runtime, after volume mounting. Retain the same volume on redeploy, and enable Railway volume backups or export each learner’s JSON periodically. `railway.json` does not provision a volume; attach one in Railway.

Official references: [Using Volumes](https://docs.railway.com/volumes), [Volume reference](https://docs.railway.com/volumes/reference), [Services](https://docs.railway.com/services).

## Included learning features

- All **1,016 original cards** and stable IDs: nine learning worlds, everyday essentials/first 50, all 500 frequency words, and 126 sentence cards (63 casual/respectful pairs).
- React components for the studio, flashcards, vocabulary, sentences, grammar reference/drills, progress, Hindi Rush, learner selection, and scoreboard. No iframe, embedded HTML app, or runtime code evaluation.
- Original warm palette, with mobile bottom navigation, an expanded menu, touch-friendly buttons, readable Hindi, responsive cards, and horizontally scrollable reference tables.
- Flashcards: reveal, Again/Hard/Good/Easy, previous/next, keyboard controls, speech, due/new/weak decks, both FSRS-6 and SM-2 schedules, configurable recall target, and review scheduling from tests.
- Tests: Roman Hindi, Devanagari, English translation, multiple choice, close-answer credit, retry misses, and per-word results.
- Grammar: seven pronouns, ten tense/reference views, noun genders/plurals, respectful commands, the special “to like” construction, graded noun/verb drills, and answer reveal.
- Hindi Rush: four difficulties, word sources/categories, hand-picked words, Roman hints, English aliases, combos, levels, five lives, pause/resume, auto-pause, saved runs, and personal bests. Active mobile play uses a compact layout to leave room for the keyboard.
- Shared comparison: practiced/mastered cards, reviews, tests, accuracy, active days/streak, arcade bests, and a leaderboard filterable by difficulty/source. Hand-picked decks may differ, so those scores are informal comparisons.
- Personal progress: daily goal, topic mastery, review forecast, accuracy graph, recent tests, weak words, arcade history, and original JSON import/export with a browser-local pre-import backup.

Speech uses browser speech synthesis and available Hindi voices; support and quality vary by device.

## Importing your original progress

In the original HTML app, choose **Export progress**. In this app, choose the correct learner, then **My progress → Import JSON**. The old app’s localStorage cannot transfer automatically across origins. Imports replace that learner’s shared progress on every device. The restore-import backup is available in the browser that performed the import.

## How shared saves work

The browser sends small actions to the server. SQLite applies each action transactionally to the latest profile. Unique action IDs make retries safe; simultaneous devices add their work instead of overwriting the entire profile. Pending actions remain in that browser’s localStorage until saved. The server is the source of truth, enabling cross-device sync.

A first load needs a server connection. Interrupted saves queue after loading; this is not an installable offline/PWA app. Wait for **Saved to shared server** before switching learners. Imports/resets use version checks to reject replacement if another device has changed the profile.

There is intentionally **no authentication**: anyone with the URL can choose either name, edit progress, import, or reset. This follows the requested simple two-person setup. No API keys or secrets are required.

## Source layout

```text
src/main.jsx                   React screens, sync hook, arcade
src/original.css               Original styles
src/styles.css                 React/mobile refinements
shared/curriculum.json         Original vocabulary and grammar tables
shared/original-algorithms.js   FSRS-6, SM-2, conjugation, answer logic
shared/progress.js              Pure reducer shared by client and API
server/index.js                 API, transactions, SQLite, frontend serving
tests/                         Functional and persistence checks
Dockerfile / railway.json      Single-service deployment
```

Migrated from the supplied `Ghar_Hindi_Rush_Arcade.html`. Frequency positions remain curated learning order, not exact corpus ranks. Original references: [Wiktionary](https://en.wiktionary.org/wiki/Wiktionary:Frequency_lists/Hindi), [Lenguia](https://www.lenguia.com/tools/most-common-words/hindi), [FSRS](https://github.com/open-spaced-repetition/awesome-fsrs/wiki/The-Algorithm), [SM-2](https://super-memory.org/archive/english/ol/sm2.htm).
