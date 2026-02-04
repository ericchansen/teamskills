const { app } = require('@azure/functions');
const { PostgreSQLManagementFlexibleServerClient } = require('@azure/arm-postgresql-flexible');
const { DefaultAzureCredential } = require('@azure/identity');

app.http('wake-postgres', {
  methods: ['GET', 'POST'],
  authLevel: 'anonymous',
  handler: async (request, context) => {
    context.log('Wake PostgreSQL function triggered');

    const subscriptionId = process.env.AZURE_SUBSCRIPTION_ID;
    const resourceId = process.env.POSTGRES_SERVER_RESOURCE_ID;

    if (!subscriptionId || !resourceId) {
      return {
        status: 500,
        jsonBody: {
          status: 'error',
          message: 'Missing AZURE_SUBSCRIPTION_ID or POSTGRES_SERVER_RESOURCE_ID environment variable'
        }
      };
    }

    // Parse resource ID: /subscriptions/{sub}/resourceGroups/{rg}/providers/Microsoft.DBforPostgreSQL/flexibleServers/{name}
    const resourceIdParts = resourceId.split('/');
    const resourceGroupIndex = resourceIdParts.indexOf('resourceGroups');
    const serverNameIndex = resourceIdParts.indexOf('flexibleServers');

    if (resourceGroupIndex === -1 || serverNameIndex === -1) {
      return {
        status: 500,
        jsonBody: {
          status: 'error',
          message: 'Invalid POSTGRES_SERVER_RESOURCE_ID format'
        }
      };
    }

    const resourceGroupName = resourceIdParts[resourceGroupIndex + 1];
    const serverName = resourceIdParts[serverNameIndex + 1];

    try {
      const credential = new DefaultAzureCredential();
      const client = new PostgreSQLManagementFlexibleServerClient(credential, subscriptionId);

      // Get server status
      context.log(`Checking status of server: ${serverName}`);
      const server = await client.servers.get(resourceGroupName, serverName);
      const currentState = server.state;

      context.log(`Current server state: ${currentState}`);

      if (currentState === 'Ready') {
        return {
          status: 200,
          jsonBody: {
            status: 'ready',
            message: 'PostgreSQL server is already running',
            serverState: currentState
          }
        };
      }

      if (currentState === 'Stopped') {
        context.log('Starting PostgreSQL server...');
        
        // Start the server (this is a long-running operation)
        const startOperation = await client.servers.beginStart(resourceGroupName, serverName);
        
        // Don't wait for completion - return immediately
        return {
          status: 202,
          jsonBody: {
            status: 'starting',
            message: 'PostgreSQL server is starting. This may take 3-5 minutes.',
            serverState: 'Starting'
          }
        };
      }

      // Server is in transition state (Starting, Stopping, etc.)
      return {
        status: 200,
        jsonBody: {
          status: 'transitioning',
          message: `PostgreSQL server is in ${currentState} state`,
          serverState: currentState
        }
      };

    } catch (error) {
      context.log(`Error: ${error.message}`);
      return {
        status: 500,
        jsonBody: {
          status: 'error',
          message: error.message
        }
      };
    }
  }
});
