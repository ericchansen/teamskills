jest.mock('@azure/msal-node');
jest.mock('@microsoft/microsoft-graph-client');

const { ConfidentialClientApplication } = require('@azure/msal-node');
const { Client } = require('@microsoft/microsoft-graph-client');

describe('OBO Client Service', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    process.env = {
      ...originalEnv,
      AZURE_AD_CLIENT_ID: 'test-client-id',
      AZURE_AD_CLIENT_SECRET: 'test-secret',
      AZURE_AD_TENANT_ID: 'test-tenant-id'
    };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  test('isOboConfigured returns true when all env vars set', () => {
    const { isOboConfigured } = require('../../backend/services/oboClient');
    expect(isOboConfigured()).toBe(true);
  });

  test('isOboConfigured returns false when client secret missing', () => {
    delete process.env.AZURE_AD_CLIENT_SECRET;
    const { isOboConfigured } = require('../../backend/services/oboClient');
    expect(isOboConfigured()).toBe(false);
  });

  test('acquireGraphTokenOnBehalfOf exchanges token via OBO', async () => {
    const mockAcquire = jest.fn().mockResolvedValue({ accessToken: 'graph-token-123' });
    ConfidentialClientApplication.mockImplementation(() => ({
      acquireTokenOnBehalfOf: mockAcquire
    }));

    // Re-require after mock setup to get fresh singleton
    jest.resetModules();
    jest.doMock('@azure/msal-node', () => ({ ConfidentialClientApplication }));
    const { acquireGraphTokenOnBehalfOf } = require('../../backend/services/oboClient');
    const token = await acquireGraphTokenOnBehalfOf('user-api-token');

    expect(token).toBe('graph-token-123');
    expect(mockAcquire).toHaveBeenCalledWith({
      oboAssertion: 'user-api-token',
      scopes: ['https://graph.microsoft.com/Sites.ReadWrite.All']
    });
  });

  test('acquireGraphTokenOnBehalfOf throws when no access token returned', async () => {
    ConfidentialClientApplication.mockImplementation(() => ({
      acquireTokenOnBehalfOf: jest.fn().mockResolvedValue(null)
    }));

    jest.resetModules();
    jest.doMock('@azure/msal-node', () => ({ ConfidentialClientApplication }));
    const { acquireGraphTokenOnBehalfOf } = require('../../backend/services/oboClient');
    await expect(acquireGraphTokenOnBehalfOf('user-token'))
      .rejects.toThrow('OBO token exchange returned no access token');
  });

  test('getGraphClientOnBehalfOf returns a configured Graph client', async () => {
    const mockGraphClient = { api: jest.fn() };
    Client.init.mockReturnValue(mockGraphClient);
    ConfidentialClientApplication.mockImplementation(() => ({
      acquireTokenOnBehalfOf: jest.fn().mockResolvedValue({ accessToken: 'graph-token' })
    }));

    jest.resetModules();
    jest.doMock('@azure/msal-node', () => ({ ConfidentialClientApplication }));
    jest.doMock('@microsoft/microsoft-graph-client', () => ({ Client }));
    const { getGraphClientOnBehalfOf } = require('../../backend/services/oboClient');
    const client = await getGraphClientOnBehalfOf('user-token');

    expect(client).toBe(mockGraphClient);
    expect(Client.init).toHaveBeenCalled();
  });

  test('extractBearerToken extracts token from Authorization header', () => {
    const { extractBearerToken } = require('../../backend/services/oboClient');
    
    expect(extractBearerToken({ headers: { authorization: 'Bearer abc123' } })).toBe('abc123');
    expect(extractBearerToken({ headers: { authorization: 'Basic abc' } })).toBeNull();
    expect(extractBearerToken({ headers: {} })).toBeNull();
  });
});
