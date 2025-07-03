import path from 'path';
import { SUPPORTED_EXTENSIONS } from '../constants.js';

export interface FileFilterOptions {
  excludeNodeModules?: boolean;
  excludeTestFiles?: boolean;
  excludePatterns?: string[];
  includePatterns?: string[];
  supportedExtensions?: string[];
}

export class FileFilter {
  private options: Required<FileFilterOptions>;

  constructor(options: FileFilterOptions = {}) {
    this.options = {
      excludeNodeModules: options.excludeNodeModules ?? true,
      excludeTestFiles: options.excludeTestFiles ?? true,
      excludePatterns: options.excludePatterns ?? [],
      includePatterns: options.includePatterns ?? [],
      supportedExtensions: options.supportedExtensions ?? SUPPORTED_EXTENSIONS,
    };
  }

/**
 * Check if a file is a test file
 */
isTestFile(filePath: string): boolean {
  return /(^|\/)(test|tests|__tests__|__mocks__)(\/|$)/.test(filePath) || 
         /\.test\.(t|j)sx?$/.test(filePath) || 
         /\.spec\.(t|j)sx?$/.test(filePath);
}
  /**
   * Check if a file has a supported extension
   */
  hasSupportedExtension(filePath: string): boolean {
    return this.options.supportedExtensions.some(ext => 
      filePath.toLowerCase().endsWith(ext.toLowerCase())
    );
  }

  /**
   * Check if a file is in node_modules
   */
  isInNodeModules(filePath: string): boolean {
    if (!this.options.excludeNodeModules) return false;
    
    const normalizedPath = filePath.replace(/\\/g, '/');
    return normalizedPath.includes('/node_modules/') || 
           normalizedPath.includes('\\node_modules\\');
  }

  /**
   * Check if a file matches any exclude patterns
   */
  matchesExcludePatterns(filePath: string): boolean {
    if (this.options.excludePatterns.length === 0) return false;
    
    const normalizedPath = filePath.replace(/\\/g, '/');
    
    return this.options.excludePatterns.some(pattern => {
      if (pattern.includes('*')) {
        // Simple glob-like pattern matching
        const regexPattern = pattern
          .replace(/\./g, '\\.')
          .replace(/\*/g, '.*')
          .replace(/\?/g, '.');
        return new RegExp(regexPattern, 'i').test(normalizedPath);
      }
      return normalizedPath.includes(pattern);
    });
  }

  /**
   * Check if a file matches any include patterns
   */
  matchesIncludePatterns(filePath: string): boolean {
    if (this.options.includePatterns.length === 0) return true; // No include patterns means include all
    
    const normalizedPath = filePath.replace(/\\/g, '/');
    
    return this.options.includePatterns.some(pattern => {
      if (pattern.includes('*')) {
        // Simple glob-like pattern matching
        const regexPattern = pattern
          .replace(/\./g, '\\.')
          .replace(/\*/g, '.*')
          .replace(/\?/g, '.');
        return new RegExp(regexPattern, 'i').test(normalizedPath);
      }
      return normalizedPath.includes(pattern);
    });
  }

  /**
   * Check if a file should be included based on all filter criteria
   */
  shouldInclude(filePath: string): boolean {
    // Check if file has supported extension
    
    if (!this.hasSupportedExtension(filePath)) {
      return false;
    }
    
    // Check if file is in node_modules
    if (this.isInNodeModules(filePath)) {
      return false;
    }
    
    // Check if file is a test file
    if (this.isTestFile(filePath)) {
      return false;
    }
    
    // Check exclude patterns
    if (this.matchesExcludePatterns(filePath)) {
      return false;
    }
    
    // Check include patterns
    if (!this.matchesIncludePatterns(filePath)) {
      return false;
    }
    
    return true;
  }

  /**
   * Filter an array of file paths
   */
  filterFiles(filePaths: string[]): string[] {
    return filePaths.filter(filePath => this.shouldInclude(filePath));
  }

  /**
   * Get the reason why a file was excluded (for debugging)
   */
  getExclusionReason(filePath: string): string | null {
    if (!this.hasSupportedExtension(filePath)) {
      return `Unsupported extension. Supported: ${this.options.supportedExtensions.join(', ')}`;
    }
    
    if (this.isInNodeModules(filePath)) {
      return 'File is in node_modules';
    }
    
    if (this.isTestFile(filePath)) {
      return 'File is a test file';
    }
    
    if (this.matchesExcludePatterns(filePath)) {
      return `File matches exclude pattern`;
    }
    
    if (!this.matchesIncludePatterns(filePath)) {
      return `File does not match include patterns`;
    }
    
    return null; // File should be included
  }

  /**
   * Create a filter for source files (excludes tests, includes supported extensions)
   */
  static createSourceFileFilter(options: Partial<FileFilterOptions> = {}): FileFilter {
    return new FileFilter({
      excludeNodeModules: true,
      excludeTestFiles: true,
      supportedExtensions: SUPPORTED_EXTENSIONS,
      ...options,
    });
  }

  /**
   * Create a filter for test files only
   */
  static createTestFileFilter(options: Partial<FileFilterOptions> = {}): FileFilter {
    return new FileFilter({
      excludeNodeModules: true,
      excludeTestFiles: false,
      includePatterns: ['**/*.test.*', '**/*.spec.*', '**/__tests__/**', '**/test/**'],
      supportedExtensions: SUPPORTED_EXTENSIONS,
      ...options,
    });
  }

  /**
   * Create a filter for changed files (less restrictive)
   */
  static createChangedFileFilter(options: Partial<FileFilterOptions> = {}): FileFilter {
    return new FileFilter({
      excludeNodeModules: true,
      excludeTestFiles: false, // Include test files in changed files analysis
      supportedExtensions: SUPPORTED_EXTENSIONS,
      ...options,
    });
  }
} 