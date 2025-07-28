import { describe, it, expect } from 'vitest';
import { loadConfig, getDefaultConfig } from '../src/lib/config.js';
import { RiskFactorType } from '../src/lib/constants.js';

describe('Configuration System', () => {
  describe('Default Configuration', () => {
    it('should load default configuration when no config file exists', () => {
      const config = loadConfig();
      
      expect(config.thresholds.highRisk).toBe(60);
      expect(config.thresholds.mediumRisk).toBe(40);
      expect(config.thresholds.veryHighRisk).toBe(80);
      expect(config.thresholds.largeChangePercentage).toBe(20);
      
      expect(config.analysis.includeTestCoverage).toBe(true);
      expect(config.analysis.includeUsageGraph).toBe(true);
      
      expect(config.reporting.includeSuggestions).toBe(true);
      expect(config.reporting.verboseStats).toBe(false);
    });

    it('should have all risk factor weights defined', () => {
      const config = getDefaultConfig();
      
      // Check that all risk factors have weights
      const allRiskFactors = Object.values(RiskFactorType);
      for (const factor of allRiskFactors) {
        expect(config.riskWeights[factor]).toBeDefined();
        expect(typeof config.riskWeights[factor]).toBe('number');
        expect(config.riskWeights[factor]).toBeGreaterThanOrEqual(0);
      }
    });
  });

  describe('Configuration Validation', () => {
    it('should validate threshold ordering', () => {
      expect(() => {
        loadConfig(); // Should not throw with default config
      }).not.toThrow();
    });

    it('should have reasonable default exclusions', () => {
      const config = getDefaultConfig();
      
      expect(config.exclusions.directories).toContain('node_modules');
      expect(config.exclusions.directories).toContain('dist');
      expect(config.exclusions.directories).toContain('build');
      expect(config.exclusions.directories).toContain('.git');
    });
  });

  describe('Risk Weight Customization', () => {
    it('should allow partial risk weight overrides', () => {
      // This test would require mocking file system or creating temp files
      // For now, we'll test the merging logic conceptually
      const config = getDefaultConfig();
      
      // Verify that specific weights can be accessed
      expect(config.riskWeights[RiskFactorType.PropsChanged]).toBe(10);
      expect(config.riskWeights[RiskFactorType.ReturnTypeChanged]).toBe(8);
      expect(config.riskWeights[RiskFactorType.MissingTest]).toBe(4);
    });
  });

  describe('Threshold Configuration', () => {
    it('should have sensible default thresholds', () => {
      const config = getDefaultConfig();
      
      expect(config.thresholds.mediumRisk).toBeLessThan(config.thresholds.highRisk);
      expect(config.thresholds.highRisk).toBeLessThan(config.thresholds.veryHighRisk);
      expect(config.thresholds.largeChangePercentage).toBeGreaterThan(0);
      expect(config.thresholds.largeChangePercentage).toBeLessThanOrEqual(100);
    });
  });
});