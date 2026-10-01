import { privateKeyToAccount } from "viem/accounts";
import { env } from "../config/env.js";
import { logger } from "../config/logger.js";

/**
 * Interface representing secure Signer Key Provider for blockchain transaction writing.
 * Strictly adheres to BC-15:
 * - Never returns private key in string/logs.
 * - Masks secrets when stringified.
 * - Confirms that the derived account address matches configured CHAIN_WRITER_ADDRESS.
 */
export interface ISignerKeyProvider {
  readonly address: `0x${string}`;
  signTransaction?: (tx: unknown) => Promise<unknown>;
  getAccount(): ReturnType<typeof privateKeyToAccount>;
}

export class SecureSignerKeyProvider implements ISignerKeyProvider {
  private readonly account: ReturnType<typeof privateKeyToAccount>;

  constructor(privateKeyHex?: string) {
    const rawKey = privateKeyHex ?? env.CHAIN_SIGNER_PRIVATE_KEY;

    if (!rawKey) {
      throw new Error(
        "BC-15 Error: Signer private key is not configured. Supply via secure environment (CHAIN_SIGNER_PRIVATE_KEY) or secret manager.",
      );
    }

    if (!/^0x[a-fA-F0-9]{64}$/.test(rawKey)) {
      throw new Error(
        "BC-15 Error: Invalid private key format. Must be 0x-prefixed 32-byte hex.",
      );
    }

    this.account = privateKeyToAccount(rawKey as `0x${string}`);

    // Verify derived address matches configured writer address
    const expectedAddress = env.CHAIN_WRITER_ADDRESS.toLowerCase();
    const actualAddress = this.account.address.toLowerCase();

    if (actualAddress !== expectedAddress) {
      throw new Error(
        `BC-15 Error: Derived signer address (${actualAddress}) does not match configured CHAIN_WRITER_ADDRESS (${expectedAddress}).`,
      );
    }

    logger.info(
      {
        writerAddress: actualAddress,
      },
      "Signer key initialized securely for on-chain submissions",
    );
  }

  public get address(): `0x${string}` {
    return this.account.address;
  }

  public getAccount(): ReturnType<typeof privateKeyToAccount> {
    return this.account;
  }

  /**
   * Prevent JSON serialization or unintended console inspection of private key
   */
  public toJSON(): Record<string, string> {
    return {
      address: this.address,
      keyStatus: "[PROTECTED_IN_MEMORY]",
    };
  }

  public toString(): string {
    return `[SecureSignerKeyProvider address=${this.address}]`;
  }
}
