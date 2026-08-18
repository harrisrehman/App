import { clampCamera, fitCamera, type Camera } from "./game/camera";
import type { Difficulty, SendFilter } from "./game/types";
import { Commander } from "./game/ai";
import { Game } from "./game/engine";
import { BOTS } from "./game/types";
import { bindInput } from "./game/input";
import { render } from "./game/render";
import { bindTheme, themeToMatch, themeToMenu } from "./game/audio";
import { applyUpdate, consumeJustUpdated, localVersion, peekUpdate, restorePersisted } from "./game/update";
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
  document.querySelector("#hint")?.remove();
  let shop = hud.querySelector("#shop");
  if (!shop) {
    shop = document.createElement("nav");
    shop.id = "shop";
    shop.className = "bottom";
    hud.appendChild(shop);
  }
  let filters = document.querySelector<HTMLElement>("#filters");
  if (!filters) {
    filters = buildFilters();
    hud.appendChild(filters);
  } else {
    rebuildFilters(filters);
  }
  for (const extra of document.querySelectorAll("#filters")) {
    if (extra !== filters) extra.remove();
  }
  if (!shop.querySelector("#defense-btn")) {
    const btn = makeEl("button", "defense-btn");
    const name = document.createElement("span");
    name.className = "shop-name";
    name.textContent = "Gunner";
    const cost = document.createElement("span");
    cost.className = "shop-cost";
    cost.textContent = "6";
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
    menu.append(home, bots);
    document.body.appendChild(menu);
  }
  const menu = document.querySelector("#menu");
  document.querySelector("#menu-dev-btn")?.remove();
  document.querySelector("#menu-dev")?.remove();
  if (menu && !menu.querySelector("#menu-diff")) {
    const diff = makeEl("div", "menu-diff");
    diff.classList.add("hidden");
    diff.appendChild(makeEl("p", undefined, "Difficulty"));
    const picks = document.createElement("div");
    picks.className = "bot-picks";
    for (const [id, label] of [
      ["easy", "Easy"],
      ["medium", "Medium"],
      ["hard", "Hard"],
    ] as const) {
      const b = makeEl("button", undefined, label);
      b.dataset.diff = id;
      picks.appendChild(b);
    }
    diff.append(picks, makeEl("button", "menu-diff-back", "Back"));
    menu.appendChild(diff);
  }
  dressMenu();
}

function dressMenu(): void {
  const menu = document.querySelector("#menu");
  if (!menu) return;
  if (!menu.querySelector(".menu-veil")) {
    const veil = document.createElement("div");
    veil.className = "menu-veil";
    veil.setAttribute("aria-hidden", "true");
    menu.prepend(veil);
  }
  if (!menu.querySelector(".menu-stars")) {
    const stars = document.createElement("div");
    stars.className = "menu-stars";
    stars.setAttribute("aria-hidden", "true");
    menu.prepend(stars);
  }
  let frame = menu.querySelector(".menu-frame");
  if (!frame) {
    frame = document.createElement("div");
    frame.className = "menu-frame";
    const move = [...menu.children].filter(
      (el) => !el.classList.contains("menu-stars") && !el.classList.contains("menu-veil"),
    );
    for (const kid of move) frame.appendChild(kid);
    menu.appendChild(frame);
  }
  if (!frame.querySelector(".menu-mark")) {
    const mark = document.createElement("div");
    mark.className = "menu-mark";
    mark.setAttribute("aria-hidden", "true");
    const title = frame.querySelector("h1");
    if (title) title.before(mark);
    else frame.prepend(mark);
  }
  paintMenuMark(frame.querySelector(".menu-mark"));
  if (!frame.querySelector(".menu-kicker")) {
    const kicker = document.createElement("p");
    kicker.className = "menu-kicker";
    kicker.textContent = "Swords · Horses · Kingdoms";
    const title = frame.querySelector("h1");
    const mark = frame.querySelector(".menu-mark");
    if (title) title.before(kicker);
    else if (mark) mark.after(kicker);
    else frame.prepend(kicker);
  }
  const tag = frame.querySelector(".menu-tag") ?? document.createElement("p");
  tag.className = "menu-tag";
  tag.textContent = "Rise. Build. Conquer.";
  if (!tag.parentElement) {
    const title = frame.querySelector("h1");
    const ver = frame.querySelector("#menu-ver");
    if (title) title.after(tag);
    else if (ver) ver.before(tag);
    else frame.prepend(tag);
  }
}

