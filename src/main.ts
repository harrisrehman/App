import { fitCamera, type Camera } from "./game/camera";
import { Commander } from "./game/ai";
import { Game } from "./game/engine";
import { bindInput } from "./game/input";
import { render } from "./game/render";
import { applyUpdate, localVersion, peekUpdate, restorePersisted } from "./game/update";
import { dropStalePersist, loadBundledVersion } from "./version";

declare global {
  interface Window {
    __annexStop?: () => void;
    __annexJustUpdated?: string;
    __annexRestored?: boolean;
    __annexHudBound?: boolean;
  }
}

function makeEl<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  id?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (id) el.id = id;
  if (text) el.textContent = text;
  if (tag === "button") el.setAttribute("type", "button");
  return el;
}

function ensureHud(): void {
  if (!document.querySelector("#game")) {
    document.body.prepend(makeEl("canvas", "game"));
  }
  let hud = document.querySelector("#hud");
  if (!hud) {
    hud = makeEl("div", "hud");
    document.body.appendChild(hud);
  }
  let top = hud.querySelector(".top");
  if (!top) {
    top = document.createElement("div");
    top.className = "top";
    hud.prepend(top);
  }
  if (!top.querySelector("#title")) {
    const brand = document.createElement("div");
    brand.className = "brand";
    brand.append(makeEl("span", "title", "ANNEX"), makeEl("span", "version", "v"));
    top.prepend(brand);
  }
  if (!top.querySelector("#version")) {
    (top.querySelector(".brand") ?? top).appendChild(makeEl("span", "version", "v"));
  }
  if (!top.querySelector("#score")) {
    const brand = top.querySelector(".brand");
    if (brand) brand.appendChild(makeEl("span", "score", "0 · 0"));
    else top.appendChild(makeEl("span", "score", "0 · 0"));
  }
  let actions = top.querySelector(".actions");
  if (!actions) {
    actions = document.createElement("div");
    actions.className = "actions";
    top.appendChild(actions);
  }
  if (!actions.querySelector("#wall-btn")) {
    actions.appendChild(makeEl("button", "wall-btn", "Wall")).setAttribute("type", "button");
  }
  if (!actions.querySelector("#update-btn")) {
    actions.appendChild(makeEl("button", "update-btn", "Update")).setAttribute("type", "button");
  }
  if (!hud.querySelector("#toast")) hud.appendChild(makeEl("div", "toast"));
  if (!hud.querySelector("#hint")) hud.appendChild(makeEl("div", "hint"));
  if (!document.querySelector("#overlay")) {
    const overlay = makeEl("div", "overlay");
    overlay.classList.add("hidden");
    overlay.append(makeEl("h1", "result"), makeEl("button", "restart-btn", "Again"));
    document.body.appendChild(overlay);
  }
}

function showToast(text: string): void {
  const box = document.querySelector("#toast");
  if (!box) return;
  box.textContent = text;
  box.classList.add("show");
  window.setTimeout(() => box.classList.remove("show"), 2200);
}

let updateBusy = false;

async function runUpdate(): Promise<void> {
  if (updateBusy) return;
  updateBusy = true;
  const btn = document.querySelector<HTMLButtonElement>("#update-btn");
  if (btn) {
    btn.disabled = true;
    btn.textContent = "…";
  }
  try {
    const state = await applyUpdate();
    if (state === "offline") showToast("Update failed. Try again.");
    if (state === "latest") showToast("Already latest.");
    if (state === "ready") showToast(`Updated to v${localVersion().version}`);
  } catch {
    showToast("Update failed. Try again.");
  } finally {
    updateBusy = false;
    const again = document.querySelector<HTMLButtonElement>("#update-btn");
    if (again) {
      again.disabled = false;
      again.textContent = "Update";
    }
  }
}

function bindHudClicks(): void {
  if (window.__annexHudBound) return;
  window.__annexHudBound = true;
  document.addEventListener("click", (e) => {
    const t = (e.target as HTMLElement | null)?.closest("button");
    if (!t) return;
    if (t.id === "update-btn") {
      e.preventDefault();
      void runUpdate();
    }
  });
}

