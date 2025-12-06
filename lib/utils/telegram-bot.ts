import { logger } from '@/lib/utils/secure-logger';

interface TelegramBotInfo {
  id: number;
  is_bot: boolean;
  first_name: string;
  username?: string;
}

interface TelegramApiResponse {
  ok: boolean;
  result?: TelegramBotInfo;
  description?: string;
}

// Cache bot_id to avoid repeated API calls
let cachedBotId: number | null = null;

/**
 * Get Telegram bot ID from bot token
 * Uses Telegram Bot API to fetch bot information
 */
export async function getTelegramBotId(botToken: string): Promise<number | null> {
  // Return cached value if available
  if (cachedBotId !== null) {
    return cachedBotId;
  }

  try {
    const response = await fetch(`https://api.telegram.org/bot${botToken}/getMe`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      logger.error('Failed to fetch Telegram bot info', {
        status: response.status,
        statusText: response.statusText,
      });
      return null;
    }

    const data: TelegramApiResponse = await response.json();

    if (!data.ok || !data.result) {
      logger.error('Telegram API returned error', {
        description: data.description,
      });
      return null;
    }

    // Cache the bot_id
    cachedBotId = data.result.id;
    logger.info('Telegram bot ID fetched successfully', { botId: cachedBotId });

    return cachedBotId;
  } catch (error) {
    logger.error('Error fetching Telegram bot ID', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    return null;
  }
}

/**
 * Clear cached bot ID (useful for testing or token changes)
 */
export function clearTelegramBotIdCache(): void {
  cachedBotId = null;
}

