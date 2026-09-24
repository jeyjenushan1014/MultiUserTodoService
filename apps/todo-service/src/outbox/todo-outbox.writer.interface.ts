import type {
  PoolClient,
} from "pg";

import type {
  TodoIntegrationEvent,
} from "@todo/contracts";

export type TodoOutboxTransaction =
  Pick<
    PoolClient,
    "query"
  >;

export interface TodoOutboxWriter {
  append(
    transaction:
      TodoOutboxTransaction,

    event:
      TodoIntegrationEvent,
  ): Promise<void>;
}