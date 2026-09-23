import * as THREE from "three";

export type Limbs = {
  group: THREE.Group;
  armL: THREE.Group;
  armR: THREE.Group;
  legL: THREE.Group;
  legR: THREE.Group;
};

export type PedStyle = {
  shirt: number;
  pants: number;
  skin: number;
  coat?: number;
  hat?: number;
  scale?: number;
  eyes?: number;
};

const cache: {
  leg?: THREE.BoxGeometry;
  arm?: THREE.BoxGeometry;
  torso?: THREE.BoxGeometry;
  coat?: THREE.BoxGeometry;
  head?: THREE.SphereGeometry;
  eye?: THREE.SphereGeometry;
  hat?: THREE.CylinderGeometry;
  shoe?: THREE.BoxGeometry;
  wheel?: THREE.CylinderGeometry;
} = {};

function geo() {
  cache.leg ??= new THREE.BoxGeometry(0.16, 0.62, 0.18);
  cache.arm ??= new THREE.BoxGeometry(0.12, 0.52, 0.14);
  cache.torso ??= new THREE.BoxGeometry(0.46, 0.58, 0.26);
  cache.coat ??= new THREE.BoxGeometry(0.58, 0.78, 0.32);
  cache.head ??= new THREE.SphereGeometry(0.16, 8, 8);
  cache.eye ??= new THREE.SphereGeometry(0.035, 6, 6);
  cache.hat ??= new THREE.CylinderGeometry(0.15, 0.17, 0.1, 8);
  cache.shoe ??= new THREE.BoxGeometry(0.16, 0.08, 0.26);
  if (!cache.wheel) {
    cache.wheel = new THREE.CylinderGeometry(0.32, 0.32, 0.22, 8);
    cache.wheel.rotateZ(Math.PI / 2);
  }
  return cache as Required<typeof cache>;
}

function lambert(color: number) {
  return new THREE.MeshLambertMaterial({ color });
}

export function makePed(style: PedStyle): Limbs {
  const g = geo();
  const group = new THREE.Group();
  group.scale.setScalar(style.scale ?? 1);
  const skin = lambert(style.skin);
  const shirt = lambert(style.shirt);
  const pants = lambert(style.pants);
  const shoeMat = lambert(0x16141a);
  const coatMat = style.coat != null ? lambert(style.coat) : null;
  const sleeve = coatMat ?? shirt;

  const legL = new THREE.Group();
  legL.position.set(-0.12, 0.86, 0);
  const legMeshL = new THREE.Mesh(g.leg, pants);
  legMeshL.position.y = -0.32;
  const shoeL = new THREE.Mesh(g.shoe, shoeMat);
  shoeL.position.set(0, -0.62, -0.02);
  legL.add(legMeshL, shoeL);

  const legR = new THREE.Group();
  legR.position.set(0.12, 0.86, 0);
  const legMeshR = new THREE.Mesh(g.leg, pants);
  legMeshR.position.y = -0.32;
  const shoeR = new THREE.Mesh(g.shoe, shoeMat);
  shoeR.position.set(0, -0.62, -0.02);
  legR.add(legMeshR, shoeR);

  const torso = new THREE.Mesh(g.torso, shirt);
  torso.position.y = 1.16;
  group.add(torso);
  if (coatMat) {
    const coat = new THREE.Mesh(g.coat, coatMat);
    coat.position.y = 1.08;
    group.add(coat);
  }

  const armL = new THREE.Group();
  armL.position.set(-0.34, 1.38, 0);
  const armMeshL = new THREE.Mesh(g.arm, sleeve);
  armMeshL.position.y = -0.24;
  armL.add(armMeshL);

  const armR = new THREE.Group();
  armR.position.set(0.34, 1.38, 0);
  const armMeshR = new THREE.Mesh(g.arm, sleeve);
  armMeshR.position.y = -0.24;
  armR.add(armMeshR);

  const head = new THREE.Mesh(g.head, skin);
  head.position.set(0, 1.62, 0);
  group.add(head);

  const eyeMat = new THREE.MeshBasicMaterial({ color: style.eyes ?? 0x1a120f });
  const eyeL = new THREE.Mesh(g.eye, eyeMat);
  eyeL.position.set(-0.06, 1.64, -0.13);
  const eyeR = new THREE.Mesh(g.eye, eyeMat);
  eyeR.position.set(0.06, 1.64, -0.13);
  group.add(eyeL, eyeR);

  if (style.hat != null) {
    const hat = new THREE.Mesh(g.hat, lambert(style.hat));
    hat.position.y = 1.8;
    group.add(hat);
    const brim = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.04, 0.36), lambert(style.hat));
    brim.position.y = 1.74;
    group.add(brim);
  }

  group.add(legL, legR, armL, armR);
  return { group, armL, armR, legL, legR };
}

