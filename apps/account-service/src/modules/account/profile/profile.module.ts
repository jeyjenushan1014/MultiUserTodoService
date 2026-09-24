import {
  PostgresProfileRepository,
} from "./profile.repository.js";

import {
  ProfileService,
} from "./profile.service.js";

const repository =
  new PostgresProfileRepository();

export const profileService =
  new ProfileService(repository);