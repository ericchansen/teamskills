# Wake Function

Azure Function to automatically wake (start) the PostgreSQL Flexible Server when it's stopped.

## Endpoints

- `GET/POST /api/wake-postgres` - Check PostgreSQL server status and start if stopped

## Response

```json
{
  "status": "ready|starting|transitioning|error",
  "message": "Description of the current state",
  "serverState": "Ready|Stopped|Starting|..."
}
```

## Status Codes

- `200` - Server is ready or in transition
- `202` - Server start initiated
- `500` - Error occurred

## Local Development

1. Set environment variables in `local.settings.json`:
   - `AZURE_SUBSCRIPTION_ID`
   - `POSTGRES_SERVER_RESOURCE_ID`

2. Run locally:
   ```bash
   npm install
   npm start
   ```

## Deployment

This function is deployed automatically via Azure Developer CLI (azd) as part of the infrastructure.
