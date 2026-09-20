## Repository strategy

The system uses a TypeScript monorepo with npm workspaces.

Applications are independently buildable and deployable. Shared technical
contracts are versioned through workspace packages rather than copied between
services.

### Applications

- Gateway: the only public entry point.
- Account Service: owns accounts, credentials and sessions.
- Task Service: will own tasks and sharing.
- Activity Service: will own task-history records.
- Notification Service: will own email delivery.

### Shared packages

- `@todo/contracts`: error, identity and event contracts.
- `@todo/common`: deliberately shared technical utilities.

Shared packages do not contain service-specific business rules.

## Gateway

The Gateway is the only public network entry point.

It owns no business rules. It is responsible for:

- Generating request identifiers
- Request logging
- Authentication
- Signed internal caller identity
- Distributed rate limiting
- Routing requests to the owning service
- Aggregate health reporting

Redis stores distributed counters. If Redis is unavailable, the Gateway
continues in a documented degraded mode and reports the dependency failure
through its health endpoints.

The Gateway can start while the Account Service is unavailable.