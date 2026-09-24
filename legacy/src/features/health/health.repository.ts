import { cache } from "../../config/cache.js";
import { database } from "../../config/database.js";

export async function isDatabaseAvailable(): Promise<boolean> {
  try {
    await database.query("SELECT 1 FROM users LIMIT 1");
    return true;
  } catch {
    return false;
  }
}

export async function isCacheAvailable(): Promise<boolean> {
  try {
    return (await cache.ping()) === "PONG";
  } catch {
    return false;
  }
}