import type {
  DependencyStatus,
  HealthResponse,
} from "@todo/contracts";

import {
  env,
} from "../../config/env.js";

import {
  redis,
} from "../../config/redis.js";

export function getGatewayHealth():
  HealthResponse {
  return {
    status: "healthy",
    service: "gateway",
  };
}

export interface GatewayDependencyHealth {
  readonly status:
    "healthy" | "degraded";

  readonly service:
    "gateway";

  readonly dependencies: {
    readonly redis:
      DependencyStatus;

    readonly rabbitmq:
      DependencyStatus;

    readonly mailpit:
      DependencyStatus;

    readonly accountService:
      DependencyStatus;

    readonly todoService:
      DependencyStatus;

    readonly workers:
      Readonly<Record<string, DependencyStatus>>;
  };

  /*
   * Full downstream dependency detail, not flattened to
   * available/unavailable at the top level.
   */
  readonly detail: {
    readonly accountService?:
      Readonly<Record<string, DependencyStatus>>;

    readonly todoService?:
      Readonly<Record<string, DependencyStatus>>;
  };
}

interface DownstreamHealthProbeResult {
  readonly available:
    boolean;

  readonly dependencies?:
    Readonly<Record<string, DependencyStatus>>;
}

async function probeDownstreamHealth(
  url: string,
): Promise<DownstreamHealthProbeResult> {
  const controller =
    new AbortController();

  const timer =
    setTimeout(
      () => {
        controller.abort();
      },
      env.DOWNSTREAM_TIMEOUT_MS,
    );

  try {
    const response =
      await fetch(
        url,
        {
          signal:
            controller.signal,
        },
      );

    if (!response.ok) {
      return {
        available: false,
      };
    }

    const body =
      (await response.json()) as HealthResponse;

    return body.dependencies === undefined
      ? { available: true }
      : {
          available: true,
          dependencies: body.dependencies,
        };
  } catch {
    return {
      available: false,
    };
  } finally {
    clearTimeout(timer);
  }
}

async function probe(
  url: string,
): Promise<boolean> {
  const result =
    await probeDownstreamHealth(
      url,
    );

  return result.available;
}

function rabbitMqManagementAuthorization():
  string {
  const credentials =
    Buffer.from(
      `${env.RABBITMQ_USER}:${env.RABBITMQ_PASSWORD}`,
      "utf8",
    ).toString("base64");

  return `Basic ${credentials}`;
}

async function fetchRabbitMqManagementApi(
  path: string,
): Promise<unknown> {
  const controller =
    new AbortController();

  const timer =
    setTimeout(
      () => {
        controller.abort();
      },
      env.DOWNSTREAM_TIMEOUT_MS,
    );

  try {
    const response =
      await fetch(
        `${env.RABBITMQ_MANAGEMENT_URL}${path}`,
        {
          signal:
            controller.signal,

          headers: {
            authorization:
              rabbitMqManagementAuthorization(),
          },
        },
      );

    if (!response.ok) {
      return undefined;
    }

    return await response.json();
  } catch {
    return undefined;
  } finally {
    clearTimeout(timer);
  }
}

async function probeRabbitMq():
Promise<boolean> {
  const health =
    await fetchRabbitMqManagementApi(
      "/api/healthchecks/node",
    ) as { status?: string } | undefined;

  return health?.status === "ok";
}

async function probeMailpit():
Promise<boolean> {
  return probe(
    `${env.MAILPIT_URL}/readyz`,
  );
}

/*
 * Workers have no HTTP endpoint of their own, so liveness is inferred
 * from whether their queue has an active RabbitMQ consumer attached.
 */
async function probeWorkerConsumer(
  queueName: string,
): Promise<boolean> {
  const queue =
    await fetchRabbitMqManagementApi(
      `/api/queues/%2f/${encodeURIComponent(queueName)}`,
    ) as { consumers?: number } | undefined;

  return (
    (queue?.consumers ?? 0) > 0
  );
}

/*
 * Outbox publisher workers only publish, they never consume a queue, so
 * liveness is inferred from an open RabbitMQ connection carrying the
 * worker's fixed connection name instead. Both workers are checked off a
 * single fetch of the connection list.
 */
