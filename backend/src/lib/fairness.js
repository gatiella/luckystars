import crypto from "crypto";

/**
 * Provably-fair spin/box resolution.
 * Flow shown to the user:
 *  1. Server picks server_seed (kept secret until after the round) and shows sha256(server_seed) up front.
 *  2. Client supplies (or is assigned) a client_seed.
 *  3. result = HMAC_SHA256(server_seed, `${client_seed}:${nonce}`) -> mapped to an outcome.
 *  4. After the round, server reveals server_seed so the user can recompute and verify independently.
 */

export function generateServerSeed() {
  return crypto.randomBytes(32).toString("hex");
}

export function hashServerSeed(serverSeed) {
  return crypto.createHash("sha256").update(serverSeed).digest("hex");
}

export function generateClientSeed() {
  return crypto.randomBytes(8).toString("hex");
}

/**
 * Returns a float in [0, 1) deterministically derived from the seeds/nonce.
 */
export function fairFloat(serverSeed, clientSeed, nonce) {
  const hmac = crypto
    .createHmac("sha256", serverSeed)
    .update(`${clientSeed}:${nonce}`)
    .digest("hex");
  // use first 13 hex chars (52 bits) for a uniform float
  const int = parseInt(hmac.slice(0, 13), 16);
  return int / Math.pow(2, 52);
}

/**
 * Resolve an outcome from a weighted prize table.
 * table: [{ key, weight, value }]
 */
export function resolvePrize(serverSeed, clientSeed, nonce, table) {
  const roll = fairFloat(serverSeed, clientSeed, nonce);
  const totalWeight = table.reduce((s, p) => s + p.weight, 0);
  let cumulative = 0;
  for (const prize of table) {
    cumulative += prize.weight / totalWeight;
    if (roll < cumulative) return prize;
  }
  return table[table.length - 1];
}

export function resultHash(serverSeed, clientSeed, nonce) {
  return crypto
    .createHash("sha256")
    .update(`${serverSeed}:${clientSeed}:${nonce}`)
    .digest("hex");
}
