import { useEffect, useRef } from "react";
import { ArrowUp, Droplets, Map, Moon, Skull, Star, Volume2, VolumeX } from "lucide-react";
import { unlockAudio } from "@/game/audio";
import { startGame } from "@/game/engine";
import { useGame } from "@/game/store";

export function GameShell() {
  const viewRef = useRef<HTMLCanvasElement>(null);
  const miniRef = useRef<HTMLCanvasElement>(null);
  const bigRef = useRef<HTMLCanvasElement>(null);
  const hud = useGame();

  useEffect(() => {
    const view = viewRef.current;
    const mini = miniRef.current;
    const big = bigRef.current;
    if (!view || !mini || !big) return;
    return startGame(view, mini, big);
  }, []);

  function onStart() {
    unlockAudio();
    useGame.getState().setPhase("play");
    viewRef.current?.focus();
  }

  const showHud = hud.phase !== "menu";
  const showMap = hud.mapOpen && showHud;

  return (
    <main className="relative h-dvh w-full select-none overflow-hidden bg-bg text-fg">
      <canvas ref={viewRef} className="absolute inset-0 h-full w-full touch-none outline-none" tabIndex={0} />
      <canvas
        ref={miniRef}
        className={
          showHud
            ? "border-border absolute top-3 left-3 z-10 size-28 rounded-md border sm:top-4 sm:left-4 sm:size-36"
            : "hidden"
        }
      />
      <div className="film-edge pointer-events-none absolute inset-0" />
      <div className="dawn-wash pointer-events-none absolute inset-0" style={{ opacity: hud.sun }} />
      <div className="vignette-hurt pointer-events-none absolute inset-0" style={{ opacity: hud.vignette * 0.75 }} />

      {showHud && (
        <div className="pointer-events-none absolute inset-0 z-10">
          <div className="absolute top-32 left-3 sm:top-44 sm:left-4">
            <p className="font-display text-accent text-lg leading-none tracking-wide">{hud.district}</p>
            <p className="text-muted text-xs">{hud.clock}</p>
          </div>

          <div className="absolute top-3 right-3 flex flex-col items-end gap-2 sm:top-4 sm:right-4">
            <div className="flex items-center gap-2">
              <button
                type="button"
                className="bg-surface/80 border-border pointer-events-auto flex size-11 items-center justify-center rounded-md border"
                onClick={() => useGame.getState().toggleMap()}
                aria-label="Map"
              >
                <Map className="size-5" />
              </button>
              <button
                type="button"
                className="bg-surface/80 border-border pointer-events-auto flex size-11 items-center justify-center rounded-md border"
                onClick={() => useGame.getState().toggleMute()}
                aria-label={hud.muted ? "Unmute" : "Mute"}
              >
                {hud.muted ? <VolumeX className="size-5" /> : <Volume2 className="size-5" />}
              </button>
            </div>
            <p className="font-display text-2xl leading-none tracking-wide">${hud.cash.toLocaleString()}</p>
            <div className="flex gap-1" aria-label={`Wanted ${hud.heat} of 5`}>
              {Array.from({ length: 5 }, (_, i) => (
                <Star
                  key={i}
                  className={i < hud.heat ? "text-accent size-4" : "text-muted size-4"}
                  fill={i < hud.heat ? "currentColor" : "none"}
                />
              ))}
            </div>
            <p className="text-muted text-xs">
              Night {hud.night}
              {hud.inCar ? ` · ${hud.speedMph} mph` : ""}
            </p>
          </div>

          {hud.arrow != null && hud.phase === "play" && (
            <div
              className="absolute top-1/2 left-1/2"
              style={{ transform: `translate(-50%, -50%) rotate(${hud.arrow}rad)` }}
            >
              <div className="text-accent -translate-y-24 sm:-translate-y-32">
                <ArrowUp className="size-6" />
              </div>
            </div>
          )}

          <div className="hud-fade absolute inset-x-0 bottom-0 px-3 pt-16 pb-4 sm:px-5 sm:pb-5">
            <div className="mx-auto flex max-w-xl flex-col gap-2">
              {hud.banner && <p className="font-display text-accent text-center text-2xl tracking-wide">{hud.banner}</p>}
              {hud.popup && <p className="text-accent text-center text-sm">{hud.popup}</p>}
              {hud.scanner && <p className="text-muted text-center text-sm italic">{hud.scanner}</p>}
              <p className="text-center text-sm sm:text-base">
                <span className="text-accent font-display mr-2 tracking-wide">{hud.missionTitle}</span>
                {hud.objective}
              </p>
              {hud.radio && hud.inCar && <p className="text-muted text-center text-xs">{hud.radio}</p>}
              {hud.prompt && <p className="font-display text-center text-xl tracking-wide">{hud.prompt}</p>}
              <div className="flex items-center gap-3">
                <Droplets className="text-primary size-4 shrink-0" />
                <div className="bg-surface-2 h-2 flex-1 overflow-hidden rounded-full">
                  <div
                    className={`bg-primary h-full ${hud.lowBlood ? "animate-pulse" : ""}`}
                    style={{ width: `${Math.max(0, Math.min(100, hud.blood))}%` }}
                  />
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Skull className="text-fg size-4 shrink-0" />
                <div className="bg-surface-2 h-2 flex-1 overflow-hidden rounded-full">
                  <div className="bg-fg h-full" style={{ width: `${Math.max(0, Math.min(100, hud.health))}%` }} />
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className={showMap ? "absolute inset-0 z-20 flex items-center justify-center bg-bg/70 p-4" : "hidden"}>
        <div className="border-border bg-surface flex flex-col items-center gap-3 rounded-md border p-4">
          <p className="font-display text-accent text-2xl tracking-wide">Parish map</p>
          <canvas ref={bigRef} className="border-border h-72 w-72 rounded-md border sm:h-96 sm:w-96" />
          <button
            type="button"
            className="bg-primary text-fg font-display h-11 rounded-md px-4 tracking-wide"
            onClick={() => useGame.getState().toggleMap()}
          >
            Close
          </button>
        </div>
      </div>

      {hud.phase === "play" && <TouchControls />}

      {hud.phase === "menu" && (
        <div className="absolute inset-0 z-20 flex items-end justify-center sm:items-center">
          <section className="border-border bg-surface/90 m-3 max-h-full w-full max-w-xl overflow-y-auto rounded-md border p-5 sm:m-6 sm:p-7">
            <p className="text-accent font-display text-sm tracking-widest">NEW ORLEANS · 1991</p>
            <h1 className="font-display text-5xl leading-none tracking-wide sm:text-6xl">Midnight Parish</h1>
            <p className="text-muted mt-3 text-sm leading-relaxed sm:text-base">
              You are Lucien Vale, turned in eighty-nine and left starving when your sire was ashed behind a
              krewe warehouse. Tonight a broker called the Collector is shipping stolen blood out of the
              cotton docks. Feed, steal a car, and finish him before the sun walks the Quarter.
            </p>
            <button
              type="button"
              className="bg-primary text-fg font-display mt-5 h-12 w-full rounded-md text-2xl tracking-widest"
              onClick={onStart}
            >
              Start
            </button>
            <div className="mt-5 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
              <p>
                <span className="text-accent">WASD</span> <span className="text-muted">move or drive</span>
              </p>
              <p>
                <span className="text-accent">Space</span> <span className="text-muted">claws</span>
              </p>
              <p>
                <span className="text-accent">F</span> <span className="text-muted">bite, car, phone</span>
              </p>
              <p>
                <span className="text-accent">Shift</span> <span className="text-muted">sprint</span>
              </p>
              <p>
                <span className="text-accent">Q / E</span> <span className="text-muted">look</span>
              </p>
              <p>
                <span className="text-accent">R</span> <span className="text-muted">radio in a car</span>
              </p>
              <p>
                <span className="text-accent">M</span> <span className="text-muted">map</span>
              </p>
              <p>
                <span className="text-accent">Esc</span> <span className="text-muted">pause</span>
              </p>
            </div>
            <p className="text-muted mt-4 flex items-center gap-2 text-xs">
              <Moon className="size-4 shrink-0" />
              Blood drains until dawn. The crypt on Magazine will hide you.
              {hud.bestCash > 0 ? ` Best take $${hud.bestCash.toLocaleString()}.` : ""}
            </p>
          </section>
        </div>
      )}

      {hud.phase === "pause" && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-bg/70 p-4">
          <section className="border-border bg-surface w-full max-w-sm rounded-md border p-6 text-center">
            <h2 className="font-display text-4xl tracking-wide">Paused</h2>
            <p className="text-muted mt-2 text-sm">
              {hud.district} · {hud.clock}
            </p>
            <button
              type="button"
              className="bg-primary text-fg font-display mt-5 h-12 w-full rounded-md text-2xl tracking-widest"
              onClick={() => useGame.getState().setPhase("play")}
            >
              Resume
            </button>
          </section>
        </div>
      )}

      {hud.phase === "dead" && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-bg/75 p-4">
          <section className="border-border bg-surface w-full max-w-sm rounded-md border p-6 text-center">
            <h2 className="font-display text-primary text-4xl tracking-wide">Ashed</h2>
            <p className="mt-3 text-sm leading-relaxed">{hud.deathReason}</p>
            <p className="text-muted mt-2 text-xs">You keep most of the cash. The crypt takes you back.</p>
            <button
              type="button"
              className="bg-primary text-fg font-display mt-5 h-12 w-full rounded-md text-2xl tracking-widest"
              onClick={() => {
                unlockAudio();
                useGame.getState().setPhase("play");
              }}
            >
              Rise again
            </button>
          </section>
        </div>
      )}
    </main>
  );
}

