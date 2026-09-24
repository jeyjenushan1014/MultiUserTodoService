import {
  BcryptPasswordService,
} from "../../../security/password-hasher.js";

import {
  createLoginController,
} from "./login.controller.js";

import {
  PostgresLoginRepository,
} from "./login.repository.js";

import {
  LoginService,
} from "./login.service.js";

const repository =
  new PostgresLoginRepository();

const passwordService =
  new BcryptPasswordService();

const service =
  new LoginService(
    repository,
    passwordService,
  );

export const loginController =
  createLoginController(service);