async function probeOutboxWorkerConnections(): Promise<{
  readonly todoOutboxWorkerAvailable: boolean;
  readonly accountOutboxWorkerAvailable: boolean;
}> {
  const connections =
    await fetchRabbitMqManagementApi(
      "/api/connections",
    ) as readonly {
      client_properties?: {
        connection_name?: string;
      };
    }[] | undefined;

  const hasConnection = (connectionNamePrefix: string): boolean =>
    connections?.some(
      (connection) =>
        connection.client_properties?.connection_name?.startsWith(
          connectionNamePrefix,
        ) === true,
    ) ?? false;

  return {
    todoOutboxWorkerAvailable: hasConnection(env.TODO_OUTBOX_WORKER_ID),
    accountOutboxWorkerAvailable: hasConnection(env.ACCOUNT_OUTBOX_WORKER_ID),
  };
}

export async function getGatewayDependencyHealth():
Promise<GatewayDependencyHealth> {
  const [
    accountHealth,
    todoHealth,
    rabbitmqAvailable,
    mailpitAvailable,
  ] =
    await Promise.all([
      probeDownstreamHealth(
        `${env.ACCOUNT_SERVICE_URL}/health`,
      ),
      probeDownstreamHealth(
        `${env.TODO_SERVICE_URL}/health/ready`,
      ),
      probeRabbitMq(),
      probeMailpit(),
    ]);

  /*
   * The per-queue and per-connection checks below all hit the same
   * RabbitMQ management API. If it is already known to be unreachable,
   * skip them instead of paying for several more redundant, and in
   * practice slow, failing lookups against the same host.
   */
  const [
    ownerProjectionWorkerAvailable,
    notificationWorkerAvailable,
    historyWorkerAvailable,
    outboxWorkerAvailability,
  ] =
    rabbitmqAvailable
      ? await Promise.all([
          probeWorkerConsumer(
            env.TODO_OWNER_QUEUE,
          ),
          probeWorkerConsumer(
            env.RABBITMQ_NOTIFICATION_QUEUE,
          ),
          probeWorkerConsumer(
            env.TODO_HISTORY_QUEUE,
          ),
          probeOutboxWorkerConnections(),
        ])
      : [
          false,
          false,
          false,
          {
            todoOutboxWorkerAvailable: false,
            accountOutboxWorkerAvailable: false,
          },
        ] as const;

  const {
    todoOutboxWorkerAvailable,
    accountOutboxWorkerAvailable,
  } = outboxWorkerAvailability;

  const redisAvailable =
    redis.isReady;

  const workers: Record<string, DependencyStatus> = {
    ownerProjectionConsumer:
      ownerProjectionWorkerAvailable
        ? "available"
        : "unavailable",

    notificationConsumer:
      notificationWorkerAvailable
        ? "available"
        : "unavailable",

    historyConsumer:
      historyWorkerAvailable
        ? "available"
        : "unavailable",

    todoOutboxPublisher:
      todoOutboxWorkerAvailable
        ? "available"
        : "unavailable",

    accountOutboxPublisher:
      accountOutboxWorkerAvailable
        ? "available"
        : "unavailable",
  };

  const allAvailable =
    accountHealth.available &&
    todoHealth.available &&
    redisAvailable &&
    rabbitmqAvailable &&
    mailpitAvailable &&
    Object.values(workers)
      .every((status) => status === "available");

  return {
    status:
      allAvailable
        ? "healthy"
        : "degraded",

    service:
      "gateway",

    dependencies: {
      redis:
        redisAvailable
          ? "available"
          : "unavailable",

      rabbitmq:
        rabbitmqAvailable
          ? "available"
          : "unavailable",

      mailpit:
        mailpitAvailable
          ? "available"
          : "unavailable",

      accountService:
        accountHealth.available
          ? "available"
          : "unavailable",

      todoService:
        todoHealth.available
          ? "available"
          : "unavailable",

      workers,
    },

    detail: {
      ...(accountHealth.dependencies === undefined
        ? {}
        : { accountService: accountHealth.dependencies }),

      ...(todoHealth.dependencies === undefined
        ? {}
        : { todoService: todoHealth.dependencies }),
    },
  };
}
