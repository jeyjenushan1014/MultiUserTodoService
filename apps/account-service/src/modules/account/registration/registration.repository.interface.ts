import type {
  RegisteredAccount,
} from "@todo/contracts";

import type {
  CreateAccountData,
} from "./registration.types.js";

export interface RegistrationRepository {
  createAccount(
    data: CreateAccountData,
  ): Promise<RegisteredAccount>;
}