import type {
  CreatePasswordResetData,
  PasswordResetUser,
} from "./password-reset.types.js";

export interface PasswordResetRepository {
  findActiveUserByEmail(
    email: string,
  ): Promise<PasswordResetUser | undefined>;

  createPasswordReset(
    data: CreatePasswordResetData,
  ): Promise<void>;
}