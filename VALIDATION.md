# Validation

- `npm run build`: passed; Vite produces production React bundles.
- `npm test`: 5/5 checks passed, covering the 1,016-card curriculum, register pairs, original grammar and grading, both schedulers, progress imports, API user isolation, retry deduplication, concurrent-client updates, version conflicts, and persistence after a local server restart.
- Browser checks: desktop 1280px, mobile 390px and 320px; learner selector, studio, flashcard reveal/rating, 63-card respectful sentence deck, multiple-choice quiz completion (10 questions), conjugation reference, Rush hand-picked words, an arcade hit, pause, run save, and shared learning/arcade scoreboard.
- Phone viewports had no document-level horizontal overflow. Wide tables scroll inside their panels. Active Rush uses a compact layout to allow space for an on-screen keyboard. A physical phone/keyboard was not directly tested.
- Deployed Docker build and `/api/health`: passed on Railway.
- Railway has one replica in `us-west2`, with a live 512 MB `ghar-progress` volume mounted at `/data`; database path is `/data/ghar.sqlite`. No learning databases or secrets are tracked by Git.

Browser QA scores are confined to a temporary local database. Production persistence verification changes only a reversible profile preference and then restores it.
