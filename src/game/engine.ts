import * as THREE from "three";
import { mixFrame, RADIO, resumeAudio, setMuted, sfx } from "@/game/audio";
import { makeBeam, makeCar, makePed, makeRing, makeStreetcar, type CarKind, type Limbs } from "@/game/meshes";
import { useGame, type Phase } from "@/game/store";
import {
  buildCity,
  districtAt,
  lineOfSight,
  makeRng,
  resolveCircle,
  type AABB,
} from "@/game/world";

type Kind = "civil" | "cop" | "tourist" | "rival" | "collector" | "thug" | "dealer";

type Ped = {
  id: number;
  x: number;
  z: number;
  yaw: number;
  hp: number;
  maxHp: number;
  kind: Kind;
  path: { x: number; z: number }[];
  pathI: number;
  speed: number;
  limbs: Limbs;
  ring: THREE.Mesh | null;
  attackCd: number;
  shootCd: number;
  dead: boolean;
  deadT: number;
  stuck: number;
  flee: number;
};

type Car = {
  x: number;
  z: number;
  yaw: number;
  speed: number;
  kind: CarKind;
  mesh: THREE.Group;
  ai: boolean;
  radius: number;
};

type Drop = { x: number; z: number; amount: number; mesh: THREE.Mesh; life: number };
type Vial = { x: number; z: number; mesh: THREE.Mesh; cool: number };
type Part = { x: number; y: number; z: number; vx: number; vy: number; vz: number; life: number; r: number; g: number; b: number };

type Side =
  | { kind: "debt"; pedId: number; text: string }
  | { kind: "rush"; x: number; z: number; time: number; text: string }
  | { kind: "quiet"; need: number; got: number; text: string };

const MISSIONS = [
  { title: "First Blood", objective: "Bite the marked tourist on Bourbon", reward: 250 },
  { title: "Wharf Run", objective: "Steal any car and reach the river docks", reward: 400 },
  { title: "No. 1", objective: "Destroy the rival in St. Louis Cemetery", reward: 700 },
  { title: "The Collector", objective: "End the vitae broker at the cotton warehouse", reward: 1500 },
];

const BARKS = [
  "Dispatch, disturbance on Bourbon. Caller says red eyes.",
  "Unit 14, suspect in a long black coat, on foot.",
  "All units, keep him off the Riverfront line.",
  "Body behind a daiquiri stand. Send everybody.",
  "Suspect took a vehicle. No plates called in.",
];

const SAVE_KEY = "midnight-parish-v1";
const STEP = 1 / 60;

declare global {
  interface Window {
    __controlsTest?: {
      getYaw: () => number;
      getSpeed: () => number;
      setSteer?: (v: number) => void;
      setKeys?: (codes: string[]) => void;
    };
    __parish?: {
      attack: () => void;
      setUse: (held: boolean) => void;
      setMove: (x: number, y: number) => void;
      setSprint: (held: boolean) => void;
      addYaw: (delta: number) => void;
    };
  }
}

function wrap(a: number) {
  return Math.atan2(Math.sin(a), Math.cos(a));
}
function clamp(v: number, a: number, b: number) {
  return Math.max(a, Math.min(b, v));
}
function clockLabel(mins: number) {
  const m = ((Math.floor(mins) % 1440) + 1440) % 1440;
  const hh = Math.floor(m / 60);
  const mm = m % 60;
  const ap = hh >= 12 ? "PM" : "AM";
  const h = hh % 12 || 12;
  return `${h}:${mm.toString().padStart(2, "0")} ${ap}`;
}