function startGame(): void {
  window.__annexStop?.();
  ensureHud();

  const boardEl = document.querySelector<HTMLCanvasElement>("#game");
  const drawEl = boardEl?.getContext("2d");
  const scoreEl = document.querySelector("#score");
  const updateEl = document.querySelector<HTMLButtonElement>("#update-btn");
  const wallEl = document.querySelector<HTMLButtonElement>("#wall-btn");
  const toastEl = document.querySelector("#toast");
  const overlayEl = document.querySelector("#overlay");
  const resultEl = document.querySelector("#result");
  const restartEl = document.querySelector<HTMLButtonElement>("#restart-btn");
  const versionEl = document.querySelector("#version");
  const hint = document.querySelector("#hint");

  if (!boardEl || !drawEl || !scoreEl || !updateEl || !wallEl || !toastEl || !overlayEl || !resultEl || !restartEl || !versionEl) {
    document.body.insertAdjacentHTML("beforeend", "<p style='color:#fff;padding:16px'>Game failed to start.</p>");
    return;
  }

  const board = boardEl;
  const draw = drawEl;
  const score = scoreEl;
  const update = updateEl;
  const wall = wallEl;
  const endScreen = overlayEl;
  const result = resultEl;
  const again = restartEl;
  const version = versionEl;

  const game = new Game();
  const ai = new Commander();
  let cam: Camera = fitCamera(1, 1);
  let shownWinner = false;
  let alive = true;

  function resize(): void {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = window.innerWidth;
    const h = window.innerHeight;
    board.width = Math.floor(w * dpr);
    board.height = Math.floor(h * dpr);
    board.style.width = `${w}px`;
    board.style.height = `${h}px`;
    draw.setTransform(dpr, 0, 0, dpr, 0, 0);
    cam = fitCamera(w, h);
  }

  function syncHud(): void {
    const totals = game.totals();
    score.textContent = `${Math.floor(totals.player)} · ${Math.floor(totals.ai)}`;
    if (game.winner && !shownWinner) {
      shownWinner = true;
      result.textContent = game.winner === "player" ? "You win" : "You lose";
      endScreen.classList.remove("hidden");
    }
  }

  const hintTimer = window.setTimeout(() => {
    hint?.classList.add("gone");
  }, 4500);

  const onRestart = (): void => {
    game.restart();
    ai.wait = 1.8;
    ai.lastTarget = -1;
    ai.repeats = 0;
    shownWinner = false;
    endScreen.classList.add("hidden");
  };

  const syncWall = (): void => {
    wall.classList.toggle("on", game.wallMode);
  };

  const onWall = (): void => {
    if (game.winner) return;
    if (game.wallMode) {
      game.wallMode = false;
      game.endStroke();
      syncWall();
      showToast("Wall canceled.");
      return;
    }
    const mine = [...game.selected].some((id) => game.territories[id]?.owner === "player");
    if (!mine) {
      showToast("Select a base first.");
      return;
    }
    const troops = [...game.selected].reduce((n, id) => n + game.garrison(id).length, 0);
    if (troops < 1) {
      showToast("No soldiers to wall.");
      return;
    }
    game.wallMode = true;
    syncWall();
    showToast("Draw a wall line.");
  };

  again.addEventListener("click", onRestart);
  wall.addEventListener("click", onWall);

  const unbind = bindInput(board, game, () => cam);
  window.addEventListener("resize", resize);
  resize();

  version.textContent = `v${localVersion().version}`;
  if (window.__annexJustUpdated) {
    showToast(`Updated to v${window.__annexJustUpdated}`);
    window.__annexJustUpdated = undefined;
  }
  void loadBundledVersion().then((ver) => {
    if (!alive) return;
    version.textContent = `v${ver.version}`;
    return peekUpdate();
  }).then((newer) => {
    if (alive && newer) update.classList.add("badge");
  });

  let last = performance.now();
  function loop(now: number): void {
    if (!alive) return;
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    game.update(dt);
    ai.tick(game, dt);
    render(draw, game, cam);
    syncHud();
    syncWall();
    requestAnimationFrame(loop);
  }

  window.__annexStop = () => {
    alive = false;
    window.clearTimeout(hintTimer);
    unbind();
    window.removeEventListener("resize", resize);
    again.removeEventListener("click", onRestart);
    wall.removeEventListener("click", onWall);
  };

  requestAnimationFrame(loop);
}

function boot(): void {
  try {
    ensureHud();
    bindHudClicks();
    dropStalePersist();
    if (restorePersisted()) return;
    startGame();
  } catch {
    document.body.insertAdjacentHTML("beforeend", "<p style='color:#fff;padding:16px'>Game failed to start.</p>");
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", boot, { once: true });
} else {
  boot();
}
