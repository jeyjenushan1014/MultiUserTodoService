import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  readFile: vi.fn(),
  createTransport: vi.fn(),
  sendMail: vi.fn(),
}));

vi.mock("node:fs/promises", () => ({ readFile: mocks.readFile }));
vi.mock("nodemailer", () => ({
  createTransport: mocks.createTransport,
}));
vi.mock("../../config/database.js", () => ({ database: { query: vi.fn() } }));
vi.mock("../../config/env.js", () => ({
  env: {
    NODE_ENV: "production",
    MAIL_TEST_SINK_ONLY: "false",
    MAIL_PROVIDER_HOST: "smtp.example.test",
    MAIL_PROVIDER_PORT: 587,
    MAIL_PROVIDER_FROM: "no-reply@example.test",
    MAIL_PROVIDER_SECRET_FILE: "/run/todo-mail-secrets/smtp.json",
    MAIL_SOCKET_TIMEOUT_MS: 5000,
    MAIL_CONNECTION_TIMEOUT_MS: 5000,
    MAIL_GREETING_TIMEOUT_MS: 5000,
  },
}));

import { loadExternalMailer } from "../notification-transport.selector.js";

describe("external SMTP adapter", () => {
  beforeEach(() => {
    mocks.readFile.mockReset();
    mocks.createTransport.mockReset();
    mocks.sendMail.mockReset();
    mocks.createTransport.mockReturnValue({ sendMail: mocks.sendMail });
    mocks.sendMail.mockResolvedValue({ messageId: "test-message-id" });
  });

  it("loads a credential from the mounted file for SMTP transport", async () => {
    mocks.readFile.mockResolvedValue(JSON.stringify({
      username: "test-operator",
      password: "test-only-password",
    }));
    const mailer = await loadExternalMailer();
    await mailer.sendTodoSharedEmail("recipient@example.test", "todo-id");

    expect(mocks.readFile).toHaveBeenCalledWith(
      "/run/todo-mail-secrets/smtp.json", "utf8",
    );
    expect(mocks.createTransport).toHaveBeenCalledWith(expect.objectContaining({
      host: "smtp.example.test",
      port: 587,
      requireTLS: true,
      auth: { user: "test-operator", pass: "test-only-password" },
    }));
    expect(mocks.sendMail).toHaveBeenCalledWith(expect.objectContaining({
      from: "no-reply@example.test",
      to: "recipient@example.test",
    }));
  });

  it("fails closed when a credential is missing or malformed", async () => {
    mocks.readFile.mockRejectedValueOnce(new Error("ENOENT: /secret/path"));
    await expect(loadExternalMailer()).rejects.toThrow("External mail is not configured");
    mocks.readFile.mockResolvedValueOnce(JSON.stringify({ username: "test-operator" }));
    await expect(loadExternalMailer()).rejects.toThrow("External mail is not configured");
    expect(mocks.createTransport).not.toHaveBeenCalled();
  });

  it("never exposes a provider error containing a credential", async () => {
    mocks.readFile.mockResolvedValue(JSON.stringify({
      username: "test-operator", password: "test-only-password",
    }));
    mocks.sendMail.mockRejectedValue(new Error("SMTP rejected test-only-password"));
    const mailer = await loadExternalMailer();

    await expect(mailer.sendTodoSharedEmail("recipient@example.test", "todo-id"))
      .rejects.toThrow("Mail transport failed");
    expect(mocks.sendMail).toHaveBeenCalledOnce();
  });
});