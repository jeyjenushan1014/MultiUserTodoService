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