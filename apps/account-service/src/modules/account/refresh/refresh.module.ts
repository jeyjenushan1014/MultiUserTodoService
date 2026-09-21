import {
  createRefreshController,
} from "./refresh.controller.js";

import {
  PostgresRefreshRepository,
} from "./refresh.repository.js";

import {
  RefreshService,
} from "./refresh.service.js";

const repository =
  new PostgresRefreshRepository();

const service =
  new RefreshService(repository);

export const refreshController =
  createRefreshController(service);