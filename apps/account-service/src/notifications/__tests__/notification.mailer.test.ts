import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

const sendMailMock =
  vi.fn();

vi.mock(
  "nodemailer",
  () => ({
    createTransport: vi.fn(() => ({
      sendMail: sendMailMock,
    })),
  }),
);

vi.mock("../../config/database.js", () => ({
  database: { query: vi.fn(), connect: vi.fn() },
}));

vi.mock(
  "../../config/env.js",
  () => ({
    env: {
      NODE_ENV: "test",
      MAIL_HOST: "mailpit",
      MAIL_PORT: 1025,
      MAIL_FROM: "no-reply@todo.local",
    },
  }),
);

import {
  SmtpNotificationMailer,
} from "../notification.mailer.js";

import {
  NotificationTransportSelector,
  loadExternalMailer,
} from "../notification-transport.selector.js";

describe(
  "SmtpNotificationMailer",
  () => {
    beforeEach(() => {
      sendMailMock.mockReset();
      sendMailMock.mockResolvedValue({
        messageId: "message-id",
      });
    });

    it(
      "sends a TODO shared email",
      async () => {
        const mailer =
          new SmtpNotificationMailer();

        await mailer.sendTodoSharedEmail(
          "recipient@example.com",
          "todo-id",
        );

        expect(
          sendMailMock,
        ).toHaveBeenCalledWith({
          from:
            "no-reply@todo.local",

          to:
            "recipient@example.com",

          subject:
            "A TODO was shared with you",

          text:
            "A TODO was shared with you.\n\n" +
            "TODO ID: todo-id\n" +
            "Permission: state-update",
        });
      },
    );

    it(
      "sends a share withdrawn email",
      async () => {
        const mailer =
          new SmtpNotificationMailer();

        await mailer
          .sendTodoShareWithdrawnEmail(
            "recipient@example.com",
            "todo-id",
          );

        expect(
          sendMailMock,
        ).toHaveBeenCalledWith({
          from:
            "no-reply@todo.local",

          to:
            "recipient@example.com",

          subject:
            "TODO sharing was withdrawn",

          text:
            "TODO sharing was withdrawn.\n\n" +
            "TODO ID: todo-id",
        });
      },
    );

    it(
      "sends a usable password reset token",
      async () => {
        const mailer =
          new SmtpNotificationMailer();

        await mailer.sendPasswordResetEmail(
          "recipient@example.com",
          "reset-token",
          "2026-09-24T12:00:00.000Z",
        );

        expect(
          sendMailMock,
        ).toHaveBeenCalledWith({
          from:
            "no-reply@todo.local",

          to:
            "recipient@example.com",

          subject:
            "Reset your password",

          text:
            "Reset your password.\n\n" +
            "Reset token: reset-token\n" +
            "Expires at: 2026-09-24T12:00:00.000Z",
        });
      },
    );

    it(
      "propagates SMTP errors",
      async () => {
        const error =
          new Error("SMTP unavailable");

        sendMailMock.mockRejectedValue(
          error,
        );

        const mailer =
          new SmtpNotificationMailer();

        await expect(
          mailer.sendTodoSharedEmail(
            "recipient@example.com",
            "todo-id",
          ),
        ).rejects.toBe(error);
      },
    );
  },
);

describe("NotificationTransportSelector", () => {
  const sink = {
    sendTodoSharedEmail: vi.fn().mockResolvedValue(undefined),
    sendTodoShareWithdrawnEmail: vi.fn().mockResolvedValue(undefined),
    sendPasswordResetEmail: vi.fn().mockResolvedValue(undefined),
  };
  const provider = {
    sendTodoSharedEmail: vi.fn().mockResolvedValue(undefined),
    sendTodoShareWithdrawnEmail: vi.fn().mockResolvedValue(undefined),
    sendPasswordResetEmail: vi.fn().mockResolvedValue(undefined),
  };
  const store = {
    readMode: vi.fn().mockResolvedValue("sink" as "sink" | "external"),
    setMode: vi.fn().mockResolvedValue(undefined),
    pinDestination: vi.fn().mockResolvedValue("sink" as "sink" | "external"),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    store.readMode.mockResolvedValue("sink");
    store.pinDestination.mockResolvedValue("sink");
  });

  it("keeps a sink-pinned event in Mailpit when the current mode changes", async () => {
    store.readMode.mockResolvedValue("external");
    const loadProvider = vi.fn().mockResolvedValue(provider);
    const selector = new NotificationTransportSelector(sink, store, loadProvider, () => true);

    expect(await selector.select("event-id")).toBe(sink);
    expect(store.pinDestination).toHaveBeenCalledWith("event-id", "external");
    expect(loadProvider).not.toHaveBeenCalled();
  });

  it("does not reroute a provider-pinned event when external mode is turned off", async () => {
    store.pinDestination.mockResolvedValue("external");
    const loadProvider = vi.fn().mockResolvedValue(provider);
    const selector = new NotificationTransportSelector(sink, store, loadProvider, () => true);

    await expect(selector.select("event-id")).rejects.toThrow("External mail is disabled");
    expect(loadProvider).not.toHaveBeenCalled();
  });

  it("falls back to the sink if reading shared mode fails", async () => {
    store.readMode.mockRejectedValue(new Error("settings unavailable"));
    const selector = new NotificationTransportSelector(sink, store);

    expect(await selector.select("event-id")).toBe(sink);
    expect(store.pinDestination).toHaveBeenCalledWith("event-id", "sink");
  });

  it("blocks external delivery in tests even if the shared mode is enabled", async () => {
    store.readMode.mockResolvedValue("external");
    store.pinDestination.mockResolvedValue("external");
    const loadProvider = vi.fn().mockResolvedValue(provider);
    const selector = new NotificationTransportSelector(sink, store, loadProvider, () => false);

    await expect(selector.select("event-id")).rejects.toThrow("External mail is disabled");
    await expect(loadExternalMailer()).rejects.toThrow("External mail is not configured");
    expect(loadProvider).not.toHaveBeenCalled();
  });

  it("uses an injected provider without changing notification business rules", async () => {
    store.readMode.mockResolvedValue("external");
    store.pinDestination.mockResolvedValue("external");
    const selector = new NotificationTransportSelector(
      sink, store, () => Promise.resolve(provider), () => true,
    );

    const selected = await selector.select("event-id");
    await selected.sendTodoSharedEmail("recipient@example.com", "todo-id");
    expect(provider.sendTodoSharedEmail).toHaveBeenCalledOnce();
    expect(sink.sendTodoSharedEmail).not.toHaveBeenCalled();
  });
});