export type CarKind = "sedan" | "coupe" | "taxi" | "van" | "cop";

export function makeCar(kind: CarKind, color: number): THREE.Group {
  const g = geo();
  const group = new THREE.Group();
  group.rotation.order = "YXZ";
  const bodyMat = lambert(color);
  const glass = lambert(0x142026);
  const chrome = lambert(0xb7bcc4);
  const lamp = new THREE.MeshBasicMaterial({ color: 0xfff1c2 });
  const tail = new THREE.MeshBasicMaterial({ color: 0xd1233c });
  const length = kind === "van" ? 4.6 : kind === "coupe" ? 4.05 : 4.35;
  const body = new THREE.Mesh(new THREE.BoxGeometry(1.82, 0.52, length), bodyMat);
  body.position.y = 0.58;
  group.add(body);

  const cabinH = kind === "van" ? 0.78 : 0.46;
  const cabinL = kind === "van" ? 2.5 : kind === "coupe" ? 1.45 : 1.85;
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.62, cabinH, cabinL), glass);
  cabin.position.set(0, 0.58 + 0.26 + cabinH / 2, kind === "van" ? 0.15 : 0.28);
  group.add(cabin);

  const bumperGeo = new THREE.BoxGeometry(1.9, 0.16, 0.12);
  const front = new THREE.Mesh(bumperGeo, chrome);
  front.position.set(0, 0.4, -length / 2 - 0.02);
  const back = new THREE.Mesh(bumperGeo, chrome);
  back.position.set(0, 0.4, length / 2 + 0.02);
  group.add(front, back);

  const hlGeo = new THREE.BoxGeometry(0.32, 0.16, 0.08);
  const hlL = new THREE.Mesh(hlGeo, lamp);
  hlL.position.set(-0.55, 0.58, -length / 2 - 0.02);
  const hlR = new THREE.Mesh(hlGeo, lamp);
  hlR.position.set(0.55, 0.58, -length / 2 - 0.02);
  const tlL = new THREE.Mesh(hlGeo, tail);
  tlL.position.set(-0.58, 0.58, length / 2 + 0.02);
  const tlR = new THREE.Mesh(hlGeo, tail);
  tlR.position.set(0.58, 0.58, length / 2 + 0.02);
  group.add(hlL, hlR, tlL, tlR);

  const wmat = lambert(0x121214);
  for (const z of [-length * 0.32, length * 0.3]) {
    for (const x of [-0.92, 0.92]) {
      const w = new THREE.Mesh(g.wheel, wmat);
      w.position.set(x, 0.32, z);
      group.add(w);
    }
  }

  if (kind === "taxi") {
    const sign = new THREE.Mesh(
      new THREE.BoxGeometry(0.72, 0.2, 0.28),
      new THREE.MeshBasicMaterial({ color: 0xe2b15a }),
    );
    sign.position.set(0, 1.45, 0.2);
    group.add(sign);
  }
  if (kind === "cop") {
    const bar = new THREE.Mesh(
      new THREE.BoxGeometry(1.15, 0.14, 0.28),
      new THREE.MeshBasicMaterial({ color: 0x2a4f96 }),
    );
    bar.position.set(0, 1.32, 0);
    bar.name = "lightbar";
    group.add(bar);
  }
  return group;
}

export function makeStreetcar(): THREE.Group {
  const group = new THREE.Group();
  group.rotation.order = "YXZ";
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(2.6, 2.3, 10.2),
    lambert(0x1c6b4a),
  );
  body.position.y = 1.55;
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(2.64, 0.28, 10.2), lambert(0xc4553a));
  stripe.position.y = 2.35;
  const roof = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.28, 9.6), lambert(0xd8d2c4));
  roof.position.y = 2.78;
  const glass = new THREE.Mesh(
    new THREE.BoxGeometry(2.2, 0.7, 8.4),
    new THREE.MeshBasicMaterial({ color: 0xffe2a8 }),
  );
  glass.position.y = 1.85;
  group.add(body, stripe, roof, glass);
  return group;
}

export function makeRing(color: number): THREE.Mesh {
  const mesh = new THREE.Mesh(
    new THREE.TorusGeometry(0.85, 0.055, 6, 18),
    new THREE.MeshBasicMaterial({ color }),
  );
  mesh.rotation.x = Math.PI / 2;
  mesh.position.y = 0.12;
  return mesh;
}

export function makeBeam(color: number): THREE.Mesh {
  const mesh = new THREE.Mesh(
    new THREE.CylinderGeometry(0.18, 0.45, 18, 6, 1, true),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.28, side: THREE.DoubleSide }),
  );
  mesh.position.y = 9;
  return mesh;
}
