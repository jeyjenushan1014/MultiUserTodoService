import bcrypt from "bcryptjs";

import {
  env,
} from "../config/env.js";

export interface PasswordHasher {
  hash(
    password: string,
  ): Promise<string>;
}

export interface PasswordVerifier {
  verify(
    password: string,
    passwordHash: string,
  ): Promise<boolean>;
}

export class BcryptPasswordService
implements PasswordHasher,PasswordVerifier {
  public async hash(
    password: string,
  ): Promise<string> {
    return bcrypt.hash(
      password,
      env.PASSWORD_HASH_ROUNDS,
    );
  }

  public async verify(
    password: string,
    passwordHash: string,
  ): Promise<boolean> {
    return bcrypt.compare(
      password,
      passwordHash,
    );
  }
}