import * as THREE from "three";

export const RIVER = 22;
export const BLOCK = 36;
export const STREET = 14;
export const GAP = BLOCK + STREET;
export const COLS = 4;
export const ROWS = 4;

export type AABB = { minx: number; maxx: number; minz: number; maxz: number };
export type BlockKind =
  | "docks"
  | "square"
  | "quarter"
  | "bourbon"
  | "tombs"
  | "shotgun"
  | "garden"
  | "crypt"
  | "warehouse";

export const BLOCKS: BlockKind[][] = [
  ["docks", "square", "bourbon", "tombs"],
  ["docks", "quarter", "bourbon", "quarter"],
  ["warehouse", "quarter", "quarter", "shotgun"],
  ["warehouse", "garden", "garden", "crypt"],
];

const DISTRICT = [
  ["The Wharf", "Jackson Square", "Bourbon Street", "St. Louis No. 1"],
  ["Picayune Dock", "Royal Street", "Bourbon Street", "The Lower Quarter"],
  ["Cotton Warehouses", "Chartres", "The Quarter", "Shotgun Row"],
  ["The Levee", "Garden District", "Magazine Street", "Lafayette Crypt"],
];

const PLASTER = [0xf3e0c4, 0xe7b39a, 0xd7e0cf, 0xf0d78c, 0xc96b5a, 0x9eb8c4, 0xefe8da, 0x6f8f78, 0xe8c4b0, 0xc45c74];

export type City = {
  group: THREE.Group;
  colliders: AABB[];
  phones: { x: number; z: number }[];
  vials: { x: number; z: number }[];
  carSpawns: { x: number; z: number; yaw: number }[];
  pedPaths: { x: number; z: number }[][];
  crypt: { x: number; z: number };
  start: { x: number; z: number; yaw: number };
  docks: { x: number; z: number };
  cemetery: { x: number; z: number };
  collector: { x: number; z: number };
  bourbon: { x: number; z: number };
  streetcar: { x: number; z0: number; z1: number };
  blocks: { x0: number; z0: number; x1: number; z1: number; kind: BlockKind }[];
  worldX1: number;
  worldZ1: number;
};

export function streetX(i: number) {
  return RIVER + i * GAP + STREET / 2;
}
export function streetZ(j: number) {
  return j * GAP + STREET / 2;
}
export function blockRect(c: number, r: number) {
  const x0 = RIVER + STREET + c * GAP;
  const z0 = STREET + r * GAP;
  return { x0, z0, x1: x0 + BLOCK, z1: z0 + BLOCK, cx: x0 + BLOCK / 2, cz: z0 + BLOCK / 2 };
}

export function districtAt(x: number, z: number) {
  if (x < RIVER + 2) return "The Mississippi";
  const c = Math.floor((x - RIVER - STREET) / GAP);
  const r = Math.floor((z - STREET) / GAP);
  if (r < 0 || c < 0 || r >= ROWS || c >= COLS) return "The Levee";
  return DISTRICT[r]![c]!;
}

export function makeRng(seed = 1991) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

class Bucket {
  pos: number[] = [];
  nor: number[] = [];
  col: number[] = [];

  addBox(cx: number, cy: number, cz: number, w: number, h: number, d: number, color: number) {
    const hx = w / 2;
    const hy = h / 2;
    const hz = d / 2;
    const r = ((color >> 16) & 255) / 255;
    const g = ((color >> 8) & 255) / 255;
    const b = (color & 255) / 255;
    const faces: { n: number[]; v: number[][] }[] = [
      { n: [1, 0, 0], v: [[hx, -hy, hz], [hx, -hy, -hz], [hx, hy, -hz], [hx, hy, hz]] },
      { n: [-1, 0, 0], v: [[-hx, -hy, -hz], [-hx, -hy, hz], [-hx, hy, hz], [-hx, hy, -hz]] },
      { n: [0, 1, 0], v: [[-hx, hy, hz], [hx, hy, hz], [hx, hy, -hz], [-hx, hy, -hz]] },
      { n: [0, -1, 0], v: [[-hx, -hy, -hz], [hx, -hy, -hz], [hx, -hy, hz], [-hx, -hy, hz]] },
      { n: [0, 0, 1], v: [[hx, -hy, hz], [-hx, -hy, hz], [-hx, hy, hz], [hx, hy, hz]] },
      { n: [0, 0, -1], v: [[-hx, -hy, -hz], [hx, -hy, -hz], [hx, hy, -hz], [-hx, hy, -hz]] },
    ];
    for (const f of faces) {
      const vs = f.v;
      for (const idx of [0, 1, 2, 0, 2, 3]) {
        const p = vs[idx]!;
        this.pos.push(p[0]! + cx, p[1]! + cy, p[2]! + cz);
        this.nor.push(f.n[0]!, f.n[1]!, f.n[2]!);
        this.col.push(r, g, b);
      }
    }
  }

