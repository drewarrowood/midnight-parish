import * as THREE from "three";

const matCache = new Map<number, THREE.MeshLambertMaterial>();
const basicCache = new Map<number, THREE.MeshBasicMaterial>();
const box = new THREE.BoxGeometry(1, 1, 1);
const headGeo = new THREE.SphereGeometry(0.16, 10, 8);
const wheelGeo = new THREE.CylinderGeometry(0.32, 0.32, 0.24, 10);

function lambert(color: number) {
  let mat = matCache.get(color);
  if (!mat) {
    mat = new THREE.MeshLambertMaterial({ color });
    matCache.set(color, mat);
  }
  return mat;
}

function basic(color: number) {
  let mat = basicCache.get(color);
  if (!mat) {
    mat = new THREE.MeshBasicMaterial({ color });
    basicCache.set(color, mat);
  }
  return mat;
}

function solid(
  parent: THREE.Object3D,
  x: number,
  y: number,
  z: number,
  w: number,
  h: number,
  d: number,
  color: number,
  unlit = false,
) {
  const mesh = new THREE.Mesh(box, unlit ? basic(color) : lambert(color));
  mesh.scale.set(w, h, d);
  mesh.position.set(x, y, z);
  parent.add(mesh);
  return mesh;
}

function limb(
  parent: THREE.Object3D,
  x: number,
  y: number,
  z: number,
  w: number,
  h: number,
  d: number,
  color: number,
) {
  const pivot = new THREE.Group();
  pivot.position.set(x, y, z);
  const mesh = new THREE.Mesh(box, lambert(color));
  mesh.scale.set(w, h, d);
  mesh.position.y = -h / 2;
  pivot.add(mesh);
  parent.add(pivot);
  return pivot;
}

export type PersonKind = "civil" | "cop" | "mark" | "rival" | "collector" | "thug" | "dealer";

export type PersonParts = {
  armL: THREE.Group;
  armR: THREE.Group;
  legL: THREE.Group;
  legR: THREE.Group;
};

export function makePerson(kind: PersonKind, shirt: number) {
  const g = new THREE.Group();
  const pale = kind === "rival" || kind === "collector";
  const skin = pale ? 0xe4d0c0 : 0xc9a88a;
  const pants = kind === "cop" ? 0x1c2430 : kind === "dealer" ? 0x241c14 : 0x2a241e;
  const torsoColor =
    kind === "cop" ? 0x24324a : kind === "rival" ? 0x2a101c : kind === "collector" ? 0x6a5a48 : shirt;
  const legL = limb(g, -0.11, 0.86, 0, 0.16, 0.82, 0.18, pants);
  const legR = limb(g, 0.11, 0.86, 0, 0.16, 0.82, 0.18, pants);
  const coatH = kind === "rival" || kind === "collector" ? 0.78 : 0.52;
  solid(g, 0, kind === "rival" ? 1.16 : 1.22, 0, kind === "collector" ? 0.56 : 0.46, coatH, 0.26, torsoColor);
  const armL = limb(g, -0.32, 1.38, 0, 0.13, 0.5, 0.14, torsoColor);
  const armR = limb(g, 0.32, 1.38, 0, 0.13, 0.5, 0.14, torsoColor);
  const head = new THREE.Mesh(headGeo, lambert(skin));
  head.position.set(0, 1.66, 0);
  g.add(head);
  solid(g, 0, 1.84, 0.01, 0.3, 0.12, 0.28, pale ? 0x111111 : 0x24180f);
  const eye = pale || kind === "thug" ? 0xff2244 : 0x161616;
  solid(g, -0.06, 1.68, -0.13, 0.045, 0.04, 0.03, eye, eye !== 0x161616);
  solid(g, 0.06, 1.68, -0.13, 0.045, 0.04, 0.03, eye, eye !== 0x161616);
  if (kind === "cop") {
    solid(g, 0, 1.92, 0, 0.34, 0.08, 0.34, 0x1a1e24);
    solid(g, 0, 2.0, 0, 0.22, 0.1, 0.22, 0x24324a);
  } else if (kind === "mark") {
    solid(g, 0.22, 1.28, -0.12, 0.16, 0.12, 0.1, 0x222222);
    solid(g, 0, 1.96, 0, 0.34, 0.08, 0.34, 0xf2efe6);
  } else if (kind === "collector") {
    solid(g, 0, 1.98, 0, 0.46, 0.08, 0.46, 0x1a120c);
    solid(g, 0, 2.08, -0.08, 0.5, 0.06, 0.22, 0x1a120c);
  } else if (kind === "dealer") {
    solid(g, 0, 1.34, -0.14, 0.22, 0.06, 0.06, 0xe2b15a);
  }
  if (kind === "rival") g.scale.setScalar(1.12);
  if (kind === "collector") g.scale.setScalar(1.08);
  g.userData.parts = { armL, armR, legL, legR } satisfies PersonParts;
  return g;
}

export function makeVampire() {
  const g = new THREE.Group();
  const coat = 0x121216;
  const legL = limb(g, -0.11, 0.9, 0, 0.16, 0.86, 0.18, 0x1a1a1e);
  const legR = limb(g, 0.11, 0.9, 0, 0.16, 0.86, 0.18, 0x1a1a1e);
  solid(g, 0, 1.18, 0, 0.5, 0.7, 0.28, coat);
  solid(g, 0, 1.05, -0.08, 0.22, 0.5, 0.08, 0x2a1218);
  const armL = limb(g, -0.34, 1.42, 0, 0.14, 0.56, 0.14, coat);
  const armR = limb(g, 0.34, 1.42, 0, 0.14, 0.56, 0.14, coat);
  const head = new THREE.Mesh(headGeo, lambert(0xe7d7c8));
  head.position.set(0, 1.7, 0);
  g.add(head);
  solid(g, 0, 1.88, -0.02, 0.32, 0.14, 0.3, 0x0e0e10);
  solid(g, -0.06, 1.72, -0.14, 0.05, 0.035, 0.03, 0xff2244, true);
  solid(g, 0.06, 1.72, -0.14, 0.05, 0.035, 0.03, 0xff2244, true);
  g.userData.parts = { armL, armR, legL, legR } satisfies PersonParts;
  return g;
}

