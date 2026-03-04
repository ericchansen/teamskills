/**
 * Tests for Power Automate Sync Service
 * 
 * Tests the workaround proxy that calls Power Automate HTTP trigger
 * flows instead of Microsoft Graph API directly.
 */

// Mock global fetch
const mockFetch = jest.fn();
global.fetch = mockFetch;

describe('Power Automate Sync Service', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('isPowerAutomateConfigured', () => {
    test('returns true when pull flow URL is set', () => {
      process.env.SHAREPOINT_PULL_FLOW_URL = 'https://flow.example.com/pull?sig=abc';
      const { isPowerAutomateConfigured } = require('../../backend/services/powerAutomateSync');
      expect(isPowerAutomateConfigured()).toBe(true);
    });

    test('returns false when pull flow URL is not set', () => {
      delete process.env.SHAREPOINT_PULL_FLOW_URL;
      const { isPowerAutomateConfigured } = require('../../backend/services/powerAutomateSync');
      expect(isPowerAutomateConfigured()).toBe(false);
    });

    test('returns false when pull flow URL is empty', () => {
      process.env.SHAREPOINT_PULL_FLOW_URL = '';
      const { isPowerAutomateConfigured } = require('../../backend/services/powerAutomateSync');
      expect(isPowerAutomateConfigured()).toBe(false);
    });
  });

  describe('pullFromSharePoint', () => {
    test('calls flow URL and returns items array', async () => {
      process.env.SHAREPOINT_PULL_FLOW_URL = 'https://flow.example.com/pull?sig=abc';
      const items = [
        { Title: 'Jane Doe', Qualifier: 'Apps & AI', 'GitHub Copilot': 400 }
      ];
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(items)
      });

      const { pullFromSharePoint } = require('../../backend/services/powerAutomateSync');
      const result = await pullFromSharePoint();

      expect(mockFetch).toHaveBeenCalledWith(
        'https://flow.example.com/pull?sig=abc',
        expect.objectContaining({ method: 'POST' })
      );
      expect(result).toEqual(items);
    });

    test('unwraps { value: [...] } response', async () => {
      process.env.SHAREPOINT_PULL_FLOW_URL = 'https://flow.example.com/pull?sig=abc';
      const items = [{ Title: 'Jane' }];
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ value: items })
      });

      const { pullFromSharePoint } = require('../../backend/services/powerAutomateSync');
      const result = await pullFromSharePoint();
      expect(result).toEqual(items);
    });

    test('throws on non-OK response', async () => {
      process.env.SHAREPOINT_PULL_FLOW_URL = 'https://flow.example.com/pull?sig=abc';
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        text: () => Promise.resolve('Internal error')
      });

      const { pullFromSharePoint } = require('../../backend/services/powerAutomateSync');
      await expect(pullFromSharePoint()).rejects.toThrow('returned 500');
    });

    test('throws when URL not configured', async () => {
      delete process.env.SHAREPOINT_PULL_FLOW_URL;
      const { pullFromSharePoint } = require('../../backend/services/powerAutomateSync');
      await expect(pullFromSharePoint()).rejects.toThrow('not configured');
    });

    test('throws on timeout', async () => {
      process.env.SHAREPOINT_PULL_FLOW_URL = 'https://flow.example.com/pull?sig=abc';
      mockFetch.mockImplementation(() => {
        const err = new Error('aborted');
        err.name = 'AbortError';
        return Promise.reject(err);
      });

      const { pullFromSharePoint } = require('../../backend/services/powerAutomateSync');
      await expect(pullFromSharePoint()).rejects.toThrow('timed out');
    });
  });

  describe('transformFlowItemsToPivotFormat', () => {
    test('transforms SharePoint items to pivot format', () => {
      const { transformFlowItemsToPivotFormat } = require('../../backend/services/powerAutomateSync');

      const items = [
        {
          ID: 1,
          Title: 'Jane Doe',
          Alias: 'Jane Doe',
          Qualifier: 'Apps & AI',
          'GitHub Copilot': 400,
          'Azure SRE Agent': 300,
          Modified: '2024-01-01'
        },
        {
          ID: 2,
          Title: 'John Smith',
          Alias: 'John Smith',
          Qualifier: 'Data',
          'GitHub Copilot': 100,
          'Azure SRE Agent': 100,
          Modified: '2024-01-01'
        }
      ];

      const result = transformFlowItemsToPivotFormat(items);

      expect(result.skillNames).toContain('GitHub Copilot');
      expect(result.skillNames).toContain('Azure SRE Agent');
      expect(result.skillNames).not.toContain('Title');
      expect(result.skillNames).not.toContain('ID');
      expect(result.skillNames).not.toContain('Modified');

      expect(result.rows).toHaveLength(2);
      expect(result.rows[0]).toEqual({
        name: 'Jane Doe',
        team: 'Apps & AI',
        skills: { 'GitHub Copilot': 'L400', 'Azure SRE Agent': 'L300' }
      });
      expect(result.rows[1]).toEqual({
        name: 'John Smith',
        team: 'Data',
        skills: { 'GitHub Copilot': 'L100', 'Azure SRE Agent': 'L100' }
      });
    });

    test('skips items without Title', () => {
      const { transformFlowItemsToPivotFormat } = require('../../backend/services/powerAutomateSync');
      const items = [
        { Title: '', Qualifier: 'Test', 'Skill A': 200 },
        { Title: 'Valid User', Qualifier: 'Test', 'Skill A': 200 }
      ];

      const result = transformFlowItemsToPivotFormat(items);
      expect(result.rows).toHaveLength(1);
      expect(result.rows[0].name).toBe('Valid User');
    });

    test('handles empty items array', () => {
      const { transformFlowItemsToPivotFormat } = require('../../backend/services/powerAutomateSync');
      const result = transformFlowItemsToPivotFormat([]);
      expect(result.skillNames).toEqual([]);
      expect(result.rows).toEqual([]);
    });

    test('ignores invalid proficiency values', () => {
      const { transformFlowItemsToPivotFormat } = require('../../backend/services/powerAutomateSync');
      const items = [
        {
          Title: 'Test User',
          Qualifier: 'Test',
          'Skill A': 400,
          'Skill B': 50,     // too low
          'Skill C': 'N/A',  // non-numJane
          'Skill D': null,   // null
          'Skill E': 500     // invalid level
        }
      ];

      const result = transformFlowItemsToPivotFormat(items);
      expect(result.rows[0].skills).toEqual({ 'Skill A': 'L400' });
    });

    test('filters OData metadata fields', () => {
      const { transformFlowItemsToPivotFormat } = require('../../backend/services/powerAutomateSync');
      const items = [
        {
          '@odata.type': '#SP.Data.SkillsListItem',
          '@odata.etag': '"1"',
          Title: 'Test User',
          Qualifier: 'Test',
          ContentTypeId: '0x01',
          GUID: 'abc-123',
          'Real Skill': 300
        }
      ];

      const result = transformFlowItemsToPivotFormat(items);
      expect(result.skillNames).toEqual(['Real Skill']);
    });
  });

  describe('pushToSharePoint', () => {
    test('sends POST to push flow URL', async () => {
      process.env.SHAREPOINT_PUSH_FLOW_URL = 'https://flow.example.com/push?sig=xyz';
      mockFetch.mockResolvedValue({
        ok: true,
        text: () => Promise.resolve(JSON.stringify({ status: 'success' }))
      });

      const { pushToSharePoint } = require('../../backend/services/powerAutomateSync');
      const result = await pushToSharePoint('Jane Doe', { 'GitHub Copilot': 400 });

      expect(mockFetch).toHaveBeenCalledWith(
        'https://flow.example.com/push?sig=xyz',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            userName: 'Jane Doe',
            fields: { 'GitHub Copilot': 400 }
          })
        })
      );
      expect(result).toEqual({ status: 'success' });
    });

    test('handles 202 Accepted with empty body', async () => {
      process.env.SHAREPOINT_PUSH_FLOW_URL = 'https://flow.example.com/push?sig=xyz';
      mockFetch.mockResolvedValue({
        ok: true,
        text: () => Promise.resolve('')
      });

      const { pushToSharePoint } = require('../../backend/services/powerAutomateSync');
      const result = await pushToSharePoint('Jane Doe', { 'Skill A': 200 });
      expect(result).toEqual({ status: 'accepted' });
    });

    test('throws when URL not configured', async () => {
      delete process.env.SHAREPOINT_PUSH_FLOW_URL;
      const { pushToSharePoint } = require('../../backend/services/powerAutomateSync');
      await expect(pushToSharePoint('Jane', {})).rejects.toThrow('not configured');
    });

    test('throws on non-OK response', async () => {
      process.env.SHAREPOINT_PUSH_FLOW_URL = 'https://flow.example.com/push?sig=xyz';
      mockFetch.mockResolvedValue({
        ok: false,
        status: 400,
        text: () => Promise.resolve('Bad request')
      });

      const { pushToSharePoint } = require('../../backend/services/powerAutomateSync');
      await expect(pushToSharePoint('Jane', {})).rejects.toThrow('returned 400');
    });
  });
});