  mesh(material: THREE.Material) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(this.pos, 3));
    geometry.setAttribute("normal", new THREE.Float32BufferAttribute(this.nor, 3));
    geometry.setAttribute("color", new THREE.Float32BufferAttribute(this.col, 3));
    return new THREE.Mesh(geometry, material);
  }
}

function shade(hex: number, m: number) {
  const r = Math.min(255, Math.max(0, Math.round(((hex >> 16) & 255) * m)));
  const g = Math.min(255, Math.max(0, Math.round(((hex >> 8) & 255) * m)));
  const b = Math.min(255, Math.max(0, Math.round((hex & 255) * m)));
  return (r << 16) | (g << 8) | b;
}

type Win = { x: number; y: number; z: number; axis: "x" | "z"; lit: boolean };

function signTexture(text: string, bg: string, fg: string) {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 160;
  const g = canvas.getContext("2d")!;
  g.fillStyle = bg;
  g.fillRect(0, 0, 512, 160);
  g.strokeStyle = fg;
  g.lineWidth = 10;
  g.strokeRect(12, 12, 488, 136);
  g.fillStyle = fg;
  g.font = "700 72px sans-serif";
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillText(text, 256, 84);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function addSign(parent: THREE.Group, text: string, x: number, y: number, z: number, yaw: number, bg: string, fg: string) {
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(4.4, 1.35),
    new THREE.MeshBasicMaterial({ map: signTexture(text, bg, fg), side: THREE.DoubleSide }),
  );
  mesh.position.set(x, y, z);
  mesh.rotation.y = yaw;
  parent.add(mesh);
}

