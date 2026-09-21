import type {
  RefreshRotationResult,
  RotateRefreshTokenData,
} from "./refresh.types.js";

export interface RefreshRepository {
  rotateRefreshToken(
    data: RotateRefreshTokenData,
  ): Promise<RefreshRotationResult>;
}