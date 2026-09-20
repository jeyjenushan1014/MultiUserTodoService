## Health endpoints

### GET /health/live

Reports whether the Gateway process is running.Reports wheather the Gateway is ready to accept API traffic.

#### Authentication

Not required.

#### Successful response

Status: `200 OK`-> Required Gateway dependencies are available
Status : `503 Service Unavailable`-> Required  dependency is unavailable

```json
{
  "status": "alive",
  "service": "gateway"
}