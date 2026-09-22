import {
  isCacheAvailable,
} from "../../config/cache.js";

import {
  isDatabaseAvailable,
} from "../../config/database.js";

export interface HealthDependencyProbe {
  databaseAvailable():
  Promise<boolean>;

  cacheAvailable():
  Promise<boolean>;
}

export class SystemHealthDependencyProbe
implements HealthDependencyProbe {
  public async databaseAvailable():
  Promise<boolean> {
    return isDatabaseAvailable();
  }

  public async cacheAvailable():
  Promise<boolean> {
    return isCacheAvailable();
  }
}