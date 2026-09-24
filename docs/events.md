# Integration Event Catalogue

## Status

This catalogue documents the integration-event envelope and the events currently implemented or reserved by shared contracts.

An event must not be described as operational until its publisher, durable transport, consumer behaviour and failure handling have been verified.

## Transport

RabbitMQ is used for asynchronous integration.

The system uses:

- Durable exchanges
- Durable queues
- Persistent messages
- Publisher confirmations
- Retry queues
- Dead-letter queues
- Manual consumer acknowledgement

## Common Event Envelope

Every integration event uses this structure:

```json
{
  "eventId": "65dfe1ea-29a8-4ff9-a127-5419383e650f",
  "eventType": "todo.shared",
  "eventVersion": 1,
  "producer": "todo-service",
  "requestId": "a338e345-c591-4c98-9ea3-8394980609e1",
  "occurredAt": "2026-09-23T10:00:00.000Z",
  "payload": {}
}

## TODO integration events

The TODO Service uses versioned integration events to communicate completed TODO-domain changes to other services.

Part 14 introduces the event contracts and transactional outbox persistence component. Runtime event creation and publishing are connected to TODO operations in Part 15.

### Common event envelope

Every TODO integration event uses this envelope:

| Field | Type | Description |
|---|---|---|
| `eventId` | UUID | Globally unique event identifier |
| `eventType` | string | Name of the event |
| `eventVersion` | number | Version of the event contract |
| `producer` | string | Service that produced the event |
| `requestId` | UUID | Request that caused the event |
| `occurredAt` | ISO-8601 datetime | Time the domain change occurred |
| `payload` | object | Event-specific information |

All current TODO events use:

```json
{
  "eventVersion": 1,
  "producer": "todo-service"
}


#### Publication condition

`todo.completed` is created only when a TODO transitions from a state other than `completed` to `completed`.

Updating an already-completed TODO without leaving the completed state does not create another completion event.

The event is inserted into the TODO Service outbox in the same PostgreSQL transaction as the state update. If either the update or outbox insertion fails, both operations roll back.

The `completedByUserId` field identifies the owner or active share recipient who completed the TODO.