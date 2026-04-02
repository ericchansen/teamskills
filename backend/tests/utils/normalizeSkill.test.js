const { normalizeSkillName, getCanonicalSkillInfo, suggestSkillProposal } = require('../../utils/normalizeSkill');

describe('normalizeSkillName', () => {
  describe('explicit aliases', () => {
    it('maps dedup suffix aliases', () => {
      expect(normalizeSkillName('Azure Container Apps2')).toBe('Azure Container Apps');
      expect(normalizeSkillName('Azure Functions3')).toBe('Azure Functions');
      expect(normalizeSkillName('Azure Firewall4')).toBe('Azure Firewall');
    });

    it('maps URL-encoded aliases', () => {
      expect(normalizeSkillName('C%23 / .NET')).toBe('C# / .NET');
    });

    it('maps Fabric-prefixed aliases', () => {
      expect(normalizeSkillName('Fabric OneLake')).toBe('OneLake');
      expect(normalizeSkillName('Fabric Data Factory')).toBe('Data Factory');
      expect(normalizeSkillName('Fabric Data Warehouse')).toBe('Data Warehouse');
      expect(normalizeSkillName('Fabric Real Time Intelligence')).toBe('Real Time Intelligence');
    });

    it('does not auto-merge ambiguous combined Fabric labels', () => {
      expect(normalizeSkillName('Fabric Data Engineering and Data Science')).toBe('Fabric Data Engineering and Data Science');
    });
  });

  describe('generic trailing digit stripping', () => {
    it('strips 1-2 trailing digits when base ends with a letter', () => {
      expect(normalizeSkillName('SomeSkill7')).toBe('SomeSkill');
      expect(normalizeSkillName('AnotherThing12')).toBe('AnotherThing');
    });

    it('strips trailing digits when base ends with closing paren', () => {
      expect(normalizeSkillName('Azure Kubernetes Service (AKS)2')).toBe('Azure Kubernetes Service (AKS)');
    });
  });

  describe('names that should NOT be normalized', () => {
    it('preserves names without trailing digits', () => {
      expect(normalizeSkillName('Azure Bastion')).toBe('Azure Bastion');
      expect(normalizeSkillName('Power BI')).toBe('Power BI');
      expect(normalizeSkillName('CosmosDB')).toBe('CosmosDB');
    });

    it('preserves names where digits are part of the real name', () => {
      expect(normalizeSkillName('SQL DB')).toBe('SQL DB');
      expect(normalizeSkillName('L200')).toBe('L200');
      expect(normalizeSkillName('Azure Arc')).toBe('Azure Arc');
    });
  });

  describe('URL decoding fallthrough', () => {
    it('decodes percent-encoded characters not in alias map', () => {
      expect(normalizeSkillName('Hello%20World')).toBe('Hello World');
    });
  });

  describe('edge cases', () => {
    it('returns null/undefined as-is', () => {
      expect(normalizeSkillName(null)).toBeNull();
      expect(normalizeSkillName(undefined)).toBeUndefined();
    });

    it('trims whitespace', () => {
      expect(normalizeSkillName('  Azure Bastion  ')).toBe('Azure Bastion');
    });

    it('returns empty string as-is', () => {
      expect(normalizeSkillName('')).toBe('');
    });
  });

  describe('canonical metadata', () => {
    it('returns preferred display labels for Microsoft product names', () => {
      expect(getCanonicalSkillInfo('Data Factory')).toMatchObject({
        canonicalName: 'Data Factory',
        preferredLabel: 'Fabric Data Factory',
        vendorNamespace: 'Microsoft Fabric',
      });
    });

    it('flags review-required Fabric combined labels for approval', () => {
      expect(suggestSkillProposal('Fabric Data Engineering and Data Science')).toMatchObject({
        suggestedAction: 'split',
        needsReview: true,
      });
    });
  });
});
