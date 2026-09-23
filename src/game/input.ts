/** Shared touch/UI actions. The game loop reads these; buttons write them. */
export const touch = {
  x: 0,
  y: 0,
  sprint: false,
  orbit: 0,
  attackEdge: false,
  useEdge: false,
  useHeld: false,
};

export const commands = {
  map: false,
  pause: false,
};

export function clearTouchEdges() {
  touch.attackEdge = false;
  touch.useEdge = false;
  touch.orbit = 0;
}
