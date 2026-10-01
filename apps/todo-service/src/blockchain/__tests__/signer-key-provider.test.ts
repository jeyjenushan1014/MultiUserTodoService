import { describe, expect, it } from "vitest";
import { SecureSignerKeyProvider } from "../signer-key-provider.js";

describe("SecureSignerKeyProvider (BC-15)", () => {
  it("throws if private key is missing or invalid format", () => {
    expect(() => new SecureSignerKeyProvider("")).toThrow(
      /Signer private key is not configured/,
    );
    expect(() => new SecureSignerKeyProvider("0xinvalid")).toThrow(
      /Invalid private key format/,
    );
  });

  it("throws if derived address does not match CHAIN_WRITER_ADDRESS", () => {
    // Test key whose address is not 0x5FbDB2315678afecb367f032d93F642f64180aa3
    const anotherKey =
      "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d";

    expect(() => new SecureSignerKeyProvider(anotherKey)).toThrow(
      /Derived signer address .* does not match configured CHAIN_WRITER_ADDRESS/,
    );
  });

  it("safely masks private key on JSON serialization and toString", () => {
    const provider = Object.create(
      SecureSignerKeyProvider.prototype,
    ) as SecureSignerKeyProvider;

    Object.defineProperty(provider, "address", {
      value: "0x5FbDB2315678afecb367f032d93F642f64180aa3" as const,
      configurable: true,
    });

    const json = JSON.stringify(provider);
    expect(json).not.toContain("0xac09");
    expect(json).toContain("[PROTECTED_IN_MEMORY]");

    const str = provider.toString();
    expect(str).not.toContain("0xac09");
    expect(str).toContain("0x5FbDB2315678afecb367f032d93F642f64180aa3");
  });
});
