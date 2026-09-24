import {
  BcryptPasswordService,
} from "../../../security/password-hasher.js";

import {
  PostgresEmailChangeRepository,
} from "./email-change.repository.js";

import {
  EmailChangeService,
} from "./email-change.service.js";

const repository =
  new PostgresEmailChangeRepository();

const passwordService =
  new BcryptPasswordService();

export const emailChangeService =
  new EmailChangeService(
    repository,
    passwordService,
  );