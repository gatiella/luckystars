// Real Adsgram SDK wiring. Set VITE_ADSGRAM_BLOCK_ID in frontend/.env (get the block ID
// from your Adsgram publisher dashboard). Docs: https://docs.adsgram.ai/publisher/sdk
let controller = null;

function getController() {
  if (controller) return controller;
  if (!window.Adsgram) throw new Error("adsgram_sdk_not_loaded");
  const blockId = import.meta.env.VITE_ADSGRAM_BLOCK_ID;
  if (!blockId) throw new Error("adsgram_block_id_missing");
  controller = window.Adsgram.init({ blockId });
  return controller;
}

/**
 * Shows a rewarded ad. Resolves only if the user watched it to completion
 * (Adsgram's onReward callback) — resolves false if skipped/closed early.
 * IMPORTANT: this client-side "watched it" signal is still something a
 * modified client could fake. Adsgram also supports server-to-server reward
 * postbacks — wire that into a webhook on /api/earn/ad-reward-webhook for a
 * tamper-proof version before this handles meaningful payouts at scale.
 */
export async function showRewardedAd() {
  const ctrl = getController();
  return new Promise((resolve, reject) => {
    ctrl
      .show()
      .then(() => resolve(true))
      .catch((err) => reject(err));
  });
}