export function startGame(view: HTMLCanvasElement, mini: HTMLCanvasElement, big: HTMLCanvasElement) {
  const rng = makeRng(1991);
  const city = buildCity();
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const renderer = new THREE.WebGLRenderer({ canvas: view, antialias: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.setClearColor(0x090b12);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x090b12);
  scene.fog = new THREE.FogExp2(0x0c1018, 0.0125);
  scene.add(city.group);

  const camera = new THREE.PerspectiveCamera(58, 1, 0.1, 320);
  const fill = new THREE.PointLight(0xffe1c4, 9, 16, 2);
  fill.position.set(0, 1.4, 1.5);
  camera.add(fill);
  scene.add(camera);
  scene.add(new THREE.HemisphereLight(0x243058, 0x3a2618, 0.95));
  const moon = new THREE.DirectionalLight(0xc5d2ff, 1.2);
  moon.position.set(28, 54, 36);
  scene.add(moon);

  const head = new THREE.SpotLight(0xfff1cc, 0, 30, 0.55, 0.45, 1.2);
  const headTarget = new THREE.Object3D();
  scene.add(head, headTarget);
  head.target = headTarget;

  const dockBeam = makeBeam(0xe2b15a);
  dockBeam.position.set(city.docks.x, 0, city.docks.z);
  scene.add(dockBeam);
  const rushBeam = makeBeam(0xd1233c);
  rushBeam.visible = false;
  scene.add(rushBeam);

  let waterTime: { value: number } | null = null;
  city.group.traverse((obj) => {
    const u = (obj.userData as { uniforms?: { uTime: { value: number } } }).uniforms;
    if (u) waterTime = u.uTime;
  });

  const keys = new Set<string>();
  const prev = new Set<string>();
  let moveX = 0;
  let moveY = 0;
  let sprintHeld = false;
  let useHeld = false;
  let usePulse = false;
  let attackPulse = false;
  let probeSteer: number | null = null;
  let steerOverride = false;
  let dragging = false;
  let orbitHold = 0;

  const onKeyDown = (e: KeyboardEvent) => {
    keys.add(e.code);
    if (["Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.code)) e.preventDefault();
  };
  const onKeyUp = (e: KeyboardEvent) => keys.delete(e.code);
  const onBlur = () => keys.clear();
  const onContext = (e: Event) => e.preventDefault();
  const onPointerDown = (e: PointerEvent) => {
    if (e.button === 2) dragging = true;
    if (e.button === 0 && e.target === view && useGame.getState().phase === "play") attackPulse = true;
  };
  const onPointerUp = (e: PointerEvent) => {
    if (e.button === 2) dragging = false;
  };
  const onPointerMove = (e: PointerEvent) => {
    if (!dragging) return;
    camYaw -= e.movementX * 0.005;
    orbitHold = 1.1;
  };
  const onVis = () => {
    if (document.visibilityState === "visible") resumeAudio();
  };
  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("keyup", onKeyUp);
  window.addEventListener("blur", onBlur);
  view.addEventListener("contextmenu", onContext);
  view.addEventListener("pointerdown", onPointerDown);
  window.addEventListener("pointerup", onPointerUp);
  window.addEventListener("pointermove", onPointerMove);
  document.addEventListener("visibilitychange", onVis);

  const playerLimbs = makePed({
    shirt: 0x2a1218,
    pants: 0x14161c,
    skin: 0xe7d7c8,
    coat: 0x100e14,
    eyes: 0xff2244,
    scale: 1.06,
  });
  scene.add(playerLimbs.group);

  let nextId = 1;
  const peds: Ped[] = [];
  const cars: Car[] = [];
  const drops: Drop[] = [];
  const vials: Vial[] = [];

  const vialGeo = new THREE.OctahedronGeometry(0.28, 0);
  const vialMat = new THREE.MeshBasicMaterial({ color: 0xd1233c });
  for (const v of city.vials) {
    const mesh = new THREE.Mesh(vialGeo, vialMat);
    mesh.position.set(v.x, 0.7, v.z);
    scene.add(mesh);
    vials.push({ x: v.x, z: v.z, mesh, cool: 0 });
  }
  const dropGeo = new THREE.OctahedronGeometry(0.18, 0);
  const dropMat = new THREE.MeshBasicMaterial({ color: 0xe2b15a });

  const streetcar = makeStreetcar();
  scene.add(streetcar);
  let tramZ = (city.streetcar.z0 + city.streetcar.z1) / 2;
  let tramDir = 1;
  let boarded = false;
  let bellT = 2;

  const PARTS = 160;
  const partPos = new Float32Array(PARTS * 3);
  const partCol = new Float32Array(PARTS * 3);
  const partGeo = new THREE.BufferGeometry();
  partGeo.setAttribute("position", new THREE.BufferAttribute(partPos, 3));
  partGeo.setAttribute("color", new THREE.BufferAttribute(partCol, 3));
  const partMesh = new THREE.Points(
    partGeo,
    new THREE.PointsMaterial({ size: 0.16, vertexColors: true, transparent: true, depthWrite: false }),
  );
  scene.add(partMesh);
  const parts: Part[] = [];

  const player = {
    x: city.start.x,
    z: city.start.z,
    yaw: city.start.yaw,
    vx: 0,
    vz: 0,
  };
  let camYaw = player.yaw;
  let health = 100;
  let blood = 38;
  let cash = 0;
  let heat = 0;
  let heatClear = 0;
  let fed = 0;
  let night = 1;
  let best = 0;
  let mission = 0;
  let clockMin = 23 * 60 + 41;
  let side: Side | null = null;
  let banner = "";
  let bannerT = 0;
  let scanner = "";
  let scannerT = 0;
  let popup = "";
  let popupT = 0;
  let station = 0;
  let radioT = 0;
  let vignette = 0;
  let shake = 0;
  let hurtCd = 0;
  let attackCd = 0;
  let swipe = 0;
  let biteT = 0;
  let biteId = -1;
  let panic = 0;
  let walkPhase = 0;
  let vehicle: Car | null = null;
  let deathReason = "";
  let wasPhase: Phase = useGame.getState().phase;
  let hudAcc = 0;
  let spawnAcc = 0;
  let saveAcc = 0;
  let menuAng = 0.4;
  let simAcc = 0;
  const seenSave = loadSave();

  function loadSave() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return false;
      const data = JSON.parse(raw) as {
        version?: number;
        cash?: number;
        best?: number;
        mission?: number;
        night?: number;
        fed?: number;
      };
      if (data.version !== 1) return false;
      cash = data.cash ?? 0;
      best = data.best ?? 0;
      mission = clamp(data.mission ?? 0, 0, 4);
      night = data.night ?? 1;
      fed = data.fed ?? 0;
      return true;
    } catch {
      return false;
    }
  }

  function save() {
    best = Math.max(best, cash);
    localStorage.setItem(
      SAVE_KEY,
      JSON.stringify({ version: 1, cash, best, mission, night, fed }),
    );
  }

  function burst(x: number, y: number, z: number, hex: number, n: number, kick = 3) {
    const r = ((hex >> 16) & 255) / 255;
    const g = ((hex >> 8) & 255) / 255;
    const b = (hex & 255) / 255;
    for (let i = 0; i < n; i++) {
      if (parts.length >= PARTS) parts.shift();
      parts.push({
        x,
        y,
        z,
        vx: (rng() - 0.5) * kick,
        vy: rng() * kick,
        vz: (rng() - 0.5) * kick,
        life: 0.35 + rng() * 0.35,
        r,
        g,
        b,
      });
    }
  }

  function bark() {
    scanner = BARKS[Math.floor(rng() * BARKS.length)]!;
    scannerT = 4.2;
  }

  function addHeat(n: number) {
    const before = heat;
    heat = clamp(heat + n, 0, 5);
    if (heat > before) bark();
  }

  function spawnPed(kind: Kind, x: number, z: number, path: { x: number; z: number }[]) {
    const shirts = [0xc4553a, 0x2f4d6e, 0xd8d2c4, 0x3d6b4a, 0x6a3a6a, 0xe2b15a, 0x1f3a4a];
    const style =
      kind === "cop"
        ? { shirt: 0x1d3e78, pants: 0x1a1c22, skin: 0xd7b89a, hat: 0x1a2438, eyes: 0x111111 }
        : kind === "tourist"
          ? { shirt: 0xe2b15a, pants: 0x31457a, skin: 0xf0d2b8, eyes: 0x243040 }
          : kind === "rival"
            ? { shirt: 0x3a1020, pants: 0x12080c, skin: 0xd8c8c4, coat: 0x4a1024, eyes: 0xff3355, scale: 1.16 }
            : kind === "collector"
              ? { shirt: 0xe8e2d4, pants: 0xe8e2d4, skin: 0xc8b8a4, hat: 0x1a120e, coat: 0xf4ead8, eyes: 0xffcc66, scale: 1.08 }
              : kind === "thug"
                ? { shirt: 0x1d3a2c, pants: 0x141614, skin: 0xc4a888, eyes: 0x111111 }
                : kind === "dealer"
                  ? { shirt: 0xc9a227, pants: 0x2a2030, skin: 0xd8b898, eyes: 0x111111 }
                  : { shirt: shirts[Math.floor(rng() * shirts.length)]!, pants: 0x2a3140, skin: 0xd8b898, eyes: 0x1a120f };
    const limbs = makePed(style);
    const ring =
      kind === "tourist" || kind === "rival" || kind === "collector" || kind === "dealer" ? makeRing(kind === "tourist" ? 0xe2b15a : 0xd1233c) : null;
    if (ring && kind !== "dealer") limbs.group.add(ring);
    if (ring && kind === "dealer") {
      ring.visible = false;
      limbs.group.add(ring);
    }
    scene.add(limbs.group);
    const hp = kind === "rival" ? 260 : kind === "collector" ? 340 : kind === "cop" ? 90 : kind === "thug" ? 80 : 40;
    const ped: Ped = {
      id: nextId++,
      x,
      z,
      yaw: rng() * Math.PI * 2,
      hp,
      maxHp: hp,
      kind,
      path: path.length ? path : [{ x, z }],
      pathI: 0,
      speed: kind === "tourist" ? 1.35 : kind === "cop" ? 2.1 : 1.7,
      limbs,
      ring,
      attackCd: 0,
      shootCd: rng(),
      dead: false,
      deadT: 0,
      stuck: 0,
      flee: 0,
    };
    peds.push(ped);
    return ped;
  }

  function living(kind?: Kind) {
    return peds.filter((p) => !p.dead && (!kind || p.kind === kind));
  }

  const bourbonPath = city.pedPaths[city.pedPaths.length - 1] ?? [{ x: city.bourbon.x, z: city.bourbon.z }];
  spawnPed("tourist", city.bourbon.x, city.bourbon.z, bourbonPath);
  for (let i = 0; i < 16; i++) {
    const path = city.pedPaths[i % city.pedPaths.length]!;
    const spot = path[i % path.length]!;
    spawnPed(i % 7 === 0 ? "dealer" : "civil", spot.x, spot.z, path);
  }
  spawnPed("cop", city.blocks[2]!.x0 - 2, city.blocks[2]!.z0, city.pedPaths[0]!);
  spawnPed("cop", city.docks.x + 8, city.docks.z, city.pedPaths[1] ?? city.pedPaths[0]!);

  const kinds: CarKind[] = ["sedan", "coupe", "taxi", "van", "sedan", "cop", "coupe", "sedan"];
  const colors = [0x6e1e28, 0xd8d2c4, 0xf2c14e, 0x1a1c20, 0x3d4a6a, 0xe8e6e0, 0x8a5a32, 0x1f3d32];
  city.carSpawns.forEach((s, i) => {
    const kind = kinds[i % kinds.length]!;
    const mesh = makeCar(kind, kind === "taxi" ? 0xf2c14e : kind === "cop" ? 0xe8e6e0 : colors[i % colors.length]!);
    mesh.position.set(s.x, 0, s.z);
    mesh.rotation.y = s.yaw;
    scene.add(mesh);
    cars.push({ x: s.x, z: s.z, yaw: s.yaw, speed: 0, kind, mesh, ai: false, radius: 1.45 });
  });

  if (mission >= 2) spawnRival();
  if (mission === 3) spawnCollector();

  function spawnRival() {
    if (living("rival").length) return;
    spawnPed("rival", city.cemetery.x, city.cemetery.z, [
      { x: city.cemetery.x - 4, z: city.cemetery.z },
      { x: city.cemetery.x + 4, z: city.cemetery.z + 3 },
      { x: city.cemetery.x, z: city.cemetery.z - 4 },
    ]);
  }
  function spawnCollector() {
    if (living("collector").length) return;
    spawnPed("collector", city.collector.x, city.collector.z, [
      { x: city.collector.x, z: city.collector.z },
      { x: city.collector.x + 6, z: city.collector.z },
    ]);
    spawnPed("thug", city.collector.x + 3, city.collector.z + 2, [{ x: city.collector.x + 3, z: city.collector.z + 2 }]);
    spawnPed("thug", city.collector.x - 3, city.collector.z + 1, [{ x: city.collector.x - 3, z: city.collector.z + 1 }]);
  }

  function streetPoint(dist: number) {
    const ang = rng() * Math.PI * 2;
    return {
      x: clamp(player.x + Math.cos(ang) * dist, 24, city.worldX1 - 8),
      z: clamp(player.z + Math.sin(ang) * dist, 10, city.worldZ1 - 8),
    };
  }

  function maintain(dt: number) {
    spawnAcc += dt;
    if (spawnAcc < 1.2) return;
    spawnAcc = 0;
    const civ = living("civil").length + living("dealer").length + living("tourist").length;
    if (civ < 14) {
      const path = city.pedPaths[Math.floor(rng() * city.pedPaths.length)]!;
      const spot = streetPoint(30 + rng() * 20);
      spawnPed("civil", spot.x, spot.z, path);
    }
    if (mission === 0 && !living("tourist").length) {
      const deadTour = peds.find((p) => p.kind === "tourist" && p.dead && p.deadT > 2);
      if (deadTour) {
        deadTour.dead = false;
        deadTour.hp = deadTour.maxHp;
        deadTour.x = city.bourbon.x;
        deadTour.z = city.bourbon.z;
        deadTour.limbs.group.visible = true;
        deadTour.limbs.group.rotation.x = 0;
        deadTour.limbs.group.position.y = 0;
        if (deadTour.ring) deadTour.ring.visible = true;
        banner = "He got back up. Teeth, not just claws.";
        bannerT = 2.6;
      }
    }
    const cops = living("cop").length;
    const want = heat <= 0 ? 2 : Math.min(6, 2 + heat);
    if (cops < want) {
      const spot = streetPoint(26 + rng() * 10);
      const path = city.pedPaths[Math.floor(rng() * city.pedPaths.length)]!;
      spawnPed("cop", spot.x, spot.z, path);
    }
    if (heat >= 3 && !cars.some((c) => c.ai)) {
      const spot = streetPoint(34);
      const mesh = makeCar("cop", 0xe8e6e0);
      scene.add(mesh);
      cars.push({ x: spot.x, z: spot.z, yaw: 0, speed: 4, kind: "cop", mesh, ai: true, radius: 1.45 });
    }
    for (let i = peds.length - 1; i >= 0; i--) {
      const p = peds[i]!;
      if (!p.dead) continue;
      const keepTourist = p.kind === "tourist" && mission === 0;
      if (p.deadT > 8 && !keepTourist) {
        scene.remove(p.limbs.group);
        peds.splice(i, 1);
      }
    }
  }

  function dropCash(x: number, z: number, amount: number) {
    const mesh = new THREE.Mesh(dropGeo, dropMat);
    mesh.position.set(x, 0.45, z);
    scene.add(mesh);
    drops.push({ x, z, amount, mesh, life: 18 });
  }

  function hurt(amount: number) {
    if (hurtCd > 0) return;
    health -= amount;
    hurtCd = 0.45;
    vignette = 1;
    shake = Math.max(shake, reduce ? 0 : 0.35);
    sfx.hit();
    if (health <= 0) die(heat > 0 ? "The parish put you down." : "You ran out of night.");
  }

  function die(reason: string) {
    if (useGame.getState().phase !== "play") return;
    deathReason = reason;
    health = 0;
    if (vehicle) {
      vehicle.ai = false;
      vehicle = null;
    }
    boarded = false;
    playerLimbs.group.visible = true;
    useGame.getState().setPhase("dead");
    sfx.fail();
    save();
  }

  function respawn() {
    health = 100;
    blood = 62;
    heat = 0;
    cash = Math.floor(cash * 0.85);
    vehicle = null;
    boarded = false;
    player.x = city.crypt.x;
    player.z = city.crypt.z;
    player.yaw = 0;
    camYaw = 0;
    player.vx = 0;
    player.vz = 0;
    if (clockMin > 1700) clockMin = 22 * 60 + 30;
    hurtCd = 1.5;
    biteT = 0;
    playerLimbs.group.visible = true;
    playerLimbs.group.rotation.x = 0;
  }

  function completeMission() {
    const info = MISSIONS[mission];
    if (!info) return;
    cash += info.reward;
    popup = `+$${info.reward}`;
    popupT = 2.2;
    banner = `${info.title} complete`;
    bannerT = 4;
    sfx.mission();
    mission += 1;
    if (mission === 2) spawnRival();
    if (mission === 3) spawnCollector();
    save();
  }

  function completeSide(pay: number, msg: string) {
    cash += pay;
    popup = `+$${pay}`;
    popupT = 2;
    banner = msg;
    bannerT = 3.2;
    side = null;
    sfx.mission();
    save();
  }

  function failSide(msg: string) {
    banner = msg;
    bannerT = 2.6;
    side = null;
    sfx.fail();
  }

  function objectiveText() {
    if (side?.kind === "debt") return "Rough up the dealer in the gold shirt";
    if (side?.kind === "rush") return `Rush a car to the marker · ${Math.ceil(side.time)}s`;
    if (side?.kind === "quiet") return `Bite two people without heat past 1 star · ${side.got}/2`;
    if (mission >= MISSIONS.length) return "The night is yours — feed, hustle, or sleep at the crypt";
    return MISSIONS[mission]!.objective;
  }

  function targetOf(): { x: number; z: number } | null {
    if (side?.kind === "debt") {
      const ped = peds.find((p) => p.id === sidePed() && !p.dead);
      return ped ? { x: ped.x, z: ped.z } : null;
    }
    if (side?.kind === "rush") return { x: side.x, z: side.z };
    if (mission === 0) {
      const t = living("tourist")[0];
      return t ? { x: t.x, z: t.z } : { x: city.bourbon.x, z: city.bourbon.z };
    }
    if (mission === 1) return city.docks;
    if (mission === 2) {
      const r = living("rival")[0];
      return r ? { x: r.x, z: r.z } : city.cemetery;
    }
    if (mission === 3) {
      const c = living("collector")[0];
      return c ? { x: c.x, z: c.z } : city.collector;
    }
    if (sunFactor() > 0.45) return city.crypt;
    return null;
  }

  function sidePed() {
    return side?.kind === "debt" ? side.pedId : -1;
  }

  function sunFactor() {
    return clamp((clockMin - 1680) / 90, 0, 1);
  }

  function copSees(x: number, z: number) {
    return living("cop").some((c) => Math.hypot(c.x - x, c.z - z) < 28 && lineOfSight(c.x, c.z, x, z, city.colliders));
  }

  function killPed(ped: Ped, cause: "bite" | "claw" | "car") {
    if (ped.dead) return;
    ped.dead = true;
    ped.hp = 0;
    ped.deadT = 0;
    burst(ped.x, 1, ped.z, 0x8a1020, cause === "bite" ? 16 : 8, 4);
    if (ped.ring && ped.kind !== "dealer") ped.ring.visible = false;
    if (cause === "bite") {
      blood = Math.min(100, blood + 48);
      fed += 1;
      const pay = 25 + Math.floor(rng() * 55);
      cash += pay;
      popup = `+$${pay}`;
      popupT = 1.4;
      sfx.bite();
      shake = Math.max(shake, reduce ? 0 : 0.25);
      if (copSees(ped.x, ped.z)) addHeat(2);
      if (ped.kind === "tourist" && mission === 0) completeMission();
      if (side?.kind === "quiet") {
        side.got += 1;
        if (side.got >= side.need) completeSide(220, "Quiet meal. The parish heard nothing.");
      }
    } else {
      if (ped.kind !== "cop" && ped.kind !== "rival" && ped.kind !== "collector") dropCash(ped.x, ped.z, 15 + Math.floor(rng() * 40));
      if (ped.kind === "cop") addHeat(2);
      else addHeat(1);
      sfx.claw();
    }
    if (ped.kind === "rival" && mission === 2) completeMission();
    if (ped.kind === "collector" && mission === 3) completeMission();
    if (side?.kind === "debt" && side.pedId === ped.id) completeSide(280, "Debt settled. He won't flash that chain again.");
    panic = 3.5;
  }

  function nearestPed(range: number) {
    let best: Ped | null = null;
    let bestD = range;
    for (const p of peds) {
      if (p.dead) continue;
      const d = Math.hypot(p.x - player.x, p.z - player.z);
      if (d < bestD) {
        bestD = d;
        best = p;
      }
    }
    return best ? { ped: best, d: bestD } : null;
  }

  function nearestCar(range: number) {
    let best: Car | null = null;
    let bestD = range;
    for (const c of cars) {
      if (c === vehicle) continue;
      const d = Math.hypot(c.x - player.x, c.z - player.z);
      if (d < bestD) {
        bestD = d;
        best = c;
      }
    }
    return best ? { car: best, d: bestD } : null;
  }

  function promptFor() {
    if (boarded) return "F  Step off the streetcar";
    if (vehicle) return "F  Exit    R  Radio";
    const cryptD = Math.hypot(player.x - city.crypt.x, player.z - city.crypt.z);
    if (cryptD < 7) return "F  Rest until dusk";
    const ped = nearestPed(1.85);
    const car = nearestCar(3.1);
    if (ped && (!car || ped.d < car.d)) return ped.ped.kind === "cop" ? "F  Bite the cop" : "F  Bite";
    if (car && Math.abs(car.car.speed) < 3) return car.car.kind === "cop" ? "F  Take the cruiser" : "F  Take the car";
    const phone = city.phones.find((p) => Math.hypot(p.x - player.x, p.z - player.z) < 2.1);
    if (phone) return "F  Answer the payphone";
    const tramD = Math.hypot(city.streetcar.x - player.x, tramZ - player.z);
    if (tramD < 3.4) return "F  Board the Riverfront car";
    return "";
  }

  function tryUse() {
    if (boarded) {
      boarded = false;
      player.x = city.streetcar.x + 2.4;
      playerLimbs.group.visible = true;
      sfx.carDoor();
      return;
    }
    if (vehicle) {
      const rx = Math.cos(vehicle.yaw);
      const rz = -Math.sin(vehicle.yaw);
      player.x = vehicle.x + rx * 2.3;
      player.z = vehicle.z + rz * 2.3;
      const solved = resolveCircle(player.x, player.z, 0.42, city.colliders);
      player.x = solved.x;
      player.z = solved.z;
      player.yaw = vehicle.yaw;
      vehicle = null;
      playerLimbs.group.visible = true;
      head.intensity = 0;
      sfx.carDoor();
      return;
    }
    const cryptD = Math.hypot(player.x - city.crypt.x, player.z - city.crypt.z);
    if (cryptD < 7) {
      clockMin = 22 * 60 + 18;
      blood = 100;
      health = 100;
      heat = 0;
      night += 1;
      cash += 80;
      banner = `Night ${night}. The crypt kept you.`;
      bannerT = 3.4;
      popup = "+$80";
      popupT = 1.6;
      sfx.mission();
      save();
      return;
    }
    const pedN = nearestPed(1.85);
    const carN = nearestCar(3.1);
    if (pedN && (!carN || pedN.d <= carN.d + 0.4)) {
      biteId = pedN.ped.id;
      biteT = 0.01;
      return;
    }
    if (carN && Math.abs(carN.car.speed) < 3) {
      vehicle = carN.car;
      vehicle.ai = false;
      vehicle.speed = Math.max(0, vehicle.speed);
      boarded = false;
      playerLimbs.group.visible = false;
      player.yaw = vehicle.yaw;
      camYaw = vehicle.yaw;
      if (copSees(vehicle.x, vehicle.z)) addHeat(vehicle.kind === "cop" ? 2 : 1);
      else if (vehicle.kind === "cop") addHeat(1);
      sfx.carDoor();
      radioT = 3;
      return;
    }
    const phone = city.phones.find((p) => Math.hypot(p.x - player.x, p.z - player.z) < 2.1);
    if (phone) {
      sfx.phone();
      if (side) {
        banner = "Finish what you already picked up.";
        bannerT = 2;
        return;
      }
      const roll = Math.floor(rng() * 3);
      if (roll === 0) {
        const dealer = living("dealer")[0];
        if (!dealer) {
          banner = "Nobody's picking up.";
          bannerT = 2;
          return;
        }
        if (dealer.ring) dealer.ring.visible = true;
        side = { kind: "debt", pedId: dealer.id, text: "dealer" };
        banner = "A voice: the chain on Magazine. Make him sorry.";
        bannerT = 3.4;
      } else if (roll === 1) {
        const dest = rng() > 0.5 ? city.docks : city.cemetery;
        side = { kind: "rush", x: dest.x, z: dest.z, time: 55, text: "rush" };
        banner = "Get a car to the marker before the minute dies.";
        bannerT = 3.2;
      } else if (heat > 1) {
        banner = "Lose the cruisers before you hunt quiet.";
        bannerT = 2.4;
      } else {
        side = { kind: "quiet", need: 2, got: 0, text: "quiet" };
        banner = "Two bites. No stars. Don't get theatrical.";
        bannerT = 3.2;
      }
      return;
    }
    if (Math.hypot(city.streetcar.x - player.x, tramZ - player.z) < 3.4) {
      boarded = true;
      playerLimbs.group.visible = false;
      sfx.bell();
    }
  }

  function attack() {
    if (attackCd > 0 || vehicle || boarded) return;
    attackCd = 0.46;
    swipe = 0.28;
    biteT = 0;
    sfx.claw();
    const fx = -Math.sin(player.yaw);
    const fz = -Math.cos(player.yaw);
    let hitCop = false;
    let hitCiv = false;
    for (const ped of peds) {
      if (ped.dead) continue;
      const dx = ped.x - player.x;
      const dz = ped.z - player.z;
      const dist = Math.hypot(dx, dz);
      if (dist > 2.25 || dist < 0.05) continue;
      if ((dx * fx + dz * fz) / dist < 0.2) continue;
      const dmg = ped.kind === "rival" || ped.kind === "collector" ? 28 : 36;
      ped.hp -= dmg;
      ped.flee = ped.kind === "civil" || ped.kind === "tourist" || ped.kind === "dealer" ? 4 : 0;
      burst(ped.x, 1.1, ped.z, 0xd1233c, 6, 2.5);
      if (ped.hp <= 0) {
        killPed(ped, "claw");
      } else if (ped.kind === "cop") hitCop = true;
      else hitCiv = true;
    }
    if (hitCop) addHeat(2);
    else if (hitCiv) addHeat(1);
    panic = 2.4;
  }

  function moveActor(x: number, z: number, radius: number, extra?: AABB) {
    if (extra) city.colliders.push(extra);
    const solved = resolveCircle(x, z, radius, city.colliders);
    if (extra) city.colliders.pop();
    return solved;
  }

  function sim(dt: number, useEdge: boolean, attackEdge: boolean, radioEdge: boolean) {
    const phase = useGame.getState().phase;
    if (phase !== "play") return;

    clockMin += dt * 0.92;
    hurtCd = Math.max(0, hurtCd - dt);
    attackCd = Math.max(0, attackCd - dt);
    swipe = Math.max(0, swipe - dt);
    panic = Math.max(0, panic - dt);
    bannerT = Math.max(0, bannerT - dt);
    scannerT = Math.max(0, scannerT - dt);
    popupT = Math.max(0, popupT - dt);
    radioT = Math.max(0, radioT - dt);
    if (bannerT === 0) banner = "";
    if (scannerT === 0) scanner = "";
    if (popupT === 0) popup = "";
    vignette = Math.max(0, vignette - dt * 1.4);

    const sun = sunFactor();
    const sprinting = (keys.has("ShiftLeft") || keys.has("ShiftRight") || sprintHeld) && blood > 3;
    let ix = clamp(moveX, -1, 1);
    let iz = clamp(moveY, -1, 1);
    if (keys.has("KeyA") || keys.has("ArrowLeft")) ix -= 1;
    if (keys.has("KeyD") || keys.has("ArrowRight")) ix += 1;
    if (keys.has("KeyW") || keys.has("ArrowUp")) iz += 1;
    if (keys.has("KeyS") || keys.has("ArrowDown")) iz -= 1;
    ix = clamp(ix, -1, 1);
    iz = clamp(iz, -1, 1);

    if (keys.has("KeyQ")) {
      camYaw += 1.7 * dt;
      orbitHold = 0.9;
    }
    if (keys.has("KeyE")) {
      camYaw -= 1.7 * dt;
      orbitHold = 0.9;
    }
    if (radioEdge && vehicle) {
      station = (station + 1) % RADIO.length;
      radioT = 3.2;
    }

    const tramBox: AABB = {
      minx: city.streetcar.x - 1.5,
      maxx: city.streetcar.x + 1.5,
      minz: tramZ - 5.1,
      maxz: tramZ + 5.1,
    };
    tramZ += tramDir * 6.2 * dt;
    if (tramZ > city.streetcar.z1) tramDir = -1;
    if (tramZ < city.streetcar.z0) tramDir = 1;
    bellT -= dt;
    if (bellT <= 0) {
      bellT = 9;
      if (Math.hypot(player.x - city.streetcar.x, player.z - tramZ) < 30) sfx.bell();
    }

    if (attackEdge) attack();
    if (useEdge) tryUse();

    const holdingBite = (keys.has("KeyF") || useHeld) && biteId >= 0;
    if (holdingBite && !vehicle && !boarded) {
      const target = peds.find((p) => p.id === biteId && !p.dead);
      if (target && Math.hypot(target.x - player.x, target.z - player.z) < 2) {
        biteT += dt;
        player.yaw = Math.atan2(-(target.x - player.x), -(target.z - player.z));
        if (biteT >= 0.72) {
          killPed(target, "bite");
          biteT = 0;
          biteId = -1;
        }
      } else {
        biteT = 0;
        biteId = -1;
      }
    } else if (!holdingBite) {
      biteT = 0;
    }

    if (boarded) {
      player.x = city.streetcar.x;
      player.z = tramZ;
      player.yaw = tramDir > 0 ? Math.PI : 0;
      player.vx = 0;
      player.vz = tramDir * 6.2;
      blood = Math.max(0, blood - dt * 0.2);
    } else if (vehicle) {
      let steer = 0;
      if (steerOverride && probeSteer != null) steer = clamp(probeSteer, -1, 1);
      else {
        if (keys.has("KeyA") || keys.has("ArrowLeft") || moveX < -0.3) steer += 1;
        if (keys.has("KeyD") || keys.has("ArrowRight") || moveX > 0.3) steer -= 1;
      }
      const throttle = (keys.has("KeyW") || keys.has("ArrowUp") || moveY > 0.4 ? 1 : 0) - (keys.has("KeyS") || keys.has("ArrowDown") || moveY < -0.4 ? 1 : 0);
      if (throttle > 0) vehicle.speed += 12 * dt;
      else if (throttle < 0) vehicle.speed -= 16 * dt;
      else vehicle.speed *= Math.exp(-0.7 * dt);
      vehicle.speed = clamp(vehicle.speed, -6.5, 18);
      const factor = Math.min(1, Math.abs(vehicle.speed) / 5);
      const reverse = vehicle.speed >= 0 ? 1 : -1;
      if (factor > 0.05) vehicle.yaw += steer * 2.05 * Math.max(factor, 0.28) * reverse * dt;
      vehicle.mesh.rotation.z = steer * -0.05;
      const fx = -Math.sin(vehicle.yaw);
      const fz = -Math.cos(vehicle.yaw);
      const ox = vehicle.x;
      const oz = vehicle.z;
      vehicle.x += fx * vehicle.speed * dt;
      vehicle.z += fz * vehicle.speed * dt;
      if (vehicle.x < 22) vehicle.speed *= Math.exp(-1.4 * dt);
      const solved = moveActor(vehicle.x, vehicle.z, vehicle.radius, boarded ? undefined : tramBox);
      if (Math.hypot(solved.x - vehicle.x, solved.z - vehicle.z) > 0.03) {
        vehicle.speed *= 0.42;
        shake = Math.max(shake, reduce ? 0 : 0.22);
      }
      vehicle.x = clamp(solved.x, 0, city.worldX1 - 2);
      vehicle.z = clamp(solved.z, 2, city.worldZ1 - 2);
      player.x = vehicle.x;
      player.z = vehicle.z;
      player.yaw = vehicle.yaw;
      player.vx = (vehicle.x - ox) / dt;
      player.vz = (vehicle.z - oz) / dt;
      blood = Math.max(0, blood - dt * 0.16);
      head.intensity = 55;
      head.position.set(vehicle.x + fx * 1.6, 0.9, vehicle.z + fz * 1.6);
      headTarget.position.set(vehicle.x + fx * 12, 0.4, vehicle.z + fz * 12);
    } else {
      head.intensity = 0;
      const cfx = -Math.sin(camYaw);
      const cfz = -Math.cos(camYaw);
      const crx = Math.cos(camYaw);
      const crz = -Math.sin(camYaw);
      let mx = cfx * iz + crx * ix;
      let mz = cfz * iz + crz * ix;
      const mag = Math.hypot(mx, mz);
      if (biteT > 0) {
        mx = 0;
        mz = 0;
      }
      if (mag > 0.08 && biteT <= 0) {
        mx /= mag;
        mz /= mag;
        const spd = sprinting ? 7.5 : 4.6;
        const targetYaw = Math.atan2(-mx, -mz);
        player.yaw += wrap(targetYaw - player.yaw) * Math.min(1, 9 * dt);
        const ox = player.x;
        const oz = player.z;
        player.x += mx * spd * dt;
        player.z += mz * spd * dt;
        const solved = moveActor(player.x, player.z, 0.42, tramBox);
        player.x = solved.x;
        player.z = solved.z;
        player.vx = (player.x - ox) / dt;
        player.vz = (player.z - oz) / dt;
        blood = Math.max(0, blood - dt * (sprinting ? 1.25 : 0.42));
        walkPhase += dt * spd * 1.4;
      } else {
        player.vx = 0;
        player.vz = 0;
        blood = Math.max(0, blood - dt * 0.22);
      }
    }

    player.x = clamp(player.x, -1, city.worldX1 - 2);
    player.z = clamp(player.z, 2, city.worldZ1 - 2);
    if (player.x < 3) hurt(dt * 8);

    for (const car of cars) {
      if (car === vehicle || !car.ai) continue;
      const desired = Math.atan2(-(player.x - car.x), -(player.z - car.z));
      car.yaw += clamp(wrap(desired - car.yaw), -1.5 * dt, 1.5 * dt);
      car.speed = Math.min(13, car.speed + 7 * dt);
      const fx = -Math.sin(car.yaw);
      const fz = -Math.cos(car.yaw);
      car.x += fx * car.speed * dt;
      car.z += fz * car.speed * dt;
      const solved = moveActor(car.x, car.z, car.radius, tramBox);
      if (Math.hypot(solved.x - car.x, solved.z - car.z) > 0.04) {
        car.speed *= 0.4;
        car.yaw += 0.8;
      }
      car.x = solved.x;
      car.z = solved.z;
    }

    for (let i = 0; i < cars.length; i++) {
      for (let j = i + 1; j < cars.length; j++) {
        const a = cars[i]!;
        const b = cars[j]!;
        let dx = b.x - a.x;
        let dz = b.z - a.z;
        let d = Math.hypot(dx, dz) || 0.0001;
        const min = a.radius + b.radius;
        if (d < min) {
          const push = (min - d) / 2;
          dx /= d;
          dz /= d;
          a.x -= dx * push;
          a.z -= dz * push;
          b.x += dx * push;
          b.z += dz * push;
          a.speed *= 0.7;
          b.speed *= 0.7;
        }
      }
    }

    let seen = false;
    for (const ped of peds) {
      ped.attackCd = Math.max(0, ped.attackCd - dt);
      ped.shootCd = Math.max(0, ped.shootCd - dt);
      ped.flee = Math.max(0, ped.flee - dt);
      if (ped.dead) {
        ped.deadT += dt;
        ped.limbs.group.rotation.x = Math.PI / 2;
        ped.limbs.group.position.y = 0.25;
        continue;
      }
      const dx = player.x - ped.x;
      const dz = player.z - ped.z;
      const dist = Math.hypot(dx, dz);
      const los = dist < 42 && lineOfSight(ped.x, ped.z, player.x, player.z, city.colliders);
      if (ped.kind === "cop" && heat > 0 && los) seen = true;

      let tx = ped.path[ped.pathI % ped.path.length]!.x;
      let tz = ped.path[ped.pathI % ped.path.length]!.z;
      let spd = ped.speed;
      if (ped.kind === "cop" && heat > 0 && (los || dist < 18 + heat * 6)) {
        tx = player.x;
        tz = player.z;
        spd = 4.3 + heat * 0.25;
        if (los && dist < 18 && ped.shootCd <= 0) {
          ped.shootCd = 1.05;
          burst(ped.x, 1.4, ped.z, 0xffe2a0, 3, 1);
          sfx.gun();
          if (rng() < Math.max(0.2, 0.72 - dist / 30)) hurt(7 + rng() * 6);
        }
      } else if ((ped.kind === "rival" && mission === 2 && dist < 55) || (ped.kind === "collector" && mission === 3 && dist < 40) || (ped.kind === "thug" && dist < 22)) {
        tx = player.x;
        tz = player.z;
        spd = ped.kind === "rival" ? 4.6 : 3.6;
        if (ped.kind === "collector" && los && dist < 20 && ped.shootCd <= 0) {
          ped.shootCd = 1.3;
          sfx.gun();
          burst(ped.x, 1.3, ped.z, 0xe2b15a, 4, 1.4);
          if (rng() < 0.55) hurt(12);
        }
        if (dist < 1.8 && ped.attackCd <= 0 && ped.kind !== "collector") {
          ped.attackCd = 0.85;
          hurt(ped.kind === "rival" ? 14 : 8);
          sfx.claw();
        }
      } else if (ped.flee > 0 || (panic > 0 && dist < 14 && ped.kind !== "cop")) {
        tx = ped.x - dx;
        tz = ped.z - dz;
        spd = 4.2;
      }

      const beforeX = ped.x;
      const beforeZ = ped.z;
      const desired = Math.atan2(-(tx - ped.x), -(tz - ped.z));
      ped.yaw += clamp(wrap(desired - ped.yaw), -2.6 * dt, 2.6 * dt);
      const fx = -Math.sin(ped.yaw);
      const fz = -Math.cos(ped.yaw);
      ped.x += fx * spd * dt;
      ped.z += fz * spd * dt;
      const solved = moveActor(ped.x, ped.z, 0.38, tramBox);
      ped.x = solved.x;
      ped.z = solved.z;
      if (Math.hypot(ped.x - beforeX, ped.z - beforeZ) < 0.01) ped.stuck += 1;
      else ped.stuck = 0;
      if (ped.stuck > 25 || Math.hypot(tx - ped.x, tz - ped.z) < 1.3) {
        ped.pathI += 1;
        ped.stuck = 0;
      }

      if (!boarded && !vehicle && Math.hypot(ped.x - city.streetcar.x, ped.z - tramZ) < 2.2 && Math.abs(ped.z - tramZ) < 4.6) {
        killPed(ped, "car");
      }
      for (const car of cars) {
        if (Math.abs(car.speed) < 6) continue;
        if (Math.hypot(car.x - ped.x, car.z - ped.z) < car.radius + 0.4) killPed(ped, "car");
      }
    }
    if (heat > 0) {
      if (seen) heatClear = 0;
      else {
        heatClear += dt;
        if (heatClear > 7) {
          heat -= 1;
          heatClear = 0;
        }
      }
    }

    for (const vial of vials) {
      if (vial.cool > 0) {
        vial.cool -= dt;
        vial.mesh.visible = false;
        if (vial.cool <= 0) vial.mesh.visible = true;
        continue;
      }
      if (Math.hypot(vial.x - player.x, vial.z - player.z) < 1.3) {
        blood = Math.min(100, blood + 30);
        vial.cool = 36;
        vial.mesh.visible = false;
        burst(vial.x, 0.6, vial.z, 0xd1233c, 8, 2);
        sfx.bite();
      }
    }
    for (let i = drops.length - 1; i >= 0; i--) {
      const drop = drops[i]!;
      drop.life -= dt;
      if (drop.life <= 0) {
        scene.remove(drop.mesh);
        drops.splice(i, 1);
        continue;
      }
      if (Math.hypot(drop.x - player.x, drop.z - player.z) < 1.25) {
        cash += drop.amount;
        popup = `+$${drop.amount}`;
        popupT = 1.1;
        sfx.cash();
        scene.remove(drop.mesh);
        drops.splice(i, 1);
      }
    }

    if (side?.kind === "rush") {
      side.time -= dt;
      if (vehicle && Math.hypot(player.x - side.x, player.z - side.z) < 7) completeSide(320, "On time. The dock doesn't ask questions.");
      else if (side && side.kind === "rush" && side.time <= 0) failSide("Too slow. The payphone went dead.");
    }
    if (side?.kind === "quiet" && heat > 1) failSide("Too loud. The quiet job is blown.");

    if (mission === 1 && vehicle && Math.hypot(player.x - city.docks.x, player.z - city.docks.z) < 7) completeMission();

    if (blood <= 0) hurt(dt * 7);
    else if (blood > 58 && health < 100 && hurtCd <= 0) health = Math.min(100, health + dt * 3);

    if (sun > 0.82) {
      const inCrypt = Math.hypot(player.x - city.crypt.x, player.z - city.crypt.z) < 8;
      if (!inCrypt) {
        hurt(dt * 12);
        if (health <= 0) die("The sun found you on an open street.");
      }
    }

    for (const ped of peds) {
      if (!ped.dead && ped.kind === "dealer" && ped.ring) ped.ring.visible = side?.kind === "debt" && side.pedId === ped.id;
    }

    maintain(dt);
  }

  function animateLimbs(limbs: Limbs, phase: number, amount: number) {
    limbs.legL.rotation.x = Math.sin(phase) * amount;
    limbs.legR.rotation.x = Math.sin(phase + Math.PI) * amount;
    limbs.armL.rotation.x = Math.sin(phase + Math.PI) * amount * 0.8;
    limbs.armR.rotation.x = Math.sin(phase) * amount * 0.8;
  }

  function render(dt: number) {
    const phase = useGame.getState().phase;
    const sun = sunFactor();
    const fog = scene.fog as THREE.FogExp2;
    const nightCol = new THREE.Color(0x0c1018);
    const dawnCol = new THREE.Color(0x6a4032);
    fog.color.copy(nightCol).lerp(dawnCol, sun * 0.85);
    (scene.background as THREE.Color).copy(new THREE.Color(0x090b12)).lerp(new THREE.Color(0x8a5844), sun * 0.7);
    if (waterTime) waterTime.value += dt;

    playerLimbs.group.visible = phase === "play" && !vehicle && !boarded;
    playerLimbs.group.position.set(player.x, 0, player.z);
    playerLimbs.group.rotation.x = 0;
    playerLimbs.group.rotation.y = player.yaw;
    const moving = Math.hypot(player.vx, player.vz) > 0.4;
    if (swipe > 0) playerLimbs.armR.rotation.x = -1.5;
    else animateLimbs(playerLimbs, walkPhase, moving ? 0.7 : 0);

    for (const ped of peds) {
      if (ped.dead) continue;
      ped.limbs.group.position.set(ped.x, 0, ped.z);
      ped.limbs.group.rotation.y = ped.yaw;
      ped.limbs.group.rotation.x = 0;
      const bob = Math.sin(performance.now() * 0.008 + ped.id) * 0.55;
      animateLimbs(ped.limbs, bob, ped.flee > 0 || ped.kind === "cop" ? 0.65 : 0.45);
      if (ped.ring) ped.ring.rotation.z += dt * 1.6;
    }
    for (const car of cars) {
      car.mesh.position.set(car.x, 0, car.z);
      car.mesh.rotation.y = car.yaw;
      const bar = car.mesh.getObjectByName("lightbar");
      if (bar instanceof THREE.Mesh && bar.material instanceof THREE.MeshBasicMaterial) {
        const flash = Math.sin(performance.now() * 0.02) > 0;
        bar.material.color.setHex(car.ai || heat > 0 ? (flash ? 0xd1233c : 0x2a4f96) : 0x2a4f96);
      }
    }
    streetcar.position.set(city.streetcar.x, 0, tramZ);
    streetcar.rotation.y = tramDir > 0 ? Math.PI : 0;
    for (const drop of drops) {
      drop.mesh.position.y = 0.45 + Math.sin(performance.now() * 0.006) * 0.08;
      drop.mesh.rotation.y += dt * 2;
    }
    for (const vial of vials) {
      if (!vial.mesh.visible) continue;
      vial.mesh.position.y = 0.7 + Math.sin(performance.now() * 0.004 + vial.x) * 0.1;
      vial.mesh.rotation.y += dt;
    }
    dockBeam.visible = mission === 1;
    dockBeam.rotation.y += dt * 0.4;
    if (side?.kind === "rush") {
      rushBeam.visible = true;
      rushBeam.position.set(side.x, 0, side.z);
      rushBeam.rotation.y += dt * 0.6;
    } else rushBeam.visible = false;

    for (let i = 0; i < PARTS; i++) {
      const p = parts[i];
      if (!p || p.life <= 0) {
        partPos[i * 3] = 0;
        partPos[i * 3 + 1] = -10;
        partPos[i * 3 + 2] = 0;
        continue;
      }
      p.life -= dt;
      p.vy -= 6 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      partPos[i * 3] = p.x;
      partPos[i * 3 + 1] = p.y;
      partPos[i * 3 + 2] = p.z;
      partCol[i * 3] = p.r;
      partCol[i * 3 + 1] = p.g;
      partCol[i * 3 + 2] = p.b;
    }
    partGeo.attributes.position!.needsUpdate = true;
    partGeo.attributes.color!.needsUpdate = true;

    const w = view.clientWidth || 1;
    const h = view.clientHeight || 1;
    if (view.width !== Math.floor(w * renderer.getPixelRatio()) || camera.aspect !== w / Math.max(1, h)) {
      renderer.setSize(w, h, false);
      camera.aspect = w / Math.max(1, h);
      camera.updateProjectionMatrix();
    }

    if (phase === "menu" || phase === "dead") {
      menuAng += dt * (phase === "dead" ? 0.25 : 0.12);
      const focusX = phase === "dead" ? player.x : city.start.x;
      const focusZ = phase === "dead" ? player.z : city.start.z;
      const rad = phase === "dead" ? 9 : 24;
      camera.position.set(focusX + Math.sin(menuAng) * rad, phase === "dead" ? 5 : 13, focusZ + Math.cos(menuAng) * rad);
      camera.lookAt(focusX, 1.4, focusZ);
    } else if (phase === "play" || phase === "pause") {
      orbitHold = Math.max(0, orbitHold - dt);
      if (orbitHold <= 0) camYaw += wrap(player.yaw - camYaw) * (1 - Math.exp(-3.2 * dt));
      const dist = vehicle ? 9.4 : 7.1;
      const height = vehicle ? 3.5 : 3.05;
      const fx = -Math.sin(camYaw);
      const fz = -Math.cos(camYaw);
      let desiredX = player.x - fx * dist;
      let desiredZ = player.z - fz * dist;
      const steps = 8;
      for (let i = 1; i <= steps; i++) {
        const t = i / steps;
        const sx = player.x + (desiredX - player.x) * t;
        const sz = player.z + (desiredZ - player.z) * t;
        let blocked = false;
        for (const b of city.colliders) {
          if (sx > b.minx - 0.3 && sx < b.maxx + 0.3 && sz > b.minz - 0.3 && sz < b.maxz + 0.3) {
            blocked = true;
            break;
          }
        }
        if (blocked) {
          const k = Math.max(0.18, (i - 1) / steps);
          desiredX = player.x + (desiredX - player.x) * k;
          desiredZ = player.z + (desiredZ - player.z) * k;
          break;
        }
      }
      const k = 1 - Math.exp(-7 * dt);
      camera.position.x += (desiredX - camera.position.x) * k;
      camera.position.y += (height - camera.position.y) * k;
      camera.position.z += (desiredZ - camera.position.z) * k;
      if (!reduce) {
        shake = Math.max(0, shake - dt * 1.6);
        camera.position.x += (rng() - 0.5) * shake;
        camera.position.y += (rng() - 0.5) * shake * 0.6;
      }
      camera.lookAt(player.x, 1.25, player.z);
    }

    renderer.render(scene, camera);
    drawMap(mini, false);
    if (useGame.getState().mapOpen) drawMap(big, true);

    const nearestCop = living("cop").reduce((acc, c) => Math.min(acc, Math.hypot(c.x - player.x, c.z - player.z)), 99);
    if (phase === "play") {
      setMuted(useGame.getState().muted);
      mixFrame({
        speed: vehicle ? vehicle.speed : 0,
        inCar: Boolean(vehicle),
        station,
        heat,
        lowBlood: blood < 28,
        copDist: nearestCop,
      });
    }

    hudAcc += dt;
    if (hudAcc > 0.08 || phase !== wasPhase) {
      hudAcc = 0;
      const tgt = targetOf();
      let arrow: number | null = null;
      if (tgt && phase === "play") {
        const dx = tgt.x - player.x;
        const dz = tgt.z - player.z;
        const dist = Math.hypot(dx, dz) || 1;
        const fwdX = -Math.sin(camYaw);
        const fwdZ = -Math.cos(camYaw);
        const rightX = Math.cos(camYaw);
        const rightZ = -Math.sin(camYaw);
        const sx = (dx * rightX + dz * rightZ) / dist;
        const sy = (dx * fwdX + dz * fwdZ) / dist;
        if (dist > 10 && sy < 0.72) arrow = Math.atan2(sx, sy);
      }
      const obj = objectiveText();
      const distLeft = tgt ? Math.round(Math.hypot(tgt.x - player.x, tgt.z - player.z)) : null;
      useGame.getState().patch({
        health,
        blood,
        cash,
        heat,
        clock: clockLabel(clockMin),
        objective: distLeft != null && mission < 4 ? `${obj}  ·  ${distLeft}m` : obj,
        missionTitle: mission < MISSIONS.length ? MISSIONS[mission]!.title : "Free Parish",
        prompt: phase === "play" ? (biteT > 0.05 ? "Feeding…" : promptFor()) : "",
        banner,
        scanner,
        radio: vehicle && (radioT > 0 || true) ? RADIO[station]! : "",
        inCar: Boolean(vehicle) || boarded,
        speedMph: vehicle ? Math.round(Math.abs(vehicle.speed) * 2.237) : 0,
        lowBlood: blood < 28,
        sun,
        vignette,
        district: districtAt(player.x, player.z),
        night,
        fed,
        bestCash: Math.max(best, cash),
        deathReason,
        missionsCleared: Math.min(mission, MISSIONS.length),
        arrow,
        popup,
      });
    }
  }

  function drawMap(canvas: HTMLCanvasElement, full: boolean) {
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const cssW = canvas.clientWidth;
    const cssH = canvas.clientHeight;
    if (cssW < 8 || cssH < 8) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const bw = Math.floor(cssW * dpr);
    const bh = Math.floor(cssH * dpr);
    if (canvas.width !== bw || canvas.height !== bh) {
      canvas.width = bw;
      canvas.height = bh;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cssW, cssH);
    ctx.fillStyle = "#120e14";
    ctx.fillRect(0, 0, cssW, cssH);
    const scale = full ? (Math.min(cssW, cssH) - 24) / Math.max(city.worldX1, city.worldZ1) : 2.05;
    const px = full ? city.worldX1 / 2 : player.x;
    const pz = full ? city.worldZ1 / 2 : player.z;
    const toX = (x: number) => cssW / 2 + (x - px) * scale;
    const toY = (z: number) => cssH / 2 + (z - pz) * scale;
    ctx.save();
    ctx.beginPath();
    ctx.rect(6, 6, cssW - 12, cssH - 12);
    ctx.clip();
    ctx.fillStyle = "#16303a";
    ctx.fillRect(toX(-30), toY(-20), 52 * scale, (city.worldZ1 + 40) * scale);
    for (const b of city.blocks) {
      ctx.fillStyle =
        b.kind === "tombs" ? "#2c332c" : b.kind === "bourbon" ? "#3a2430" : b.kind === "square" ? "#3a342c" : "#241820";
      ctx.fillRect(toX(b.x0), toY(b.z0), (b.x1 - b.x0) * scale, (b.z1 - b.z0) * scale);
    }
    ctx.strokeStyle = "#3a3340";
    ctx.lineWidth = 2;
    ctx.strokeRect(toX(0), toY(0), city.worldX1 * scale, city.worldZ1 * scale);
    const tgt = targetOf();
    if (tgt) {
      ctx.fillStyle = "#e2b15a";
      ctx.beginPath();
      ctx.arc(toX(tgt.x), toY(tgt.z), full ? 5 : 4, 0, Math.PI * 2);
      ctx.fill();
    }
    for (const cop of living("cop")) {
      ctx.fillStyle = "#d1233c";
      ctx.fillRect(toX(cop.x) - 2, toY(cop.z) - 2, 4, 4);
    }
    ctx.fillStyle = "#1f6b48";
    ctx.fillRect(toX(city.streetcar.x) - 2, toY(tramZ) - 6, 4, 12);
    ctx.translate(toX(player.x), toY(player.z));
    ctx.rotate(-player.yaw);
    ctx.fillStyle = "#f4ead8";
    ctx.beginPath();
    ctx.moveTo(0, -7);
    ctx.lineTo(5, 6);
    ctx.lineTo(-5, 6);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  window.__controlsTest = {
    getYaw: () => player.yaw,
    getSpeed: () => Math.hypot(player.vx, player.vz),
    setKeys: (codes: string[]) => {
      keys.clear();
      for (const code of codes) keys.add(code);
    },
    setSteer: (v: number) => {
      probeSteer = v;
      steerOverride = true;
    },
  };
  window.__parish = {
    attack: () => {
      attackPulse = true;
    },
    setUse: (held: boolean) => {
      if (held && !useHeld) usePulse = true;
      useHeld = held;
    },
    setMove: (x: number, y: number) => {
      moveX = x;
      moveY = y;
    },
    setSprint: (held: boolean) => {
      sprintHeld = held;
    },
    addYaw: (delta: number) => {
      camYaw -= delta;
      orbitHold = 1.15;
    },
  };

  if (seenSave && mission > 0) {
    banner = "You wake hungry. The parish remembers.";
    bannerT = 3.5;
  }
  useGame.getState().patch({ bestCash: best, night, fed, cash, missionsCleared: mission });

  const timer = new THREE.Timer();
  timer.connect(document);
  renderer.setAnimationLoop((stamp) => {
    timer.update(stamp);
    const frameDt = Math.min(timer.getDelta(), 0.05);
    const phase = useGame.getState().phase;
    if (wasPhase === "dead" && phase === "play") respawn();
    wasPhase = phase;

    if (phase === "play") {
      const useEdge = (keys.has("KeyF") && !prev.has("KeyF")) || usePulse;
      const attackEdge = (keys.has("Space") && !prev.has("Space")) || (keys.has("KeyJ") && !prev.has("KeyJ")) || attackPulse;
      const radioEdge = keys.has("KeyR") && !prev.has("KeyR");
      const mapEdge = keys.has("KeyM") && !prev.has("KeyM");
      const pauseEdge = (keys.has("Escape") && !prev.has("Escape")) || (keys.has("KeyP") && !prev.has("KeyP"));
      usePulse = false;
      attackPulse = false;
      if (mapEdge) useGame.getState().toggleMap();
      if (pauseEdge) useGame.getState().setPhase("pause");
      simAcc += frameDt;
      if (simAcc > 0.2) simAcc = 0.2;
      let first = true;
      let guard = 0;
      while (simAcc >= STEP && guard++ < 6) {
        sim(STEP, first && useEdge, first && attackEdge, first && radioEdge);
        first = false;
        simAcc -= STEP;
      }
    } else if (phase === "pause") {
      const pauseEdge = (keys.has("Escape") && !prev.has("Escape")) || (keys.has("KeyP") && !prev.has("KeyP"));
      if (pauseEdge) useGame.getState().setPhase("play");
      simAcc = 0;
    } else {
      simAcc = 0;
    }
    prev.clear();
    for (const code of keys) prev.add(code);
    render(frameDt);
    saveAcc += frameDt;
    if (saveAcc > 12) {
      saveAcc = 0;
      save();
    }
  });

  return () => {
    renderer.setAnimationLoop(null);
    timer.disconnect();
    window.removeEventListener("keydown", onKeyDown);
    window.removeEventListener("keyup", onKeyUp);
    window.removeEventListener("blur", onBlur);
    view.removeEventListener("contextmenu", onContext);
    view.removeEventListener("pointerdown", onPointerDown);
    window.removeEventListener("pointerup", onPointerUp);
    window.removeEventListener("pointermove", onPointerMove);
    document.removeEventListener("visibilitychange", onVis);
    delete window.__controlsTest;
    delete window.__parish;
    renderer.dispose();
    renderer.forceContextLoss();
  };
}
