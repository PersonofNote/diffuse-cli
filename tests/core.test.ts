import { describe, it, expect } from 'vitest';

describe('Core Functionality', () => {
  describe('Test File Detection', () => {
    const isTestFile = (filePath: string): boolean => {
      return /(^|\/)(test|tests|__tests__|__mocks__)(\/|$)/.test(filePath) || 
             /\.test\.(t|j)sx?$/.test(filePath) || 
             /\.spec\.(t|j)sx?$/.test(filePath);
    };

    it('should identify test files by directory patterns', () => {
      expect(isTestFile('src/test/helper.ts')).toBe(true);
      expect(isTestFile('src/tests/unit.ts')).toBe(true);
      expect(isTestFile('src/__tests__/component.ts')).toBe(true);
      expect(isTestFile('src/__mocks__/api.ts')).toBe(true);
      expect(isTestFile('test/integration.js')).toBe(true);
      expect(isTestFile('tests/e2e.js')).toBe(true);
    });

    it('should identify test files by extension patterns', () => {
      expect(isTestFile('component.test.ts')).toBe(true);
      expect(isTestFile('component.test.js')).toBe(true);
      expect(isTestFile('component.spec.tsx')).toBe(true);
      expect(isTestFile('component.spec.jsx')).toBe(true);
      expect(isTestFile('src/utils.test.ts')).toBe(true);
      expect(isTestFile('lib/helper.spec.js')).toBe(true);
    });

    it('should not identify regular files as test files', () => {
      expect(isTestFile('src/component.ts')).toBe(false);
      expect(isTestFile('src/utils/helper.js')).toBe(false);
      expect(isTestFile('src/testing-utils.ts')).toBe(false);
      expect(isTestFile('lib/test-helpers.js')).toBe(false);
      expect(isTestFile('config/jest.config.js')).toBe(false);
    });
  });

  describe('File Extension Support', () => {
    const SUPPORTED_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx'];
    
    const hasSupportedExtension = (filePath: string): boolean => {
      return SUPPORTED_EXTENSIONS.some(ext => 
        filePath.toLowerCase().endsWith(ext.toLowerCase())
      );
    };

    it('should support TypeScript files', () => {
      expect(hasSupportedExtension('component.ts')).toBe(true);
      expect(hasSupportedExtension('component.tsx')).toBe(true);
      expect(hasSupportedExtension('Component.TS')).toBe(true);
      expect(hasSupportedExtension('Component.TSX')).toBe(true);
    });

    it('should support JavaScript files', () => {
      expect(hasSupportedExtension('component.js')).toBe(true);
      expect(hasSupportedExtension('component.jsx')).toBe(true);
      expect(hasSupportedExtension('Component.JS')).toBe(true);
      expect(hasSupportedExtension('Component.JSX')).toBe(true);
    });

    it('should not support other file types', () => {
      expect(hasSupportedExtension('README.md')).toBe(false);
      expect(hasSupportedExtension('package.json')).toBe(false);
      expect(hasSupportedExtension('style.css')).toBe(false);
      expect(hasSupportedExtension('image.png')).toBe(false);
      expect(hasSupportedExtension('script.py')).toBe(false);
    });
  });

  describe('Node Modules Detection', () => {
    const isInNodeModules = (filePath: string): boolean => {
      const normalizedPath = filePath.replace(/\\/g, '/');
      return normalizedPath.includes('/node_modules/') || 
             normalizedPath.startsWith('node_modules/');
    };

    it('should identify node_modules files', () => {
      expect(isInNodeModules('node_modules/package/index.js')).toBe(true);
      expect(isInNodeModules('src/node_modules/package/index.js')).toBe(true);
      expect(isInNodeModules('path/node_modules/package/index.js')).toBe(true);
      expect(isInNodeModules('path\\node_modules\\package\\index.js')).toBe(true);
    });

    it('should not identify regular files as node_modules', () => {
      expect(isInNodeModules('src/components/index.js')).toBe(false);
      expect(isInNodeModules('node_modules_backup/file.js')).toBe(false);
      expect(isInNodeModules('src/node-modules-helper.js')).toBe(false);
    });
  });

  describe('File Filtering Logic', () => {
    const SUPPORTED_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx'];
    
    const shouldIncludeFile = (filePath: string): boolean => {
      // Check supported extension
      const hasSupportedExt = SUPPORTED_EXTENSIONS.some(ext => 
        filePath.toLowerCase().endsWith(ext.toLowerCase())
      );
      if (!hasSupportedExt) return false;

      // Check node_modules
      const normalizedPath = filePath.replace(/\\/g, '/');
      if (normalizedPath.includes('/node_modules/') || normalizedPath.startsWith('node_modules/')) return false;

      // Check test files
      const isTest = /(^|\/)(test|tests|__tests__|__mocks__)(\/|$)/.test(filePath) || 
                     /\.test\.(t|j)sx?$/.test(filePath) || 
                     /\.spec\.(t|j)sx?$/.test(filePath);
      if (isTest) return false;

      return true;
    };

    it('should include valid source files', () => {
      expect(shouldIncludeFile('src/component.ts')).toBe(true);
      expect(shouldIncludeFile('lib/utils.js')).toBe(true);
      expect(shouldIncludeFile('components/Button.tsx')).toBe(true);
      expect(shouldIncludeFile('hooks/useApi.jsx')).toBe(true);
    });

    it('should exclude unsupported file types', () => {
      expect(shouldIncludeFile('README.md')).toBe(false);
      expect(shouldIncludeFile('package.json')).toBe(false);
      expect(shouldIncludeFile('style.css')).toBe(false);
    });

    it('should exclude node_modules files', () => {
      expect(shouldIncludeFile('node_modules/react/index.js')).toBe(false);
      expect(shouldIncludeFile('src/node_modules/package/index.ts')).toBe(false);
    });

    it('should exclude test files', () => {
      expect(shouldIncludeFile('src/component.test.ts')).toBe(false);
      expect(shouldIncludeFile('tests/unit.js')).toBe(false);
      expect(shouldIncludeFile('src/__tests__/helper.tsx')).toBe(false);
      expect(shouldIncludeFile('lib/utils.spec.jsx')).toBe(false);
    });
  });
});