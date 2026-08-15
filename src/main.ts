import { fitCamera, type Camera } from "./game/camera";
import { Commander } from "./game/ai";
import { Game } from "./game/engine";
import { bindInput } from "./game/input";
import { render } from "./game/render";
import { applyUpdate, localVersion, peekUpdate } from "./game/update";
import { loadBundledVersion } from "./version";

const canvas = document.querySelector<HTMLCanvasElement>("#game")!;
const ctx = canvas.getContext("2d")!;
const scoreEl = document.querySelector("#score")!;
const ratioBtn = document.querySelector<HTMLButtonElement>("#ratio-btn")!;
const updateBtn = document.querySelector<HTMLButtonElement>("#update-btn")!;
const toastEl = document.querySelector("#toast")!;
const overlay = document.querySelector("#overlay")!;
const resultEl = document.querySelector("#result")!;
const restartBtn = document.querySelector<HTMLButtonElement>("#restart-btn")!;
const versionEl = document.querySelector("#version")!;
const hintEl = document.querySelector("#hint")!;

const game = new Game();
const ai = new Commander();
let cam: Camera = fitCamera(1, 1);
let shownWinner = false;

function resize(): void {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = window.innerWidth;
  const h = window.innerHeight;
  canvas.width = Math.floor(w * dpr);
  canvas.height = Math.floor(h * dpr);
  canvas.style.width = `${w}px`;
  canvas.style.height = `${h}px`;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  cam = fitCamera(w, h);
}

function toast(text: string): void {
  toastEl.textContent = text;
  toastEl.classList.add("show");
  window.setTimeout(() => toastEl.classList.remove("show"), 2200);
}

function syncHud(): void {
  const totals = game.totals();
  scoreEl.textContent = `${Math.floor(totals.player)} · ${Math.floor(totals.ai)}`;
  ratioBtn.textContent = game.sendRatio === 1 ? "ALL" : "50%";
  if (game.winner && !shownWinner) {
    shownWinner = true;
    resultEl.textContent = game.winner === "player" ? "You win" : "You lose";
    overlay.classList.remove("hidden");
  }
}

window.setTimeout(() => {
  hintEl.classList.add("gone");
}, 4500);

ratioBtn.addEventListener("click", () => {
  game.sendRatio = game.sendRatio === 0.5 ? 1 : 0.5;
  syncHud();
});

restartBtn.addEventListener("click", () => {
  game.restart();
  ai.wait = 1.8;
  ai.lastTarget = -1;
  ai.repeats = 0;
  shownWinner = false;
  overlay.classList.add("hidden");
});

updateBtn.addEventListener("click", async () => {
  updateBtn.disabled = true;
  updateBtn.textContent = "…";
  const state = await applyUpdate();
  if (state === "offline") toast("Offline. Using this build.");
  if (state === "latest") toast("Already latest.");
  if (state === "ready") toast("Loading update…");
  updateBtn.disabled = false;
  updateBtn.textContent = "Update";
});

bindInput(canvas, game, () => cam);
window.addEventListener("resize", resize);
resize();

void loadBundledVersion().then((ver) => {
  versionEl.textContent = `v${ver.version}`;
  return peekUpdate();
}).then((newer) => {
  if (newer) updateBtn.classList.add("badge");
});

versionEl.textContent = `v${localVersion().version}`;

let last = performance.now();
function loop(now: number): void {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  game.update(dt);
  ai.tick(game, dt);
  render(ctx, game, cam);
  syncHud();
  requestAnimationFrame(loop);
}

requestAnimationFrame(loop);
