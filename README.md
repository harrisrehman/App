# Annex

State.io-style mobile conquest game. TypeScript + Vite + Capacitor Android.

**Repo:** https://github.com/harrisrehman/App  
**Branch:** `main` (edit here — any Cursor chat should pull/push `main`)

## Edit from any Cursor chat

1. Clone or open: `https://github.com/harrisrehman/App`
2. `git pull origin main`
3. Edit `src/`, `index.html`, `src/style.css`
4. Bump version in `package.json`, then:

```bash
npm install
npm test
npm run build
git add -A
git commit -m "your change"
git push origin main
```

5. On phone (installed app): tap **Update**

Project rules for agents live in `.cursor/rules/annex.mdc`.

## Install on phone

APK (reinstall once after switching to `main` updates):

https://github.com/harrisrehman/App/raw/main/downloads/annex.apk

Install page:

https://raw.githack.com/harrisrehman/App/main/downloads/install.html

Browser (no install):

https://raw.githack.com/harrisrehman/App/main/dist/

## Dev on computer

```bash
npm install
npm run dev              # local + LAN browser test
npm run cap:sync         # build + sync Android project
npx cap run android -l --forwardPorts   # live reload in app via USB
```

## Controls

- Drag from your land to send troops
- Filters (bottom-left): All / Gunners / Soldiers
- **Wall** / **Gunner** shop buttons
- Menu: bot count + Easy / Medium / Hard

## Version / Update

In-app **Update** pulls `dist/` from GitHub `main`. You must bump `package.json` version and run `npm run build` before each push you want the phone to pick up.