export function posePerson(g: THREE.Group, time: number, moving: boolean, dead: boolean, attack: number) {
  const parts = g.userData.parts as PersonParts | undefined;
  if (!parts) return;
  if (dead) {
    g.rotation.x = -Math.PI * 0.5;
    g.position.y = 0.22;
    parts.armL.rotation.x = 0.5;
    parts.armR.rotation.x = 0.2;
    parts.legL.rotation.x = 0.1;
    parts.legR.rotation.x = -0.15;
    return;
  }
  g.rotation.x = 0;
  g.position.y = moving ? Math.abs(Math.sin(time * 10)) * 0.05 : 0;
  const swing = moving ? Math.sin(time * 9) : 0;
  parts.legL.rotation.x = swing * 0.7;
  parts.legR.rotation.x = -swing * 0.7;
  parts.armL.rotation.x = -swing * 0.5;
  parts.armR.rotation.x = attack > 0 ? -1.25 * attack : swing * 0.5;
}

export type CarStyle = "sedan" | "coupe" | "taxi" | "van" | "beater" | "cop";

export function makeCar(style: CarStyle, paint: number) {
  const g = new THREE.Group();
  const wheels: THREE.Group[] = [];
  if (style === "van") {
    solid(g, 0, 1.05, 0, 1.92, 1.2, 4.5, paint);
    solid(g, 0, 1.15, -1.45, 1.7, 0.7, 1.15, 0x9bb4c4);
  } else if (style === "coupe") {
    solid(g, 0, 0.66, 0.05, 1.78, 0.4, 4.05, paint);
    solid(g, 0, 1.05, 0.05, 1.5, 0.36, 1.55, 0x8eacbc);
  } else {
    solid(g, 0, 0.74, 0.05, 1.84, 0.5, 4.35, paint);
    solid(g, 0, 1.18, 0.12, 1.56, 0.42, 1.85, style === "cop" ? 0xd5dde4 : 0x8eacbc);
  }
  if (style === "cop") {
    solid(g, 0, 0.86, 0.05, 1.86, 0.16, 4.2, 0x1a2744);
    solid(g, 0, 1.5, 0.05, 0.7, 0.12, 1.15, 0x161616);
    solid(g, -0.18, 1.64, 0.05, 0.26, 0.14, 0.28, 0xff2430, true);
    solid(g, 0.18, 1.64, 0.05, 0.26, 0.14, 0.28, 0x2a62ff, true);
  } else if (style === "taxi") {
    solid(g, 0, 1.5, 0.1, 0.5, 0.16, 0.7, 0xf2c14e);
  } else if (style === "beater") {
    solid(g, 0.7, 0.95, 0.4, 0.28, 0.22, 0.4, 0x5c534c);
  }
  solid(g, -0.62, 0.7, -2.12, 0.28, 0.14, 0.08, 0xfff1c4, true);
  solid(g, 0.62, 0.7, -2.12, 0.28, 0.14, 0.08, 0xfff1c4, true);
  solid(g, -0.64, 0.68, 2.16, 0.26, 0.14, 0.08, 0xff2a2a, true);
  solid(g, 0.64, 0.68, 2.16, 0.26, 0.14, 0.08, 0xff2a2a, true);
  const spots: [number, number, number][] = [
    [-0.82, 0.32, -1.38],
    [0.82, 0.32, -1.38],
    [-0.82, 0.32, 1.35],
    [0.82, 0.32, 1.35],
  ];
  for (const [x, y, z] of spots) {
    const pivot = new THREE.Group();
    pivot.position.set(x, y, z);
    const w = new THREE.Mesh(wheelGeo, lambert(0x161616));
    w.rotation.z = Math.PI / 2;
    pivot.add(w);
    solid(pivot, 0, 0, 0, 0.12, 0.12, 0.28, 0xc8c2b8);
    g.add(pivot);
    wheels.push(pivot);
  }
  g.userData.wheels = wheels;
  return g;
}

export function makeStreetcar() {
  const g = new THREE.Group();
  solid(g, 0, 1.45, 0, 2.5, 2.15, 9.4, 0x1d4a32);
  solid(g, 0, 2.65, 0, 2.7, 0.28, 9.7, 0xd8c7a2);
  solid(g, 0, 1.7, 0, 2.15, 0.7, 7.4, 0xf3e2b0, true);
  solid(g, 0, 2.95, 0, 0.12, 0.7, 0.12, 0xd8c7a2);
  solid(g, 0, 3.3, 0, 1.4, 0.08, 0.08, 0xd8c7a2);
  solid(g, -0.7, 0.45, -2.6, 0.28, 0.28, 0.28, 0x161616);
  solid(g, 0.7, 0.45, -2.6, 0.28, 0.28, 0.28, 0x161616);
  solid(g, -0.7, 0.45, 2.6, 0.28, 0.28, 0.28, 0x161616);
  solid(g, 0.7, 0.45, 2.6, 0.28, 0.28, 0.28, 0x161616);
  return g;
}

export function spinWheels(g: THREE.Group, deltaSpin: number) {
  const wheels = g.userData.wheels as THREE.Group[] | undefined;
  if (!wheels) return;
  for (const w of wheels) w.rotation.x += deltaSpin;
}