function paintMenuMark(el: Element | null): void {
  if (!el) return;
  el.innerHTML = `<svg viewBox="0 0 80 80" fill="none">
    <circle cx="40" cy="40" r="37" stroke="#c5a15a" stroke-width="2"/>
    <circle cx="40" cy="40" r="31" fill="#f6ead0" stroke="#8a6a2f" stroke-width="1.4"/>
    <path d="M48 18a14 14 0 1 0 0 22 11 11 0 1 1 0-22z" fill="#3b2416"/>
    <path d="M40 34 42.4 41.2 50 42.2 42.4 43.6 40 51 37.6 43.6 30 42.2 37.6 41.2Z" fill="#c5a15a"/>
  </svg>`;
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
let pendingBots = 1;

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
  if (t.id === "menu-diff-back") {
    e.preventDefault();
    e.stopImmediatePropagation();
    showBotPick();
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
  const diff = t.dataset.diff;
  if (diff === "easy" || diff === "medium" || diff === "hard") {
    e.preventDefault();
    e.stopImmediatePropagation();
    startMatch(pendingBots, diff);
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
    game.applySendFilter(filter);
    syncFilterHud(game);
    return;
  }
  const bots = Number(t.dataset.bots || 0);
  if (bots >= 1 && bots <= 4) {
    e.preventDefault();
    e.stopImmediatePropagation();
    pendingBots = bots;
    showDiffPick();
  }
}

function makeFilterCount(key: "gunner" | "troop"): HTMLSpanElement {
  const count = document.createElement("span");
  count.className = "filter-count";
  count.dataset.count = key;
  count.textContent = "0";
  return count;
}

function buildFilters(): HTMLElement {
  const filters = document.createElement("nav");
  filters.id = "filters";
  filters.className = "side";

  const allRow = document.createElement("div");
  allRow.className = "filter-row";
  const allBtn = makeEl("button");
  allBtn.className = "filter-btn on";
  allBtn.dataset.filter = "all";
  paintFilterIcon(allBtn, "all");
  allRow.appendChild(allBtn);
  filters.appendChild(allRow);

  for (const key of ["gunner", "troop"] as const) {
    const row = document.createElement("div");
    row.className = "filter-row";
    const btn = makeEl("button");
    btn.className = "filter-btn";
    btn.dataset.filter = key;
    paintFilterIcon(btn, key);
    row.append(btn, makeFilterCount(key));
    filters.appendChild(row);
  }
  return filters;
}

function rebuildFilters(filters: HTMLElement): void {
  const gunnerCount = filters.querySelector(`[data-count="gunner"]`);
  const troopCount = filters.querySelector(`[data-count="troop"]`);
  filters.className = "side";
  filters.replaceChildren();

  const allRow = document.createElement("div");
  allRow.className = "filter-row";
  const allBtn = makeEl("button");
  allBtn.className = "filter-btn";
  allBtn.dataset.filter = "all";
  paintFilterIcon(allBtn, "all");
  allRow.appendChild(allBtn);
  filters.appendChild(allRow);

  for (const [key, saved] of [
    ["gunner", gunnerCount],
    ["troop", troopCount],
  ] as const) {
    const row = document.createElement("div");
    row.className = "filter-row";
    const btn = makeEl("button");
    btn.className = "filter-btn";
    btn.dataset.filter = key;
    paintFilterIcon(btn, key);
    row.append(btn, saved ?? makeFilterCount(key));
    filters.appendChild(row);
  }
}

function paintFilterIcon(btn: HTMLButtonElement, kind: SendFilter): void {
  btn.classList.add("filter-btn");
  if (kind === "gunner") {
    paintGunnerFilter(btn);
    return;
  }
  btn.classList.remove("filter-gunner");
  if (kind === "all") {
    btn.setAttribute("aria-label", "All");
    btn.textContent = "All";
    return;
  }
  btn.setAttribute("aria-label", "Soldiers");
  btn.replaceChildren();
  const dot = document.createElement("span");
  dot.className = "soldier-dot";
  dot.setAttribute("aria-hidden", "true");
  btn.append(dot);
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
  btn.append(glyph);
}

function syncFilterHud(game: Game): void {
  const filters = document.querySelector("#filters");
  filters?.setAttribute("data-mode", game.sendFilter);
  for (const btn of document.querySelectorAll<HTMLButtonElement>("#filters button")) {
    const key = btn.dataset.filter;
    const on = key === game.sendFilter;
    btn.classList.toggle("on", on);
    btn.setAttribute("aria-pressed", on ? "true" : "false");
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
  const onFilter = (e: Event): void => {
    const btn = (e.target as HTMLElement | null)?.closest("button");
    if (!btn?.dataset.filter && !btn?.dataset.count) return;
    e.preventDefault();
    e.stopPropagation();
    window.__annexOnHudClick?.(e);
  };
  document.addEventListener(
    "click",
    (e) => {
      window.__annexOnHudClick?.(e);
    },
    true,
  );
  document.addEventListener("pointerdown", onFilter, true);
  document.addEventListener("touchstart", onFilter, { capture: true, passive: false });
  document.addEventListener("touchend", onFilter, { capture: true, passive: false });
}

function showMenu(): void {
  window.__annexStop?.();
  document.body.classList.add("menu");
  document.body.classList.remove("playing");
  document.querySelector("#menu")?.classList.remove("hidden");
  document.querySelector("#overlay")?.classList.add("hidden");
  showMenuHome();
  themeToMenu();
}

function showMenuHome(): void {
  document.querySelector("#menu-home")?.classList.remove("hidden");
  document.querySelector("#menu-bots")?.classList.add("hidden");
  document.querySelector("#menu-diff")?.classList.add("hidden");
}

function showBotPick(): void {
  document.querySelector("#menu-home")?.classList.add("hidden");
  document.querySelector("#menu-bots")?.classList.remove("hidden");
  document.querySelector("#menu-diff")?.classList.add("hidden");
}

function showDiffPick(): void {
  document.querySelector("#menu-home")?.classList.add("hidden");
  document.querySelector("#menu-bots")?.classList.add("hidden");
  document.querySelector("#menu-diff")?.classList.remove("hidden");
}

function startMatch(bots: number, difficulty: Difficulty): void {
  startGame(bots, difficulty);
}

function startGame(bots = 1, difficulty: Difficulty = "medium"): void {
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

  if (!boardEl || !drawEl || !updateEl || !wallEl || !defenseEl || !toastEl || !overlayEl || !resultEl || !restartEl || !versionEl) {
    showMenu();
    document.body.insertAdjacentHTML("beforeend", "<p style='color:#fff;padding:16px'>Game failed to start.</p>");
    return;
  }

  document.body.classList.add("playing");
  document.body.classList.remove("menu");
  document.querySelector("#menu")?.classList.add("hidden");
  themeToMatch();
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

  const game = new Game(Date.now(), bots, difficulty);
  window.__annexGame = game;
  const ais = BOTS.slice(0, game.bots).map((id) => new Commander(id));
  const cam: Camera = fitCamera(1, 1);
  let shownWinner = false;
  let alive = true;
  let snapFullMap = true;

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
    if (snapFullMap) {
      cam.scale = next.scale;
      cam.ox = next.ox;
      cam.oy = next.oy;
      snapFullMap = false;
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

  const onRestart = (): void => {
    game.restart(Date.now(), game.bots);
    for (const ai of ais) ai.reset();
    shownWinner = false;
    endScreen.classList.add("hidden");
    hideError();
    snapFullMap = true;
    resize();
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
      showToast("Select a base with 6 soldiers.");
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
    dropStalePersist();
    if (restorePersisted()) return;
    ensureHud();
    bindHudClicks();
    bindTheme();
    const note = consumeJustUpdated();
    if (note) showToast(`Updated to v${note}`);
    const ver = document.querySelector("#menu-ver");
    if (ver) ver.textContent = `v${localVersion().version}`;
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