export function buildCity(): City {
  const rng = makeRng(1991);
  const bucket = new Bucket();
  const colliders: AABB[] = [];
  const wins: Win[] = [];
  const group = new THREE.Group();
  const phones: { x: number; z: number }[] = [];
  const vials: { x: number; z: number }[] = [];
  const blocks: City["blocks"] = [];

  const worldX1 = RIVER + STREET + COLS * GAP;
  const worldZ1 = STREET + ROWS * GAP;

  bucket.addBox((worldX1 + RIVER) / 2, -0.2, worldZ1 / 2, worldX1 - RIVER + 30, 0.4, worldZ1 + 40, 0x4e463f);
  bucket.addBox(-16, -0.55, worldZ1 / 2, 80, 0.5, worldZ1 + 80, 0x102028);

  const addSolid = (x0: number, z0: number, x1: number, z1: number) => {
    colliders.push({ minx: x0, maxx: x1, minz: z0, maxz: z1 });
  };

  const windowsFor = (x0: number, z0: number, w: number, d: number, floors: number) => {
    const nx = Math.max(2, Math.floor(w / 3.4));
    const nz = Math.max(2, Math.floor(d / 3.4));
    for (let f = 0; f < floors; f++) {
      const y = 1.45 + f * 3.15;
      for (let i = 0; i < nx; i++) {
        const x = x0 + ((i + 0.5) * w) / nx;
        const litS = rng() > 0.38;
        const litN = rng() > 0.5;
        wins.push({ x, y, z: z0 + d + 0.08, axis: "z", lit: litS });
        wins.push({ x, y, z: z0 - 0.08, axis: "z", lit: litN });
      }
      for (let i = 0; i < nz; i++) {
        const z = z0 + ((i + 0.5) * d) / nz;
        wins.push({ x: x0 + w + 0.08, y, z, axis: "x", lit: rng() > 0.42 });
        wins.push({ x: x0 - 0.08, y, z, axis: "x", lit: rng() > 0.55 });
      }
    }
  };

  const building = (
    x0: number,
    z0: number,
    w: number,
    d: number,
    floors: number,
    color: number,
    balcony: "n" | "s" | "e" | "w" | null,
  ) => {
    const h = floors * 3.15;
    const cx = x0 + w / 2;
    const cz = z0 + d / 2;
    bucket.addBox(cx, h / 2, cz, w, h, d, color);
    bucket.addBox(cx, 0.4, cz, w + 0.08, 0.8, d + 0.08, shade(color, 0.62));
    bucket.addBox(cx, h + 0.15, cz, w + 0.35, 0.3, d + 0.35, 0x2c2826);
    addSolid(x0, z0, x0 + w, z0 + d);
    windowsFor(x0, z0, w, d, floors);
    if (!balcony) return;
    const ext = 1.15;
    const by = 3.2;
    let bx = cx;
    let bz = cz;
    let bw = w * 0.7;
    let bd = d * 0.7;
    if (balcony === "s") {
      bz = z0 + d + ext / 2;
      bd = ext;
    }
    if (balcony === "n") {
      bz = z0 - ext / 2;
      bd = ext;
    }
    if (balcony === "e") {
      bx = x0 + w + ext / 2;
      bw = ext;
    }
    if (balcony === "w") {
      bx = x0 - ext / 2;
      bw = ext;
    }
    bucket.addBox(bx, by, bz, bw, 0.1, bd, 0x3a332e);
    bucket.addBox(bx, by + 0.5, bz, bw, 0.06, bd, 0x1a1c1e);
    const beads = [0x7a1f8a, 0xe2b15a, 0x1f7a4a, 0xd1233c, 0xf4ead8];
    for (let i = 0; i < 5; i++) {
      bucket.addBox(bx - bw / 2 + ((i + 0.5) * bw) / 5, by + 0.62, bz, 0.16, 0.16, 0.16, beads[i % beads.length]!);
    }
  };

  const quarterBlock = (c: number, r: number, bourbon: boolean) => {
    const b = blockRect(c, r);
    const alley = 7.5;
    const t = (BLOCK - alley) / 2;
    const spots: { x: number; z: number; face: "n" | "s" | "e" | "w" }[] = [
      { x: b.x0, z: b.z0, face: "n" },
      { x: b.x0 + t + alley, z: b.z0, face: "n" },
      { x: b.x0, z: b.z0 + t + alley, face: "s" },
      { x: b.x0 + t + alley, z: b.z0 + t + alley, face: "s" },
    ];
    spots.forEach((s, i) => {
      const floors = 2 + ((c + r + i) % 2);
      const color = PLASTER[Math.floor(rng() * PLASTER.length)]!;
      const face = bourbon && (i === 1 || i === 3) ? "e" : s.face;
      building(s.x, s.z, t - 0.4, t - 0.4, floors, color, face);
    });
    if (bourbon) {
      addSign(group, iSign(c, r), b.x1 + 0.4, 4.4, b.cz - 6, Math.PI / 2, "#14080c", "#ff4d6a");
      addSign(group, jSign(c, r), b.x1 + 0.4, 3.3, b.cz + 6, Math.PI / 2, "#10140c", "#e2b15a");
    }
  };

  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const kind = BLOCKS[r]![c]!;
      const b = blockRect(c, r);
      blocks.push({ x0: b.x0, z0: b.z0, x1: b.x1, z1: b.z1, kind });
      if (kind === "quarter" || kind === "bourbon") quarterBlock(c, r, kind === "bourbon");
      else if (kind === "docks") {
        building(b.x0 + 1, b.z0 + 1, BLOCK - 2, 12, 2, 0x6e5a48, null);
        building(b.x0 + 1, b.z0 + 20, BLOCK - 2, 14, 1, 0x5c4e42, null);
        const pierZ = b.cz;
        bucket.addBox(8, 0.35, pierZ, 24, 0.35, 4.2, 0x6a5644);
        addSolid(0, pierZ - 2.1, RIVER - 1, pierZ + 2.1);
        for (let p = 0; p < 4; p++) bucket.addBox(4 + p * 4, 0.9, pierZ - 2.3, 0.35, 1.6, 0.35, 0x3a3028);
      } else if (kind === "warehouse") {
        building(b.x0 + 2, b.z0 + 2, 16, BLOCK - 4, 2, 0x7a6856, null);
        building(b.x0 + 20, b.z0 + 4, 14, 22, 3, 0x5a5048, null);
        addSign(group, r === 2 ? "COTTON" : "EXPORT", b.cx, 7.2, b.z0 - 0.2, Math.PI, "#1a120e", "#e2b15a");
      } else if (kind === "square") {
        const chW = BLOCK - 8;
        const chD = 15;
        building(b.x0 + 4, b.z0 + 1.5, chW, chD, 3, 0xe7dcc8, null);
        bucket.addBox(b.cx, 12.5, b.z0 + 6, 5.5, 8, 5.5, 0xefe6d4);
        bucket.addBox(b.cx, 17.2, b.z0 + 6, 0.35, 2.2, 0.35, 0xe2b15a);
        bucket.addBox(b.cx, 18.2, b.z0 + 6, 1.6, 0.28, 0.28, 0xe2b15a);
        bucket.addBox(b.cx + 4, 1.2, b.cz + 6, 3.2, 2.4, 3.2, 0xc8b48a);
        bucket.addBox(b.cx + 4, 3.1, b.cz + 6, 1.2, 2.2, 0.8, 0xd8c8a0);
        bucket.addBox(b.cx - 6, 0.35, b.cz + 4, 4.5, 0.45, 4.5, 0x8a9094);
        addSign(group, "CATHEDRAL", b.cx, 8.5, b.z0 + chD + 0.3, 0, "#1a120e", "#f4ead8");
      } else if (kind === "tombs") {
        const fence = 0.4;
        const gate = 6;
        addSolid(b.x0, b.z0, b.x1, b.z0 + fence);
        addSolid(b.x0, b.z1 - fence, b.x1, b.z1);
        addSolid(b.x1 - fence, b.z0, b.x1, b.z1);
        addSolid(b.x0, b.z0, b.x0 + fence, b.cz - gate / 2);
        addSolid(b.x0, b.cz + gate / 2, b.x0 + fence, b.z1);
        bucket.addBox(b.cx, 1.15, b.z0 + fence / 2, BLOCK, 2.3, fence, 0x1c1e22);
        bucket.addBox(b.cx, 1.15, b.z1 - fence / 2, BLOCK, 2.3, fence, 0x1c1e22);
        bucket.addBox(b.x1 - fence / 2, 1.15, b.cz, fence, 2.3, BLOCK, 0x1c1e22);
        const northLen = b.cz - gate / 2 - b.z0;
        const southLen = b.z1 - (b.cz + gate / 2);
        bucket.addBox(b.x0 + fence / 2, 1.15, b.z0 + northLen / 2, fence, 2.3, northLen, 0x1c1e22);
        bucket.addBox(b.x0 + fence / 2, 1.15, b.cz + gate / 2 + southLen / 2, fence, 2.3, southLen, 0x1c1e22);
        for (let iz = 0; iz < 5; iz++) {
          for (let ix = 0; ix < 4; ix++) {
            const tx = b.x0 + 5 + ix * 7.4;
            const tz = b.z0 + 4.5 + iz * 6;
            if (Math.hypot(tx - b.cx, tz - b.cz) < 5.5) continue;
            bucket.addBox(tx, 0.9, tz, 1.45, 1.8, 2.2, 0xe6e0d4);
            bucket.addBox(tx, 2.0, tz, 0.16, 0.7, 0.16, 0xf4ead8);
            bucket.addBox(tx, 2.25, tz, 0.7, 0.14, 0.14, 0xf4ead8);
            addSolid(tx - 0.65, tz - 0.95, tx + 0.65, tz + 0.95);
          }
        }
        addSign(group, "NO. 1", b.x0 - 0.35, 2.6, b.cz, -Math.PI / 2, "#141416", "#f4ead8");
      } else if (kind === "shotgun") {
        for (let i = 0; i < 4; i++) {
          const w = 7.2;
          building(b.x0 + 1.2 + i * 8.6, b.z0 + 6, w, 22, 1, PLASTER[(i + 3) % PLASTER.length]!, "s");
        }
      } else if (kind === "garden") {
        building(b.cx - 8, b.cz - 6, 16, 14, 2, PLASTER[(c + 4) % PLASTER.length]!, "s");
        bucket.addBox(b.x0 + 4, 1.6, b.z0 + 5, 0.4, 3.2, 0.4, 0x3e342c);
        bucket.addBox(b.x1 - 4, 1.6, b.z1 - 5, 0.45, 3.4, 0.45, 0x3e342c);
        bucket.addBox(b.x0 + 6, 2.4, b.z1 - 6, 0.4, 4.2, 0.4, 0x3a3228);
      } else if (kind === "crypt") {
        building(b.cx - 5, b.cz - 4, 10, 12, 2, 0xd9d3c6, null);
        bucket.addBox(b.cx, 7.4, b.cz - 4, 0.3, 2.4, 0.3, 0xe2b15a);
        bucket.addBox(b.cx, 8.4, b.cz - 4, 1.4, 0.22, 0.22, 0xe2b15a);
        addSign(group, "CRYPT", b.cx, 4.2, b.z1 + 0.3, 0, "#14110e", "#e2b15a");
      }
    }
  }

  for (let i = 0; i <= COLS; i++) {
    const x = streetX(i);
    bucket.addBox(x, 0.03, worldZ1 / 2, STREET - 3.2, 0.06, worldZ1, 0x24232a);
    for (let z = 8; z < worldZ1; z += 8) {
      bucket.addBox(x, 0.08, z, 0.18, 0.03, 2.4, 0xc9b56a);
    }
    if (i === 0) {
      for (let z = 10; z < worldZ1; z += 6) bucket.addBox(x, 0.09, z, 0.12, 0.02, 3.2, 0x8a8478);
    }
  }
  for (let j = 0; j <= ROWS; j++) {
    const z = streetZ(j);
    bucket.addBox((RIVER + worldX1) / 2, 0.035, z, worldX1 - RIVER, 0.055, STREET - 3.2, 0x24232a);
    for (let x = RIVER + 8; x < worldX1; x += 8) {
      bucket.addBox(x, 0.085, z, 2.4, 0.03, 0.18, 0xc9b56a);
    }
  }

  const lampSpots: { x: number; z: number; gas: boolean }[] = [];
  for (let j = 0; j <= ROWS; j++) {
    for (let i = 0; i <= COLS; i++) {
      const x = streetX(i) + 4.2;
      const z = streetZ(j) + 4.2;
      const gas = i === 2 || i === 1;
      lampSpots.push({ x, z, gas });
      bucket.addBox(x, 1.7, z, 0.18, 3.4, 0.18, gas ? 0x1c2420 : 0x2a241c);
      bucket.addBox(x, 3.5, z, 0.55, 0.18, 0.55, gas ? 0x14302c : 0x3a2a18);
    }
  }

  const names = ["DECATUR", "CHARTRES", "ROYAL", "BOURBON", "RAMPART"];
  names.forEach((name, i) => {
    addSign(group, name, streetX(i) - 3.2, 3.6, 8, 0, "#120e0c", "#f4ead8");
  });
  ["ST. ANN", "DUMAINE", "CANAL", "ST. PETER", "MAGAZINE"].forEach((name, j) => {
    addSign(group, name, worldX1 - 2, 3.5, streetZ(j) + 3, -Math.PI / 2, "#120e0c", "#f4ead8");
  });
  addSign(group, "RIVERFRONT", streetX(0) + 3.4, 3.8, worldZ1 * 0.5, Math.PI / 2, "#102018", "#d7e0cf");
  addSign(group, "DAIQUIRI", streetX(3) - 5, 3.2, streetZ(1), Math.PI / 2, "#1a0a10", "#ff5a78");
  addSign(group, "VIDEO 91", streetX(3) + 5, 2.8, streetZ(2) + 4, -Math.PI / 2, "#101018", "#9fd0ff");
  addSign(group, "VOODOO", blockRect(2, 2).x0 - 0.3, 3.1, blockRect(2, 2).cz, -Math.PI / 2, "#140e18", "#c9a0e0");

  phones.push(
    { x: streetX(3) - 4.6, z: streetZ(1) - 4 },
    { x: streetX(1) + 4.4, z: streetZ(2) },
    { x: streetX(0) + 4.5, z: streetZ(3) },
  );
  for (const p of phones) {
    bucket.addBox(p.x, 0.95, p.z, 0.55, 1.9, 0.55, 0x2a4a44);
    addSign(group, "PHONE", p.x, 2.2, p.z + 0.35, 0, "#10211c", "#d7e0cf");
  }

  const litMat = new THREE.MeshBasicMaterial({ color: 0xffc27a });
  const darkMat = new THREE.MeshBasicMaterial({ color: 0x1a1614 });
  const litCount = wins.filter((w) => w.lit).length;
  const darkCount = wins.length - litCount;
  const winGeo = new THREE.BoxGeometry(0.78, 1.05, 0.12);
  const litMesh = new THREE.InstancedMesh(winGeo, litMat, Math.max(1, litCount));
  const darkMesh = new THREE.InstancedMesh(winGeo, darkMat, Math.max(1, darkCount));
  const dummy = new THREE.Object3D();
  let li = 0;
  let di = 0;
  for (const w of wins) {
    dummy.position.set(w.x, w.y, w.z);
    dummy.rotation.set(0, w.axis === "x" ? Math.PI / 2 : 0, 0);
    dummy.scale.set(1, 1, 1);
    dummy.updateMatrix();
    if (w.lit) litMesh.setMatrixAt(li++, dummy.matrix);
    else darkMesh.setMatrixAt(di++, dummy.matrix);
  }
  litMesh.count = Math.max(1, li);
  darkMesh.count = Math.max(1, di);
  litMesh.instanceMatrix.needsUpdate = true;
  darkMesh.instanceMatrix.needsUpdate = true;

  const worldMat = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
  group.add(bucket.mesh(worldMat), litMesh, darkMesh);

  const trunk = new THREE.CylinderGeometry(0.22, 0.32, 2.8, 6);
  const crown = new THREE.SphereGeometry(1.8, 7, 5);
  const moss = new THREE.SphereGeometry(1.15, 6, 4);
  const tMat = new THREE.MeshLambertMaterial({ color: 0x3a3228 });
  const cMat = new THREE.MeshLambertMaterial({ color: 0x1f4a32 });
  const mMat = new THREE.MeshLambertMaterial({ color: 0x2c5a40 });
  const treeCount = 28;
  const trunks = new THREE.InstancedMesh(trunk, tMat, treeCount);
  const crowns = new THREE.InstancedMesh(crown, cMat, treeCount);
  const mosses = new THREE.InstancedMesh(moss, mMat, treeCount);
  let ti = 0;
  for (let r = 2; r < ROWS; r++) {
    for (let c = 1; c < COLS; c++) {
      if (BLOCKS[r]![c] === "shotgun") continue;
      const b = blockRect(c, r);
      for (const spot of [
        { x: b.x0 + 3, z: b.z0 + 3 },
        { x: b.x1 - 3, z: b.z1 - 4 },
      ]) {
        if (ti >= treeCount) break;
        dummy.position.set(spot.x, 1.4, spot.z);
        dummy.rotation.set(0, 0, 0);
        dummy.scale.setScalar(0.85 + rng() * 0.4);
        dummy.updateMatrix();
        trunks.setMatrixAt(ti, dummy.matrix);
        dummy.position.y = 3.3;
        dummy.scale.setScalar(1);
        dummy.updateMatrix();
        crowns.setMatrixAt(ti, dummy.matrix);
        dummy.position.y = 2.5;
        dummy.scale.setScalar(0.9);
        dummy.updateMatrix();
        mosses.setMatrixAt(ti, dummy.matrix);
        ti++;
      }
    }
  }
  trunks.count = ti;
  crowns.count = ti;
  mosses.count = ti;
  group.add(trunks, crowns, mosses);

  const keyLamps = [
    { x: streetX(3), z: streetZ(1), color: 0xffaa66 },
    { x: streetX(3), z: streetZ(2), color: 0xffaa66 },
    { x: streetX(3), z: streetZ(0), color: 0xffaa66 },
    { x: blockRect(1, 0).cx, z: blockRect(1, 0).cz + 4, color: 0xffd7a8 },
    { x: streetX(2), z: streetZ(2), color: 0x9fd8c4 },
    { x: blockRect(0, 1).cx, z: blockRect(0, 1).z1 + 4, color: 0xffc48a },
    { x: blockRect(3, 3).cx, z: blockRect(3, 3).cz, color: 0xe2b15a },
  ];
  for (const lamp of keyLamps) {
    const light = new THREE.PointLight(lamp.color, 70, 38, 2);
    light.position.set(lamp.x, 4.2, lamp.z);
    group.add(light);
  }
  void lampSpots;

  const barge = new THREE.Group();
  const hull = new THREE.Mesh(new THREE.BoxGeometry(7, 1.4, 16), new THREE.MeshLambertMaterial({ color: 0x3a3430 }));
  hull.position.y = 0.4;
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(4, 2.2, 5), new THREE.MeshLambertMaterial({ color: 0xd8c8a4 }));
  cabin.position.set(0, 1.8, 2);
  barge.add(hull, cabin);
  barge.position.set(6, 0, worldZ1 * 0.62);
  group.add(barge);

  const startB = blockRect(2, 1);
  const cryptB = blockRect(3, 3);
  const dockB = blockRect(0, 0);
  const tombB = blockRect(3, 0);
  const wareB = blockRect(0, 2);

  vials.push(
    { x: streetX(3) + 3.2, z: streetZ(2) + 6 },
    { x: tombB.cx + 6, z: tombB.cz },
    { x: streetX(1), z: streetZ(3) - 5 },
    { x: dockB.x0 - 6, z: dockB.cz },
  );

  const carSpawns: City["carSpawns"] = [];
  const park = (x: number, z: number, yaw: number) => {
    if (carSpawns.some((s) => Math.hypot(s.x - x, s.z - z) < 11)) return;
    if (Math.hypot(x - startB.cx, z - startB.cz) < 9) return;
    carSpawns.push({ x, z, yaw });
  };
  for (let r = 0; r < ROWS; r++) {
    for (let i = 1; i <= 3; i++) {
      const b = blockRect(0, r);
      park(streetX(i) + (r % 2 === 0 ? 2.5 : -2.5), b.z0 + 8 + (i % 2) * 10, r % 2 === 0 ? 0 : Math.PI);
    }
  }
  for (let c = 0; c < COLS; c++) {
    const b = blockRect(c, 1);
    park(b.x0 + 10, streetZ(2) + 2.6, Math.PI / 2);
    park(b.x1 - 8, streetZ(3) - 2.6, -Math.PI / 2);
  }

  const pedPaths: City["pedPaths"] = [];
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if ((c + r) % 2 !== 0 && BLOCKS[r]![c] !== "bourbon") continue;
      const b = blockRect(c, r);
      const o = 2.4;
      pedPaths.push([
        { x: b.x0 - o, z: b.z0 + 3 },
        { x: b.x1 + o, z: b.z0 + 3 },
        { x: b.x1 + o, z: b.z1 - 3 },
        { x: b.x0 - o, z: b.z1 - 3 },
      ]);
    }
  }
  pedPaths.push([
    { x: streetX(3) + 3.3, z: 12 },
    { x: streetX(3) + 3.3, z: worldZ1 - 12 },
    { x: streetX(3) - 3.3, z: worldZ1 - 12 },
    { x: streetX(3) - 3.3, z: 12 },
  ]);

  const waterUniforms = { uTime: { value: 0 } };
  const water = new THREE.Mesh(
    new THREE.PlaneGeometry(90, worldZ1 + 70, 1, 1),
    new THREE.ShaderMaterial({
      transparent: true,
      uniforms: waterUniforms,
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform float uTime;
        varying vec2 vUv;
        void main() {
          float w = sin(vUv.x * 48.0 + uTime * 1.4) * sin(vUv.y * 30.0 - uTime);
          vec3 col = vec3(0.04, 0.11, 0.14) + vec3(0.03, 0.07, 0.08) * w;
          gl_FragColor = vec4(col, 0.92);
        }
      `,
    }),
  );
  water.rotation.x = -Math.PI / 2;
  water.position.set(-18, -0.35, worldZ1 / 2);
  water.userData.uniforms = waterUniforms;
  group.add(water);

  return {
    group,
    colliders,
    phones,
    vials,
    carSpawns: carSpawns.slice(0, 16),
    pedPaths,
    crypt: { x: cryptB.cx, z: cryptB.z1 - 6 },
    start: { x: streetX(3) - 2.6, z: blockRect(2, 1).z1 - 3, yaw: 0 },
    docks: { x: dockB.cx, z: dockB.z1 + 5 },
    cemetery: { x: tombB.cx, z: tombB.cz },
    collector: { x: wareB.cx, z: wareB.z1 + 5 },
    bourbon: { x: streetX(3) + 3.2, z: blockRect(2, 0).cz },
    streetcar: { x: streetX(0), z0: 18, z1: worldZ1 - 18 },
    blocks,
    worldX1,
    worldZ1,
  };
}

function iSign(c: number, r: number) {
  const pool = ["RED LADY", "MAISON", "JAZZ BAR", "SECOND LINE"];
  return pool[(c + r) % pool.length]!;
}
function jSign(c: number, r: number) {
  const pool = ["BEIGNETS", "TAPE WORLD", "LUCKY 7", "CRESCENT"];
  return pool[(c * 2 + r) % pool.length]!;
}

export function resolveCircle(x: number, z: number, radius: number, blocks: AABB[]) {
  for (let n = 0; n < 2; n++) {
    for (const b of blocks) {
      if (x < b.minx - radius || x > b.maxx + radius || z < b.minz - radius || z > b.maxz + radius) continue;
      const cx = Math.max(b.minx, Math.min(x, b.maxx));
      const cz = Math.max(b.minz, Math.min(z, b.maxz));
      let dx = x - cx;
      let dz = z - cz;
      const d2 = dx * dx + dz * dz;
      if (d2 >= radius * radius) continue;
      if (d2 > 1e-8) {
        const d = Math.sqrt(d2);
        const push = (radius - d) / d;
        x += dx * push;
        z += dz * push;
      } else {
        const left = x - b.minx;
        const right = b.maxx - x;
        const near = z - b.minz;
        const far = b.maxz - z;
        const m = Math.min(left, right, near, far);
        if (m === left) x = b.minx - radius;
        else if (m === right) x = b.maxx + radius;
        else if (m === near) z = b.minz - radius;
        else z = b.maxz + radius;
      }
    }
  }
  return { x, z };
}

export function lineOfSight(x0: number, z0: number, x1: number, z1: number, blocks: AABB[]) {
  const steps = 7;
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    const x = x0 + (x1 - x0) * t;
    const z = z0 + (z1 - z0) * t;
    for (const b of blocks) {
      if (x > b.minx && x < b.maxx && z > b.minz && z < b.maxz) return false;
    }
  }
  return true;
}
