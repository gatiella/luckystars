import { bot } from "../bot.js";

/**
 * Verify that a user has completed a task before granting the reward.
 * Returns { verified: true } or { verified: false, reason: string }.
 */
export async function verifyTaskCompletion(task, userTgId) {
  switch (task.type) {
    case "join_channel":
      return verifyChannelMembership(task, userTgId);

    case "follow_x":
      // Twitter verification requires OAuth or manual approval for now
      // Return verified: false with a helpful message
      return {
        verified: false,
        reason: "twitter_verification_not_implemented",
        message: "Twitter verification requires manual review. Contact support."
      };

    case "custom":
      // Custom tasks are manually verified by admins
      return { verified: true };

    default:
      return { verified: false, reason: "unknown_task_type" };
  }
}

/**
 * Verify Telegram channel membership using the Bot API.
 * The bot must be an admin in the channel to check membership.
 */
async function verifyChannelMembership(task, userTgId) {
  if (!task.target_url) {
    return { verified: false, reason: "no_target_url" };
  }

  // Extract channel username or ID from target_url
  // Formats: https://t.me/channelname, @channelname, or -100123456789
  const chatId = extractChatId(task.target_url);
  if (!chatId) {
    return { verified: false, reason: "invalid_channel_url" };
  }

  try {
    const member = await bot.telegram.getChatMember(chatId, userTgId);

    // member.status can be: "creator", "administrator", "member", "restricted", "left", "kicked"
    const validStatuses = ["creator", "administrator", "member", "restricted"];

    if (validStatuses.includes(member.status)) {
      return { verified: true };
    } else {
      return {
        verified: false,
        reason: "not_a_member",
        message: "You must join the channel first."
      };
    }
  } catch (err) {
    // Common errors:
    // - "Bad Request: user not found" (user has never interacted with the bot)
    // - "Bad Request: chat not found" (invalid channel ID)
    // - "Bad Request: USER_NOT_PARTICIPANT" (user is not in the channel)
    // - "Forbidden: bot is not a member of the channel" (bot needs admin access)

    if (err.message && err.message.includes("bot is not a member")) {
      console.error(`Bot is not admin in channel ${chatId} — cannot verify membership for task ${task.id}`);
      return {
        verified: false,
        reason: "bot_not_admin",
        message: "Verification unavailable. Contact support."
      };
    }

    if (err.message && (err.message.includes("USER_NOT_PARTICIPANT") || err.message.includes("user not found"))) {
      return {
        verified: false,
        reason: "not_a_member",
        message: "You must join the channel first."
      };
    }

    console.error(`Failed to verify channel membership for task ${task.id}:`, err.message);
    return {
      verified: false,
      reason: "verification_failed",
      message: "Verification failed. Please try again."
    };
  }
}

/**
 * Extract chat ID from various Telegram channel URL formats.
 * Supports:
 * - https://t.me/channelname → @channelname
 * - @channelname → @channelname
 * - -100123456789 → -100123456789 (numeric channel ID)
 */
function extractChatId(url) {
  if (!url) return null;

  // Already a chat ID (@username or numeric ID)
  if (url.startsWith("@") || /^-?\d+$/.test(url)) {
    return url;
  }

  // Extract from t.me URL
  const match = url.match(/t\.me\/([a-zA-Z0-9_]+)/);
  if (match && match[1]) {
    return `@${match[1]}`;
  }

  return null;
}
