import { describe, it, expect, beforeEach } from 'vitest';
import { FileFilter } from '../src/lib/utils/FileFilter.js';

describe('FileFilter', () => {
  let fileFilter: FileFilter;

  beforeEach(() => {
    fileFilter = new FileFilter();
  });

  describe('constructor', () => {
    it('should initialize with default options', () => {
      const filter = new FileFilter();
      expect(filter).toBeInstanceOf(FileFilter);
    });

    it('should initialize with custom options', () => {
      const filter = new FileFilter({
        excludeNodeModules: false,
        excludeTestFiles: false,
        excludePatterns: ['*.log'],
        includePatterns: ['*.ts'],
        supportedExtensions: ['.ts', '.js']
      });
      expect(filter).toBeInstanceOf(FileFilter);
    });
  });

  describe('isTestFile', () => {
    it('should identify test files by directory', () => {
      expect(fileFilter.isTestFile('src/test/helper.ts')).toBe(true);
      expect(fileFilter.isTestFile('src/tests/unit.ts')).toBe(true);
      expect(fileFilter.isTestFile('src/__tests__/component.ts')).toBe(true);
      expect(fileFilter.isTestFile('src/__mocks__/api.ts')).toBe(true);
    });

    it('should identify test files by extension', () => {
      expect(fileFilter.isTestFile('src/component.test.ts')).toBe(true);
      expect(fileFilter.isTestFile('src/component.test.js')).toBe(true);
      expect(fileFilter.isTestFile('src/component.spec.ts')).toBe(true);
      expect(fileFilter.isTestFile('src/component.spec.jsx')).toBe(true);
    });

    it('should not identify regular files as test files', () => {
      expect(fileFilter.isTestFile('src/component.ts')).toBe(false);
      expect(fileFilter.isTestFile('src/utils/helper.js')).toBe(false);
      expect(fileFilter.isTestFile('src/testing-utils.ts')).toBe(false);
    });
  });

  describe('hasSupportedExtension', () => {
    it('should return true for supported extensions', () => {
      expect(fileFilter.hasSupportedExtension('file.ts')).toBe(true);
      expect(fileFilter.hasSupportedExtension('file.js')).toBe(true);
      expect(fileFilter.hasSupportedExtension('file.tsx')).toBe(true);
      expect(fileFilter.hasSupportedExtension('file.jsx')).toBe(true);
    });

    it('should return false for unsupported extensions', () => {
      expect(fileFilter.hasSupportedExtension('file.txt')).toBe(false);
      expect(fileFilter.hasSupportedExtension('file.md')).toBe(false);
      expect(fileFilter.hasSupportedExtension('file.py')).toBe(false);
    });

    it('should be case insensitive', () => {
      expect(fileFilter.hasSupportedExtension('file.TS')).toBe(true);
      expect(fileFilter.hasSupportedExtension('file.JS')).toBe(true);
    });
  });

  describe('isInNodeModules', () => {
    it('should identify node_modules files', () => {
      const filter = new FileFilter({ excludeNodeModules: true });
      expect(filter.isInNodeModules('node_modules/package/index.js')).toBe(true);
      expect(filter.isInNodeModules('src/node_modules/package/index.js')).toBe(true);
      expect(filter.isInNodeModules('path\\node_modules\\package\\index.js')).toBe(true);
    });

    it('should not identify regular files as node_modules', () => {
      expect(fileFilter.isInNodeModules('src/components/index.js')).toBe(false);
      expect(fileFilter.isInNodeModules('node_modules_backup/file.js')).toBe(false);
    });

    it('should respect excludeNodeModules option', () => {
      const filter = new FileFilter({ excludeNodeModules: false });
      expect(filter.isInNodeModules('node_modules/package/index.js')).toBe(false);
    });
  });

  describe('matchesExcludePatterns', () => {
    it('should match simple string patterns', () => {
      const filter = new FileFilter({ excludePatterns: ['temp', 'cache'] });
      expect(filter.matchesExcludePatterns('src/temp/file.js')).toBe(true);
      expect(filter.matchesExcludePatterns('cache/data.json')).toBe(true);
      expect(filter.matchesExcludePatterns('src/components/file.js')).toBe(false);
    });

    it('should match glob patterns', () => {
      const filter = new FileFilter({ excludePatterns: ['*.log', 'temp/*'] });
      expect(filter.matchesExcludePatterns('debug.log')).toBe(true);
      expect(filter.matchesExcludePatterns('temp/cache.txt')).toBe(true);
      expect(filter.matchesExcludePatterns('src/file.js')).toBe(false);
    });

    it('should return false when no exclude patterns', () => {
      expect(fileFilter.matchesExcludePatterns('any/file.js')).toBe(false);
    });
  });

  describe('matchesIncludePatterns', () => {
    it('should return true when no include patterns', () => {
      expect(fileFilter.matchesIncludePatterns('any/file.js')).toBe(true);
    });

    it('should match simple string patterns', () => {
      const filter = new FileFilter({ includePatterns: ['src', 'lib'] });
      expect(filter.matchesIncludePatterns('src/file.js')).toBe(true);
      expect(filter.matchesIncludePatterns('lib/utils.js')).toBe(true);
      expect(filter.matchesIncludePatterns('test/file.js')).toBe(false);
    });

    it('should match glob patterns', () => {
      const filter = new FileFilter({ includePatterns: ['src/*.ts', 'lib/**'] });
      expect(filter.matchesIncludePatterns('src/component.ts')).toBe(true);
      expect(filter.matchesIncludePatterns('lib/utils/helper.js')).toBe(true);
      expect(filter.matchesIncludePatterns('test/file.js')).toBe(false);
    });
  });

  describe('shouldInclude', () => {
    it('should include valid source files', () => {
      expect(fileFilter.shouldInclude('src/component.ts')).toBe(true);
      expect(fileFilter.shouldInclude('lib/utils.js')).toBe(true);
    });

    it('should exclude files with unsupported extensions', () => {
      expect(fileFilter.shouldInclude('src/readme.md')).toBe(false);
      expect(fileFilter.shouldInclude('config.json')).toBe(false);
    });

    it('should exclude node_modules files', () => {
      const filter = new FileFilter({ excludeNodeModules: true });
      expect(filter.shouldInclude('node_modules/package/index.js')).toBe(false);
    });

    it('should exclude test files by default', () => {
      expect(fileFilter.shouldInclude('src/component.test.ts')).toBe(false);
      expect(fileFilter.shouldInclude('tests/unit.js')).toBe(false);
    });

    it('should exclude files matching exclude patterns', () => {
      const filter = new FileFilter({ excludePatterns: ['*.log'] });
      expect(filter.shouldInclude('debug.log')).toBe(false);
    });

    it('should exclude files not matching include patterns', () => {
      const filter = new FileFilter({ includePatterns: ['src/*'] });
      expect(filter.shouldInclude('lib/utils.ts')).toBe(false);
    });
  });

  describe('filterFiles', () => {
    it('should filter array of file paths', () => {
      const filter = new FileFilter({ 
        excludeNodeModules: true,
        excludeTestFiles: true,
        supportedExtensions: ['.ts', '.js', '.tsx', '.jsx']
      });
      const files = [
        'src/component.ts',
        'src/component.test.ts',
        'node_modules/package/index.js',
        'readme.md',
        'lib/utils.js'
      ];

      const result = filter.filterFiles(files);

      expect(result).toEqual(['src/component.ts', 'lib/utils.js']);
    });
  });

  describe('getExclusionReason', () => {
    it('should return reason for unsupported extension', () => {
      const reason = fileFilter.getExclusionReason('file.txt');
      expect(reason).toContain('Unsupported extension');
    });

    it('should return reason for node_modules', () => {
      const filter = new FileFilter({ excludeNodeModules: true });
      const reason = filter.getExclusionReason('node_modules/package/index.js');
      expect(reason).toBe('File is in node_modules');
    });

    it('should return reason for test files', () => {
      const reason = fileFilter.getExclusionReason('src/component.test.ts');
      expect(reason).toBe('File is a test file');
    });

    it('should return null for included files', () => {
      const reason = fileFilter.getExclusionReason('src/component.ts');
      expect(reason).toBeNull();
    });
  });

  describe('static factory methods', () => {
    describe('createSourceFileFilter', () => {
      it('should create filter for source files', () => {
        const filter = FileFilter.createSourceFileFilter();
        expect(filter.shouldInclude('src/component.ts')).toBe(true);
        expect(filter.shouldInclude('src/component.test.ts')).toBe(false);
        expect(filter.shouldInclude('node_modules/package/index.js')).toBe(false);
      });
    });

    describe('createTestFileFilter', () => {
      it('should create filter for test files', () => {
        const filter = FileFilter.createTestFileFilter();
        expect(filter.shouldInclude('src/component.test.ts')).toBe(true);
        expect(filter.shouldInclude('tests/unit.js')).toBe(true);
        expect(filter.shouldInclude('src/component.ts')).toBe(false); // Test filter only includes test files due to includePatterns
      });
    });

    describe('createChangedFileFilter', () => {
      it('should create filter for changed files including tests', () => {
        const filter = FileFilter.createChangedFileFilter();
        expect(filter.shouldInclude('src/component.ts')).toBe(true);
        expect(filter.shouldInclude('src/component.test.ts')).toBe(true);
        expect(filter.shouldInclude('node_modules/package/index.js')).toBe(false);
      });
    });
  });
});