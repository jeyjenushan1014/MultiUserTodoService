import {
  PostgresLogoutRepository,
} from "./logout.repository.js";

import {
  LogoutService,
} from "./logout.service.js";

const repository =
  new PostgresLogoutRepository();

export const logoutService =
  new LogoutService(repository);