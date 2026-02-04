import { getRedisClient } from '@/lib/database/redis';

export interface MaintenanceConfig {
  isActive: boolean;
  scheduledStart: string | null; // ISO date string
  scheduledEnd: string | null;   // ISO date string
  message: string;
}

const MAINTENANCE_KEY = 'maintenance:config';

export async function getMaintenanceConfig(): Promise<MaintenanceConfig> {
  const redis = getRedisClient();
  if (!redis) {
    return {
      isActive: false,
      scheduledStart: null,
      scheduledEnd: null,
      message: '',
    };
  }

  const data = await redis.get(MAINTENANCE_KEY);
  if (!data) {
    return {
      isActive: false,
      scheduledStart: null,
      scheduledEnd: null,
      message: '',
    };
  }

  try {
    return JSON.parse(data);
  } catch {
    return {
      isActive: false,
      scheduledStart: null,
      scheduledEnd: null,
      message: '',
    };
  }
}

export async function setMaintenanceConfig(config: MaintenanceConfig): Promise<void> {
  const redis = getRedisClient();
  if (!redis) return;

  await redis.set(MAINTENANCE_KEY, JSON.stringify(config));
}

export async function isMaintenanceActive(): Promise<boolean> {
  const config = await getMaintenanceConfig();

  if (config.isActive) {
    return true;
  }

  if (config.scheduledStart && config.scheduledEnd) {
    const now = new Date();
    const start = new Date(config.scheduledStart);
    const end = new Date(config.scheduledEnd);

    if (now >= start && now <= end) {
      return true;
    }
  }

  return false;
}
