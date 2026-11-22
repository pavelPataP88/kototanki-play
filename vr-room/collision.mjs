/** Lightweight 2D swept-circle character collider for the 7x7-metre GOLOVA VR room.
 * Coordinates are the player's headset/feet XZ projection in metres, not the eye mesh.
 * Axis-separated substeps provide wall sliding and prevent stick-driven wall tunnelling.
 */
export const ROOM_HALF = 3.5;
export const WALL_INSET = 0.13;
export const PLAYER_RADIUS = 0.28;
export const MAX_MOVE_STEP = 0.06;
export const SOLIDS = Object.freeze([
  { minX: 1.41, maxX: 2.88, minZ: -1.86, maxZ: -1.04, name: 'desk' },
]);

export const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
export function isBlocked(x, z, radius = PLAYER_RADIUS) {
  const allowed = ROOM_HALF - WALL_INSET - radius;
  if (Math.abs(x) > allowed + 1e-9 || Math.abs(z) > allowed + 1e-9) return true;
  for (const o of SOLIDS) {
    const px = clamp(x, o.minX, o.maxX);
    const pz = clamp(z, o.minZ, o.maxZ);
    if ((x - px) ** 2 + (z - pz) ** 2 < radius * radius - 1e-9) return true;
  }
  return false;
}

export function resolveMove(x, z, dx, dz, radius = PLAYER_RADIUS) {
  if (![x, z, dx, dz, radius].every(Number.isFinite)) return { x, z, dx: 0, dz: 0, blocked: true };
  const startX = x, startZ = z;
  const allowed = ROOM_HALF - WALL_INSET - radius;
  let blocked = false;
  const steps = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dz)) / MAX_MOVE_STEP));
  const stepX = dx / steps, stepZ = dz / steps;
  for (let i = 0; i < steps; i++) {
    const nx = clamp(x + stepX, -allowed, allowed);
    if (Math.abs(nx - (x + stepX)) > 1e-8) blocked = true;
    if (!isBlocked(nx, z, radius)) x = nx;
    else { blocked = true; }
    const nz = clamp(z + stepZ, -allowed, allowed);
    if (Math.abs(nz - (z + stepZ)) > 1e-8) blocked = true;
    if (!isBlocked(x, nz, radius)) z = nz;
    else { blocked = true; }
  }
  return { x, z, dx: x - startX, dz: z - startZ, blocked };
}
export function clampRigOrigin(x, z, dx, dz, max = 2.85) {
  const nextX = clamp(x + dx, -max, max), nextZ = clamp(z + dz, -max, max);
  return { dx: nextX - x, dz: nextZ - z };
}
