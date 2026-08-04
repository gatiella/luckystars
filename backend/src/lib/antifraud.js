import { query } from "../db.js";

/**
 * Very lightweight, extend as needed:
 * - block referral reward if referee shares device_hash or IP with referrer or with
 *   any other account created in the last 24h from the same fingerprint
 * - flag (not silently reject) so an admin can review before payouts scale up
 */
export async function isSuspiciousReferral({ referrerId, refereeDeviceHash, refereeIp }) {
  if (!refereeDeviceHash && !refereeIp) return { suspicious: false };

  const { rows } = await query(
    `SELECT id FROM users
     WHERE id = $1 AND (device_hash = $2 OR last_ip = $3)`,
    [referrerId, refereeDeviceHash, refereeIp]
  );
  if (rows.length > 0) {
    return { suspicious: true, reason: "referrer_device_or_ip_match" };
  }

  const { rows: dupes } = await query(
    `SELECT COUNT(*)::int AS count FROM users
     WHERE device_hash = $1 AND created_at > now() - interval '24 hours'`,
    [refereeDeviceHash]
  );
  if (dupes[0]?.count > 2) {
    return { suspicious: true, reason: "device_hash_burst" };
  }

  return { suspicious: false };
}
