import {
  BcryptPasswordService,
} from "../../../security/password-hasher.js";

import {
  createRegistrationController,
} from "./registration.controller.js";

import {
  PostgresRegistrationRepository,
} from "./registration.repository.js";

import {
  RegistrationService,
} from "./registration.service.js";

const registrationRepository =
  new PostgresRegistrationRepository();

const passwordHasher =
  new BcryptPasswordService();

const registrationService =
  new RegistrationService(
    registrationRepository,
    passwordHasher,
  );

export const registrationController =
  createRegistrationController(
    registrationService,
  );