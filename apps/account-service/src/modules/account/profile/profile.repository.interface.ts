import type {
  CurrentAccountRow,
} from "./profile.types.js";

export interface ProfileRepository {
  findActiveAccount(
    userId: string,
    sessionId: string,
  ): Promise<
    CurrentAccountRow | undefined
  >;
}