/**
 * On-Behalf-Of (OBO) Token Exchange Service
 * 
 * Exchanges a user's API access token for a Microsoft Graph token
 * using the OAuth 2.0 OBO flow. This allows the backend to call
 * Graph API (e.g., SharePoint) under the user's identity.
 * 
 * Requires:
 *   - AZURE_AD_CLIENT_ID
 *   - AZURE_AD_CLIENT_SECRET
 *   - AZURE_AD_TENANT_ID
 * 
 * References:
 *   - https://learn.microsoft.com/entra/identity-platform/v2-oauth2-on-behalf-of-flow
 *   - https://learn.microsoft.com/entra/msal/javascript/node/acquire-token-requests#on-behalf-of-flow
 */

const { ConfidentialClientApplication } = require('@azure/msal-node');
const { Client } = require('@microsoft/microsoft-graph-client');

let cca = null;

/**
 * Get or create the ConfidentialClientApplication singleton.
 * Lazy-initialized so the app starts fine without OBO env vars.
 */
function getConfidentialClient() {
  if (cca) return cca;

  const clientId = process.env.AZURE_AD_CLIENT_ID;
  const clientSecret = process.env.AZURE_AD_CLIENT_SECRET;
  const tenantId = process.env.AZURE_AD_TENANT_ID;

  if (!clientId || !clientSecret || !tenantId) {
    throw new Error(
      'OBO flow requires AZURE_AD_CLIENT_ID, AZURE_AD_CLIENT_SECRET, and AZURE_AD_TENANT_ID'
    );
  }

  cca = new ConfidentialClientApplication({
    auth: {
      clientId,
      // OBO requires tenant-specific authority, not 'common' or 'organizations'
      authority: `https://login.microsoftonline.com/${tenantId}`,
      clientSecret
    }
  });

  return cca;
}

/**
 * Check if OBO/SharePoint sync is configured
 */
function isOboConfigured() {
  return !!(
    process.env.AZURE_AD_CLIENT_ID &&
    process.env.AZURE_AD_CLIENT_SECRET &&
    process.env.AZURE_AD_TENANT_ID
  );
}

/**
 * Exchange a user's API access token for a Microsoft Graph token via OBO.
 * 
 * @param {string} userAccessToken - The Bearer token from the user's request
 * @param {string[]} scopes - Graph scopes to request (default: Sites.ReadWrite.All)
 * @returns {Promise<string>} Graph access token
 */
async function acquireGraphTokenOnBehalfOf(userAccessToken, scopes) {
  const client = getConfidentialClient();

  const oboRequest = {
    oboAssertion: userAccessToken,
    scopes: scopes || ['https://graph.microsoft.com/Sites.ReadWrite.All']
  };

  const response = await client.acquireTokenOnBehalfOf(oboRequest);

  if (!response || !response.accessToken) {
    throw new Error('OBO token exchange returned no access token');
  }

  return response.accessToken;
}

/**
 * Get a Microsoft Graph client authenticated via OBO for the given user.
 * 
 * @param {string} userAccessToken - The Bearer token from the user's request
 * @returns {Promise<Client>} Configured Microsoft Graph client
 */
async function getGraphClientOnBehalfOf(userAccessToken) {
  const graphToken = await acquireGraphTokenOnBehalfOf(userAccessToken);

  return Client.init({
    authProvider: (done) => {
      done(null, graphToken);
    }
  });
}

/**
 * Extract the Bearer token from an Express request's Authorization header.
 * 
 * @param {import('express').Request} req
 * @returns {string|null}
 */
function extractBearerToken(req) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }
  return authHeader.substring(7);
}

module.exports = {
  isOboConfigured,
  acquireGraphTokenOnBehalfOf,
  getGraphClientOnBehalfOf,
  extractBearerToken
};
