import { clampCamera, fitCamera, type Camera } from "./game/camera";
import type { Difficulty, SendFilter } from "./game/types";
import { Commander } from "./game/ai";
import { Game } from "./game/engine";
import { BOTS } from "./game/types";
import { bindInput } from "./game/input";
import { render } from "./game/render";
import { bindTheme, themeToMatch, themeToMenu } from "./game/audio";
import { localVersion } from "./game/update";
import { clearLegacyOtaCache } from "./version";

declare global {
  interface Window {
    __annexStop?: () => void;
    __annexJustUpdated?: string;
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
  document.querySelector("#update-btn")?.remove();
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
    home.append(makeEl("button", "start-btn", "Start"));
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
  document.querySelector("#menu-update-btn")?.remove();
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
  if (!frame.querySelector(".menu-border")) {
    const border = document.createElement("div");
    border.className = "menu-border";
    border.setAttribute("aria-hidden", "true");
    frame.prepend(border);
  }
  paintMenuBorder(frame.querySelector(".menu-border"));
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

function paintMenuBorder(el: Element | null): void {
  if (!el) return;
  el.innerHTML = `<svg viewBox="0 0 340 420" preserveAspectRatio="none" aria-hidden="true">
    <defs>
      <linearGradient id="menu-gold" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#f3e2b3"/>
        <stop offset="45%" stop-color="#c5a15a"/>
        <stop offset="100%" stop-color="#8a6a2f"/>
      </linearGradient>
    </defs>
    <rect x="10" y="10" width="320" height="400" rx="2" fill="none" stroke="url(#menu-gold)" stroke-width="2.2"/>
    <rect x="16" y="16" width="308" height="388" rx="1" fill="none" stroke="#8a6a2f" stroke-width="0.9" opacity="0.75"/>
    <path d="M22 78 C22 42 42 22 78 22 H262 C298 22 318 42 318 78 V342 C318 378 298 398 262 398 H78 C42 398 22 378 22 342 Z" fill="none" stroke="#c5a15a" stroke-width="0.8" opacity="0.45"/>
    <g fill="none" stroke="#c5a15a" stroke-linecap="round" stroke-linejoin="round">
      <path stroke-width="1.6" d="M16 88 C16 52 52 16 88 16"/>
      <path stroke-width="1.1" d="M16 72 C30 34 58 16 96 16"/>
      <path stroke-width="1.1" d="M32 16 C18 30 16 48 16 66"/>
      <path stroke-width="1.2" d="M52 24 C44 20 36 24 36 34 C36 44 48 46 54 38 C60 30 50 28 46 32"/>
      <path stroke-width="1.6" d="M324 88 C324 52 288 16 252 16"/>
      <path stroke-width="1.1" d="M324 72 C310 34 282 16 244 16"/>
      <path stroke-width="1.1" d="M308 16 C322 30 324 48 324 66"/>
      <path stroke-width="1.2" d="M288 24 C296 20 304 24 304 34 C304 44 292 46 286 38 C280 30 290 28 294 32"/>
      <path stroke-width="1.6" d="M16 332 C16 368 52 404 88 404"/>
      <path stroke-width="1.1" d="M16 348 C30 386 58 404 96 404"/>
      <path stroke-width="1.1" d="M32 404 C18 390 16 372 16 354"/>
      <path stroke-width="1.2" d="M52 396 C44 400 36 396 36 386 C36 376 48 374 54 382 C60 390 50 392 46 388"/>
      <path stroke-width="1.6" d="M324 332 C324 368 288 404 252 404"/>
      <path stroke-width="1.1" d="M324 348 C310 386 282 404 244 404"/>
      <path stroke-width="1.1" d="M308 404 C322 390 324 372 324 354"/>
      <path stroke-width="1.2" d="M288 396 C296 400 304 396 304 386 C304 376 292 374 286 382 C280 390 290 392 294 388"/>
    </g>
    <g fill="#c5a15a" stroke="#8a6a2f" stroke-width="0.6">
      <path d="M170 8 l5 15 15 5 -15 5 -5 15 -5 -15 -15 -5 15 -5z"/>
      <path d="M170 412 l5 15 15 5 -15 5 -5 15 -5 -15 -15 -5 15 -5z" opacity="0.85"/>
      <path d="M8 210 l5 15 15 5 -15 5 -5 15 -5 -15 -15 -5 15 -5z" opacity="0.85"/>
      <path d="M332 210 l5 15 15 5 -15 5 -5 15 -5 -15 -15 -5 15 -5z" opacity="0.85"/>
    </g>
    <g fill="none" stroke="#b68a22" stroke-width="1">
      <path d="M58 14 C92 14 118 12 142 16 C166 20 188 12 212 16 C236 20 258 12 282 16"/>
      <path d="M58 406 C92 406 118 408 142 404 C166 400 188 408 212 404 C236 400 258 408 282 404"/>
      <path d="M14 58 C14 92 12 118 16 142 C20 166 12 188 16 212 C20 236 12 258 16 282"/>
      <path d="M326 58 C326 92 328 118 324 142 C320 166 328 188 324 212 C320 236 328 258 324 282"/>
    </g>
    <g fill="none" stroke="#c5a15a" stroke-width="0.9" opacity="0.9">
      <path d="M74 14 C86 18 98 10 110 14 C122 18 134 10 146 14"/>
      <path d="M194 14 C206 18 218 10 230 14 C242 18 254 10 266 14"/>
      <path d="M74 406 C86 402 98 410 110 406 C122 402 134 410 146 406"/>
      <path d="M194 406 C206 402 218 410 230 406 C242 402 254 410 266 406"/>
    </g>
  </svg>`;
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
  document.querySelector("#update-btn")?.remove();
  const stack = document.querySelector(".action-stack");
  if (!stack) return;
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

let pendingBots = 1;

function onHudClick(e: Event): void {
  const t = (e.target as HTMLElement | null)?.closest("button");
  if (!t) return;
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
  const wallEl = document.querySelector<HTMLButtonElement>("#wall-btn");
  const defenseEl = document.querySelector<HTMLButtonElement>("#defense-btn");
  const toastEl = document.querySelector("#toast");
  const overlayEl = document.querySelector("#overlay");
  const resultEl = document.querySelector("#result");
  const restartEl = document.querySelector<HTMLButtonElement>("#restart-btn");
  const versionEl = document.querySelector("#version");

  if (!boardEl || !drawEl || !wallEl || !defenseEl || !toastEl || !overlayEl || !resultEl || !restartEl || !versionEl) {
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
    clearLegacyOtaCache();
    ensureHud();
    bindHudClicks();
    bindTheme();
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
