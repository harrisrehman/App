import { clampCamera, fitCamera, type Camera } from "./game/camera";
import type { SendFilter } from "./game/types";
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
  document.querySelector("#score")?.remove();
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
  stripPlayDev();
  if (!hud.querySelector("#toast")) hud.appendChild(makeEl("div", "toast"));
  if (!hud.querySelector("#hint")) {
    const hint = makeEl("div", "hint", "Tap Gunners or Soldiers. Circle a group. Tap a target.");
    hud.appendChild(hint);
  }
  let shop = hud.querySelector("#shop");
  if (!shop) {
    shop = document.createElement("nav");
    shop.id = "shop";
    shop.className = "bottom";
    hud.appendChild(shop);
  }
  if (!hud.querySelector("#filters")) {
    const filters = document.createElement("nav");
    filters.id = "filters";
    filters.className = "side";
    const items: [SendFilter, string][] = [
      ["all", "All"],
      ["gunner", "Gunners"],
      ["troop", "Soldiers"],
    ];
    for (const [id, label] of items) {
      const btn = makeEl("button", undefined, label);
      btn.dataset.filter = id;
      if (id === "all") btn.classList.add("on");
      if (id === "gunner") paintGunnerFilter(btn);
      filters.appendChild(btn);
    }
    hud.appendChild(filters);
  }
  ensureFilterCounts();
  const gunnerBtn = document.querySelector<HTMLButtonElement>("#filters [data-filter='gunner']");
  if (gunnerBtn) paintGunnerFilter(gunnerBtn);
  if (!shop.querySelector("#defense-btn")) {
    const btn = makeEl("button", "defense-btn");
    const name = document.createElement("span");
    name.className = "shop-name";
    name.textContent = "Gunner";
    const cost = document.createElement("span");
    cost.className = "shop-cost";
    cost.textContent = "4";
    btn.append(name, cost);
    shop.appendChild(btn);
  }
  if (!document.querySelector("#error")) {
    const box = makeEl("div", "error");
    box.classList.add("hidden");
    const card = document.createElement("div");
    card.className = "error-card";
    card.append(makeEl("h2", undefined, "Can't wall there"), makeEl("p", "error-text"), makeEl("button", "error-ok", "OK"));
    box.appendChild(card);
    document.body.appendChild(box);
  }
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

function stripPlayDev(): void {
  document.querySelector("#dev-btn")?.remove();
  document.querySelector("#dev-panel")?.remove();
  const stack = document.querySelector(".action-stack");
  if (!stack) return;
  const parent = stack.parentElement;
  const update = stack.querySelector("#update-btn");
  if (parent && update) parent.appendChild(update);
  stack.remove();
}

function toggleDev(): void {
  document.querySelector("#menu-dev")?.classList.toggle("hidden");
  syncDevPanel();
}

function showError(text: string): void {
  const box = document.querySelector("#error");
  const msg = document.querySelector("#error-text");
  if (!box || !msg) return;
  msg.textContent = text;
  box.classList.remove("hidden");
}

