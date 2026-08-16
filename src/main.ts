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
  }
}

function startGame(): void {
  window.__annexStop?.();

  const boardEl = document.querySelector<HTMLCanvasElement>("#game");
  const drawEl = boardEl?.getContext("2d");
  const scoreEl = document.querySelector("#score");
  const updateEl = document.querySelector<HTMLButtonElement>("#update-btn");
  const toastEl = document.querySelector("#toast");
  const overlayEl = document.querySelector("#overlay");
  const resultEl = document.querySelector("#result");
  const restartEl = document.querySelector<HTMLButtonElement>("#restart-btn");
  const versionEl = document.querySelector("#version");
  const hint = document.querySelector("#hint");

  if (!boardEl || !drawEl || !scoreEl || !updateEl || !toastEl || !overlayEl || !resultEl || !restartEl || !versionEl) {
    document.body.insertAdjacentHTML("beforeend", "<p style='color:#fff;padding:16px'>Game failed to start.</p>");
    return;
  }

  const board = boardEl;
  const draw = drawEl;
  const score = scoreEl;
  const update = updateEl;
  const toastBox = toastEl;
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

  function toast(text: string): void {
    toastBox.textContent = text;
    toastBox.classList.add("show");
    window.setTimeout(() => toastBox.classList.remove("show"), 2200);
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

  const onUpdate = async (): Promise<void> => {
    update.disabled = true;
    update.textContent = "…";
    const state = await applyUpdate();
    if (!alive) return;
    if (state === "offline") toast("Update failed. Try again.");
    if (state === "latest") toast("Already latest.");
    if (state === "ready") toast(`Updated to v${localVersion().version}`);
    update.disabled = false;
    update.textContent = "Update";
  };

  again.addEventListener("click", onRestart);
  update.addEventListener("click", onUpdate);

  const unbind = bindInput(board, game, () => cam);
  window.addEventListener("resize", resize);
  resize();

  version.textContent = `v${localVersion().version}`;
  if (window.__annexJustUpdated) {
    toast(`Updated to v${window.__annexJustUpdated}`);
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
    requestAnimationFrame(loop);
  }

  window.__annexStop = () => {
    alive = false;
    window.clearTimeout(hintTimer);
    unbind();
    window.removeEventListener("resize", resize);
    again.removeEventListener("click", onRestart);
    update.removeEventListener("click", onUpdate);
  };

  requestAnimationFrame(loop);
}

function boot(): void {
  try {
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
