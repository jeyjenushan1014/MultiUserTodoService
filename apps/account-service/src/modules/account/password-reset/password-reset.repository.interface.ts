import type {
  CompletePasswordResetData,
  CompletePasswordResetResult,
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

  completePasswordReset(
    data: CompletePasswordResetData,
  ): Promise<CompletePasswordResetResult>;
}