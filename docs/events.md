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