function TouchControls() {
  const origin = useRef<{ x: number; y: number; id: number } | null>(null);

  return (
    <div className="touch-controls pointer-events-none absolute inset-x-0 bottom-36 z-30 items-end justify-between px-3">
      <div
        className="border-border bg-surface/50 pointer-events-auto relative size-28 rounded-full border"
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          origin.current = { x: e.clientX, y: e.clientY, id: e.pointerId };
        }}
        onPointerMove={(e) => {
          if (!origin.current || origin.current.id !== e.pointerId) return;
          const dx = e.clientX - origin.current.x;
          const dy = e.clientY - origin.current.y;
          const mag = Math.hypot(dx, dy) || 1;
          const k = Math.min(1, mag / 48);
          window.__parish?.setMove((dx / mag) * k, (-dy / mag) * k);
        }}
        onPointerUp={(e) => {
          if (origin.current?.id === e.pointerId) {
            origin.current = null;
            window.__parish?.setMove(0, 0);
          }
        }}
        onPointerCancel={() => {
          origin.current = null;
          window.__parish?.setMove(0, 0);
        }}
        aria-label="Move"
      />
      <div
        className="pointer-events-auto mx-2 h-28 flex-1 touch-none"
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          (e.currentTarget as HTMLDivElement).dataset.look = "1";
        }}
        onPointerMove={(e) => {
          if ((e.currentTarget as HTMLDivElement).dataset.look !== "1") return;
          window.__parish?.addYaw(e.movementX * 0.006);
        }}
        onPointerUp={(e) => {
          delete (e.currentTarget as HTMLDivElement).dataset.look;
        }}
      />
      <div className="pointer-events-auto flex items-center gap-2">
        <HoldButton label="Run" onHold={(v) => window.__parish?.setSprint(v)} />
        <HoldButton label="Bite" onHold={(v) => window.__parish?.setUse(v)} />
        <button
          type="button"
          className="bg-primary text-fg font-display size-14 rounded-full text-sm tracking-wide"
          onPointerDown={(e) => {
            e.preventDefault();
            window.__parish?.attack();
          }}
        >
          Claw
        </button>
      </div>
    </div>
  );
}

function HoldButton({ label, onHold }: { label: string; onHold: (held: boolean) => void }) {
  return (
    <button
      type="button"
      className="border-border bg-surface/80 text-fg font-display size-14 rounded-full border text-sm tracking-wide"
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        onHold(true);
      }}
      onPointerUp={() => onHold(false)}
      onPointerCancel={() => onHold(false)}
    >
      {label}
    </button>
  );
}
