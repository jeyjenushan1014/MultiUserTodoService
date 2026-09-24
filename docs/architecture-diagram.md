# Architecture Diagram

The diagram shows the public boundary, synchronous calls, owned datastores, asynchronous event paths, and independent workers.

```mermaid
flowchart LR
    Client[Client]
    Gateway[Gateway :3000\nJWT verification\nrate limit\nrequest ID]
    Account[Account Service :3001\nusers and sessions]
    Todo[Todo Service :3002\nTODOs and shares]
    AccountDB[(Account PostgreSQL)]
    TodoDB[(Todo PostgreSQL)]
    Redis[(Redis\ncache and counters)]
    Rabbit[(RabbitMQ\ntodo.events exchange)]
    Mail[Mailpit\nSMTP and UI]
    AccountOutbox[Account outbox worker]
    TodoOutbox[Todo outbox worker]
    Owner[Todo owner consumer]
    Notify[Account notification consumer]
    History[Todo history worker]

    Client -->|public API| Gateway
    Gateway -->|signed identity, bounded HTTP| Account
    Gateway -->|signed identity, bounded HTTP| Todo
    Account --> AccountDB
    Todo --> TodoDB
    Gateway -.->|rate-limit counters| Redis
    Todo -.->|read cache and invalidation| Redis
    AccountDB --> AccountOutbox
    TodoDB --> TodoOutbox
    AccountOutbox -->|account events| Rabbit
    TodoOutbox -->|todo events| Rabbit
    Rabbit --> Owner
    Rabbit --> Notify
    Rabbit --> History
    Owner --> TodoDB
    Notify --> Mail
    History --> TodoDB
```

The account and todo databases have no cross-database foreign keys. `todo_owners` is the Todo Service's event-built account projection. The Gateway does not contain TODO or account business rules; it authenticates, limits, routes, and translates transport errors.
