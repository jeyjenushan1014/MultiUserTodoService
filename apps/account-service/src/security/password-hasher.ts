import bcrypt from "bcryptjs";

import {
  env,
} from "../config/env.js";

export interface PasswordHasher {
  hash(
    password: string,
  ): Promise<string>;
}

export class BcryptPasswordHasher
implements PasswordHasher {
  public async hash(
    password: string,
  ): Promise<string> {
    return bcrypt.hash(
      password,
      env.PASSWORD_HASH_ROUNDS,
    );
  }
}