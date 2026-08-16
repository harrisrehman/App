import { fitCamera, type Camera } from "./game/camera";
import { Commander } from "./game/ai";
import { Game } from "./game/engine";
import { BOTS } from "./game/types";
import { bindInput } from "./game/input";
import { render } from "./game/render";
import { nudgeRule, rules, type Rules } from "./game/config";
import { applyUpdate, localVersion, peekUpdate, restorePersisted } from "./game/update";
import { dropStalePersist, loadBundledVersion } from "./version";

declare global {
  interface Window {
    __annexStop?: () => void;
    __annexJustUpdated?: string;
    __annexRestored?: boolean;
    __annexHudBound?: boolean;
    __annexOnHudClick?: (e: Event) => void;
    __annexGame?: Game;
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
  if (!actions.querySelector("#dev-btn")) {
    let stack = actions.querySelector(".action-stack");
    if (!stack) {
      stack = document.createElement("div");
      stack.className = "action-stack";
      const update = actions.querySelector("#update-btn");
      if (update) stack.appendChild(update);
      actions.appendChild(stack);
    }
    stack.appendChild(makeEl("button", "dev-btn", "Dev"));
  }
  if (!hud.querySelector("#dev-panel")) hud.appendChild(makeDevPanel("dev-panel"));
  if (!hud.querySelector("#toast")) hud.appendChild(makeEl("div", "toast"));
  if (!hud.querySelector("#hint")) hud.appendChild(makeEl("div", "hint"));
  if (!document.querySelector("#overlay")) {
    const overlay = makeEl("div", "overlay");
    overlay.classList.add("hidden");
    const actions = document.createElement("div");
    actions.className = "end-actions";
    actions.append(makeEl("button", "restart-btn", "Again"), makeEl("button", "menu-btn", "Menu"));
    overlay.append(makeEl("h1", "result"), actions);
    document.body.appendChild(overlay);
  } else {
    const overlay = document.querySelector("#overlay");
    if (overlay && !overlay.querySelector("#menu-btn")) {
      let actions = overlay.querySelector(".end-actions");
      if (!actions) {
        actions = document.createElement("div");
        actions.className = "end-actions";
        const again = overlay.querySelector("#restart-btn");
        if (again) actions.appendChild(again);
        overlay.appendChild(actions);
      }
      actions.appendChild(makeEl("button", "menu-btn", "Menu"));
    }
  }
  if (!document.querySelector("#menu")) {
    const menu = makeEl("div", "menu");
    menu.append(makeEl("h1", undefined, "ANNEX"), makeEl("p", "menu-ver", "v"));
    const home = makeEl("div", "menu-home");
    home.append(makeEl("button", "start-btn", "Start"), makeEl("button", "menu-update-btn", "Update"));
    const bots = makeEl("div", "menu-bots");
    bots.classList.add("hidden");
    bots.appendChild(makeEl("p", undefined, "How many bots?"));
    const picks = document.createElement("div");
    picks.className = "bot-picks";
    for (let i = 1; i <= 4; i++) {
      const b = makeEl("button", undefined, String(i));
      b.dataset.bots = String(i);
      picks.appendChild(b);
    }
    bots.append(picks, makeEl("button", "menu-back", "Back"));
    if (!home.querySelector("#menu-dev-btn")) home.appendChild(makeEl("button", "menu-dev-btn", "Dev"));
    menu.append(home, bots);
    document.body.appendChild(menu);
  }
  const menu = document.querySelector("#menu");
  if (menu && !menu.querySelector("#menu-dev-btn")) {
    (menu.querySelector("#menu-home") ?? menu).appendChild(makeEl("button", "menu-dev-btn", "Dev"));
  }
  if (menu && !menu.querySelector("#menu-dev")) menu.appendChild(makeDevPanel("menu-dev"));
  syncDevPanel();
}

function makeDevPanel(id: string): HTMLDivElement {
  const panel = makeEl("div", id);
  panel.classList.add("hidden");
  const rows: [string, keyof Rules, number][] = [
    ["Base health", "baseHealth", 1],
    ["Soldier health", "soldierHealth", 1],
  ];
  for (const [label, key, step] of rows) {
    const row = document.createElement("div");
    row.className = "dev-row";
    const minus = makeEl("button", undefined, "-");
    minus.dataset.rule = key;
    minus.dataset.delta = String(-step);
    const plus = makeEl("button", undefined, "+");
    plus.dataset.rule = key;
    plus.dataset.delta = String(step);
    const val = document.createElement("span");
    val.dataset.ruleValue = key;
    val.textContent = String(rules[key]);
    row.append(makeEl("span", undefined, label), minus, val, plus);
    panel.appendChild(row);
  }
  return panel;
}

function syncDevPanel(): void {
  for (const el of document.querySelectorAll<HTMLElement>("[data-rule-value]")) {
    const key = el.dataset.ruleValue as keyof Rules | undefined;
    if (key && key in rules) el.textContent = String(rules[key]);
  }
}

function toggleDev(): void {
  document.querySelector("#dev-panel")?.classList.toggle("hidden");
  document.querySelector("#menu-dev")?.classList.toggle("hidden");
  syncDevPanel();
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
  const buttons = [...document.querySelectorAll<HTMLButtonElement>("#update-btn, #menu-update-btn")];
  for (const btn of buttons) {
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
    for (const btn of document.querySelectorAll<HTMLButtonElement>("#update-btn, #menu-update-btn")) {
      btn.disabled = false;
      btn.textContent = "Update";
    }
  }
}

function onHudClick(e: Event): void {
  const t = (e.target as HTMLElement | null)?.closest("button");
  if (!t) return;
  if (t.id === "update-btn" || t.id === "menu-update-btn") {
    e.preventDefault();
    e.stopImmediatePropagation();
    void runUpdate();
    return;
  }
  if (t.id === "start-btn") {
    e.preventDefault();
    e.stopImmediatePropagation();
    showBotPick();
    return;
  }
  if (t.id === "menu-back") {
    e.preventDefault();
    e.stopImmediatePropagation();
    showMenuHome();
    return;
  }
  if (t.id === "menu-btn") {
    e.preventDefault();
    e.stopImmediatePropagation();
    showMenu();
    return;
  }
  if (t.id === "dev-btn" || t.id === "menu-dev-btn") {
    e.preventDefault();
    e.stopImmediatePropagation();
    toggleDev();
    return;
  }
  if (t.dataset.rule) {
    e.preventDefault();
    e.stopImmediatePropagation();
    nudgeRule(t.dataset.rule as keyof Rules, Number(t.dataset.delta || 0));
    syncDevPanel();
    window.__annexGame?.applyRules();
    return;
  }
  const bots = Number(t.dataset.bots || 0);
  if (bots >= 1 && bots <= 4) {
    e.preventDefault();
    e.stopImmediatePropagation();
    startMatch(bots);
  }
}

function bindHudClicks(): void {
  window.__annexOnHudClick = onHudClick;
  if (window.__annexHudBound) return;
  window.__annexHudBound = true;
  document.addEventListener(
    "click",
    (e) => {
      window.__annexOnHudClick?.(e);
    },
    true,
  );
}

function showMenu(): void {
  window.__annexStop?.();
  document.body.classList.add("menu");
  document.body.classList.remove("playing");
  document.querySelector("#menu")?.classList.remove("hidden");
  document.querySelector("#overlay")?.classList.add("hidden");
  showMenuHome();
}

function showMenuHome(): void {
  document.querySelector("#menu-home")?.classList.remove("hidden");
  document.querySelector("#menu-bots")?.classList.add("hidden");
}

function showBotPick(): void {
  document.querySelector("#menu-home")?.classList.add("hidden");
  document.querySelector("#menu-bots")?.classList.remove("hidden");
}

function startMatch(bots: number): void {
  startGame(bots);
}

function startGame(bots = 1): void {
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
    showMenu();
    document.body.insertAdjacentHTML("beforeend", "<p style='color:#fff;padding:16px'>Game failed to start.</p>");
    return;
  }

  document.body.classList.add("playing");
  document.body.classList.remove("menu");
  document.querySelector("#menu")?.classList.add("hidden");

  const board = boardEl;
  const draw = drawEl;
  const score = scoreEl;
  const update = updateEl;
  const wall = wallEl;
  const endScreen = overlayEl;
  const result = resultEl;
  const again = restartEl;
  const version = versionEl;

  const game = new Game(Date.now(), bots);
  window.__annexGame = game;
  const ais = BOTS.slice(0, game.bots).map((id) => new Commander(id));
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
    score.textContent = [totals.player, ...totals.bots].map((n) => Math.floor(n)).join(" · ");
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
    game.restart(Date.now(), game.bots);
    for (const ai of ais) {
      ai.wait = 1.8;
      ai.lastTarget = -1;
      ai.repeats = 0;
    }
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
    for (const ai of ais) ai.tick(game, dt);
    render(draw, game, cam);
    syncHud();
    syncWall();
    requestAnimationFrame(loop);
  }

  window.__annexStop = () => {
    alive = false;
    if (window.__annexGame === game) window.__annexGame = undefined;
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
    const ver = document.querySelector("#menu-ver");
    if (ver) ver.textContent = `v${localVersion().version}`;
    restorePersisted();
    if (!document.body.classList.contains("playing")) showMenu();
  } catch {
    showMenu();
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", boot, { once: true });
} else {
  boot();
}
