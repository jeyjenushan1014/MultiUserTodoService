import type {
  ChangeEmailData,
  ChangedEmailRow,
  EmailChangeCredentialRow,
} from "./email-change.types.js";

export interface EmailChangeRepository {
  findActiveCredential(
    userId: string,
    sessionId: string,
  ): Promise<
    EmailChangeCredentialRow | undefined
  >;

  changeEmail(
    data: ChangeEmailData,
  ): Promise<ChangedEmailRow>;
}