function hideError(): void {
  document.querySelector("#error")?.classList.add("hidden");
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
  if (t.id === "error-ok") {
    e.preventDefault();
    e.stopImmediatePropagation();
    hideError();
    return;
  }
  if (t.id === "menu-dev-btn") {
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
  const filterKey = t.dataset.filter || t.dataset.count;
  if (filterKey) {
    e.preventDefault();
    e.stopImmediatePropagation();
    const game = window.__annexGame;
    if (!game || game.winner) return;
    const filter = filterKey as SendFilter;
    if (filter !== "all" && filter !== "gunner" && filter !== "troop") return;
    const n = game.applySendFilter(filter);
    syncFilterHud(game);
    if (filter === "gunner" && n === 0) showToast("No gunners yet.");
    else if (filter === "troop" && n === 0) showToast("No soldiers yet.");
    else if (filter === "gunner") showToast("Gunner tool. Circle a group, then a target.");
    else if (filter === "troop") showToast("Soldier tool. Circle a group, then a target.");
    else showToast("All tool. Circle a group, then a target.");
    return;
  }
  const bots = Number(t.dataset.bots || 0);
  if (bots >= 1 && bots <= 4) {
    e.preventDefault();
    e.stopImmediatePropagation();
    startMatch(bots);
  }
}

function paintGunnerFilter(btn: HTMLButtonElement): void {
  btn.classList.add("filter-gunner");
  btn.setAttribute("aria-label", "Gunners");
  btn.replaceChildren();
  const glyph = document.createElement("span");
  glyph.className = "gunner-glyph";
  glyph.setAttribute("aria-hidden", "true");
  const body = document.createElement("span");
  body.className = "gunner-body";
  const barrel = document.createElement("span");
  barrel.className = "gunner-barrel";
  glyph.append(body, barrel);
  const label = document.createElement("span");
  label.textContent = "Gunners";
  btn.append(glyph, label);
}

function ensureFilterCounts(): void {
  const filters = document.querySelector("#filters");
  if (!filters) return;
  for (const key of ["gunner", "troop"] as const) {
    const btn = filters.querySelector<HTMLButtonElement>(`[data-filter="${key}"]`);
    if (!btn) continue;
    let row = btn.closest(".filter-row");
    if (!row) {
      row = document.createElement("div");
      row.className = "filter-row";
      btn.replaceWith(row);
      row.appendChild(btn);
    }
    if (row.querySelector(`[data-count="${key}"]`)) continue;
    const count = makeEl("button", undefined, "0");
    count.className = "filter-count";
    count.dataset.count = key;
    count.tabIndex = -1;
    row.appendChild(count);
  }
}

function syncFilterHud(game: Game): void {
  for (const btn of document.querySelectorAll<HTMLButtonElement>("#filters [data-filter]:not(.filter-count)")) {
    btn.classList.toggle("on", btn.dataset.filter === game.sendFilter);
  }
  const gunners = document.querySelector<HTMLElement>("[data-count='gunner']");
  const troops = document.querySelector<HTMLElement>("[data-count='troop']");
  if (gunners) gunners.textContent = String(game.kindCount("player", "gunner"));
  if (troops) troops.textContent = String(game.kindCount("player", "troop"));
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
  document.addEventListener(
    "touchend",
    (e) => {
      const btn = (e.target as HTMLElement | null)?.closest("button");
      if (!btn?.dataset.filter && !btn?.dataset.count) return;
      e.preventDefault();
      window.__annexOnHudClick?.(e);
    },
    { capture: true, passive: false },
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
  document.querySelector("#menu-dev")?.classList.add("hidden");
}

function startMatch(bots: number): void {
  startGame(bots);
}

function startGame(bots = 1): void {
  window.__annexStop?.();
  ensureHud();

  const boardEl = document.querySelector<HTMLCanvasElement>("#game");
  const drawEl = boardEl?.getContext("2d");
  const updateEl = document.querySelector<HTMLButtonElement>("#update-btn");
  const wallEl = document.querySelector<HTMLButtonElement>("#wall-btn");
  const defenseEl = document.querySelector<HTMLButtonElement>("#defense-btn");
  const toastEl = document.querySelector("#toast");
  const overlayEl = document.querySelector("#overlay");
  const resultEl = document.querySelector("#result");
  const restartEl = document.querySelector<HTMLButtonElement>("#restart-btn");
  const versionEl = document.querySelector("#version");
  const hint = document.querySelector("#hint");

  if (!boardEl || !drawEl || !updateEl || !wallEl || !defenseEl || !toastEl || !overlayEl || !resultEl || !restartEl || !versionEl) {
    showMenu();
    document.body.insertAdjacentHTML("beforeend", "<p style='color:#fff;padding:16px'>Game failed to start.</p>");
    return;
  }

  document.body.classList.add("playing");
  document.body.classList.remove("menu");
  document.querySelector("#menu")?.classList.add("hidden");
  document.querySelector("#menu-dev")?.classList.add("hidden");
  stripPlayDev();

  const board = boardEl;
  const draw = drawEl;
  const update = updateEl;
  const wall = wallEl;
  const defense = defenseEl;
  const endScreen = overlayEl;
  const result = resultEl;
  const again = restartEl;
  const version = versionEl;

  const game = new Game(Date.now(), bots);
  window.__annexGame = game;
  const ais = BOTS.slice(0, game.bots).map((id) => new Commander(id));
  const cam: Camera = fitCamera(1, 1);
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
    const next = fitCamera(w, h);
    cam.width = next.width;
    cam.height = next.height;
    if (cam.scale <= 0.001) {
      cam.scale = next.scale;
      cam.ox = next.ox;
      cam.oy = next.oy;
    }
    clampCamera(cam);
  }

  function syncHud(): void {
    if (game.winner && !shownWinner) {
      shownWinner = true;
      result.textContent = game.winner === "player" ? "You win" : "You lose";
      endScreen.classList.remove("hidden");
    }
    defense.disabled = !game.canBuyDefense();
    syncFilterHud(game);
  }

  const hintTimer = window.setTimeout(() => {
    hint?.classList.add("gone");
  }, 4500);

  const onRestart = (): void => {
    game.restart(Date.now(), game.bots);
    for (const ai of ais) ai.reset();
    shownWinner = false;
    endScreen.classList.add("hidden");
    hideError();
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
    const mine = game.hasWallPick();
    if (!mine) {
      showToast("Select soldiers first.");
      return;
    }
    if (game.wallPickCount() < 1) {
      showToast("No soldiers to wall.");
      return;
    }
    game.wallMode = true;
    syncWall();
    showToast("Draw a wall line.");
  };

  const onDefense = (): void => {
    if (game.winner) return;
    const made = game.buyDefense();
    if (made > 0) {
      showToast(made === 1 ? "Gunner ready." : `${made} gunners ready.`);
    } else {
      showToast("Select a base with 4 soldiers.");
    }
    syncHud();
  };

  again.addEventListener("click", onRestart);
  wall.addEventListener("click", onWall);
  defense.addEventListener("click", onDefense);

  const unbind = bindInput(board, game, cam);
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
    const note = game.pullNotice();
    if (note) {
      if (note.startsWith("You can't")) showError(note);
      else showToast(note);
    }
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
    defense.removeEventListener("click", onDefense);
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
