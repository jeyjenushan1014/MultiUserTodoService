import type {
  CreateSessionData,
  LoginUserRow,
} from "./login.types.js";

export interface LoginRepository {
  findUserByEmail(
    email: string,
  ): Promise<LoginUserRow | undefined>;

  createSession(
    data: CreateSessionData,
  ): Promise<void>;
}