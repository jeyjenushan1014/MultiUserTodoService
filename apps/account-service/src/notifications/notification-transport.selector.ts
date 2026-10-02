import { readFile } from "node:fs/promises";

import { z } from "zod";

import { env } from "../config/env.js";

import {
  SmtpNotificationMailer,
  type NotificationMailer,
} from "./notification.mailer.js";

import {
  PostgresMailModeRepository,
  type MailModeRepository,
} from "./notification-mode.repository.js";

const smtpCredentialSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});

function externalAllowed(): boolean {
  return env.NODE_ENV !== "test" && env.MAIL_TEST_SINK_ONLY !== "true";
}

export async function loadExternalMailer(): Promise<NotificationMailer> {
  if (!externalAllowed() || env.MAIL_PROVIDER_HOST.length === 0 ||
      !z.email().safeParse(env.MAIL_PROVIDER_FROM).success) {
    throw new Error("External mail is not configured");
  }

  try {
    const contents = await readFile(env.MAIL_PROVIDER_SECRET_FILE, "utf8");
    const credentials = smtpCredentialSchema.parse(JSON.parse(contents) as unknown);
    return new SmtpNotificationMailer({
      host: env.MAIL_PROVIDER_HOST,
      port: env.MAIL_PROVIDER_PORT,
      from: env.MAIL_PROVIDER_FROM,
      secure: env.MAIL_PROVIDER_PORT === 465,
      auth: { user: credentials.username, pass: credentials.password },
    }, true);
  } catch {
    throw new Error("External mail is not configured");
  }
}

export class NotificationTransportSelector {
  public constructor(
    private readonly sink: NotificationMailer,
    private readonly store: MailModeRepository = new PostgresMailModeRepository(),
    private readonly loadProvider: () => Promise<NotificationMailer> = loadExternalMailer,
    private readonly isExternalAllowed: () => boolean = externalAllowed,
  ) {}

  public async select(eventId: string): Promise<NotificationMailer> {
    let mode: "sink" | "external" = "sink";
    try {
      mode = await this.store.readMode();
    } catch {
      mode = "sink";
    }

    const destination = await this.store.pinDestination(eventId, mode);
    if (destination === "sink") return this.sink;
    if (mode !== "external" || !this.isExternalAllowed()) {
      throw new Error("External mail is disabled");
    }
    return this.loadProvider();
  }
}