# Annex

State.io-style mobile conquest game. One map. One AI. Touch only.

## Play on phone

1. Wait for **Android APK** workflow on this branch.
2. Download `annex-debug` artifact → `app-debug.apk`.
3. Install on Android. Allow unknown sources.
4. After new pushes, tap **Update** in game.

Live web build (same Update target):

https://harrisrehman.github.io/App/

Repo **Settings → Pages → Source** must be **GitHub Actions**.

## Controls

- Drag from your land to another land to send troops.
- **50% / ALL** sets send size.
- Blue is you. Red is AI. Gray is neutral.

## Dev

```bash
npm install
npm run dev
npm run cap:sync
```
