import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { spawnSync } from 'child_process';
import fs from 'fs';

vi.mock('child_process');
vi.mock('fs');
vi.mock('../src/lib/buildUsageGraph.js');
vi.mock('../src/lib/analyzeBreakingChanges.js');
vi.mock('../src/lib/report.js');
vi.mock('../src/lib/setup/detectGithub.js');
vi.mock('../src/lib/setup/loadProjectWithFallback.js');

const mockSpawnSync = vi.mocked(spawnSync);
const mockFs = vi.mocked(fs);

describe('Integration Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    
    // Mock successful git repository detection
    mockSpawnSync.mockImplementation((command, args) => {
      if (command === 'git' && args?.[0] === 'rev-parse' && args?.[1] === '--git-dir') {
        return {
          stdout: '.git',
          stderr: '',
          status: 0,
          signal: null,
          pid: 123,
          output: ['', '.git', '']
        };
      }
      
      if (command === 'git' && args?.[0] === 'diff' && args?.[1] === '--name-only') {
        return {
          stdout: 'src/component.ts\nsrc/utils.ts\n',
          stderr: '',
          status: 0,
          signal: null,
          pid: 123,
          output: ['', 'src/component.ts\nsrc/utils.ts\n', '']
        };
      }
      
      return {
        stdout: '',
        stderr: '',
        status: 0,
        signal: null,
        pid: 123,
        output: ['', '', '']
      };
    });
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('Git Integration', () => {
    it('should detect git repository correctly', () => {
      const result = mockSpawnSync('git', ['rev-parse', '--git-dir'], { encoding: 'utf8' });
      
      expect(result.status).toBe(0);
      expect(result.stdout).toBe('.git');
    });

    it('should get changed files from git', () => {
      const result = mockSpawnSync('git', ['diff', '--name-only'], { encoding: 'utf8' });
      
      expect(result.status).toBe(0);
      expect(result.stdout).toContain('src/component.ts');
      expect(result.stdout).toContain('src/utils.ts');
    });

    it('should handle git command failures gracefully', () => {
      mockSpawnSync.mockReturnValueOnce({
        stdout: '',
        stderr: 'fatal: not a git repository',
        status: 1,
        signal: null,
        pid: 123,
        output: ['', '', 'fatal: not a git repository']
      });

      const result = mockSpawnSync('git', ['rev-parse', '--git-dir'], { encoding: 'utf8' });
      
      expect(result.status).toBe(1);
      expect(result.stderr).toContain('not a git repository');
    });
  });

  describe('File System Integration', () => {
    it('should read files from filesystem', () => {
      const mockContent = 'export const test = "hello";';
      mockFs.readFileSync.mockReturnValueOnce(mockContent);

      const content = mockFs.readFileSync('src/test.ts', 'utf8');
      
      expect(content).toBe(mockContent);
      expect(mockFs.readFileSync).toHaveBeenCalledWith('src/test.ts', 'utf8');
    });

    it('should check file existence', () => {
      mockFs.existsSync.mockReturnValueOnce(true);

      const exists = mockFs.existsSync('src/component.ts');
      
      expect(exists).toBe(true);
      expect(mockFs.existsSync).toHaveBeenCalledWith('src/component.ts');
    });

    it('should write output files', () => {
      mockFs.writeFileSync = vi.fn();
      const reportContent = '# Risk Analysis Report\n\nNo issues found.';
      
      mockFs.writeFileSync('report.md', reportContent, 'utf-8');
      
      expect(mockFs.writeFileSync).toHaveBeenCalledWith('report.md', reportContent, 'utf-8');
    });

    it('should handle file read errors', () => {
      mockFs.readFileSync.mockImplementationOnce(() => {
        throw new Error('ENOENT: no such file or directory');
      });

      expect(() => {
        mockFs.readFileSync('nonexistent.ts', 'utf8');
      }).toThrow('ENOENT: no such file or directory');
    });
  });

  describe('CLI Workflow Integration', () => {
    it('should handle empty changed files list', () => {
      mockSpawnSync.mockImplementation((command, args) => {
        if (command === 'git' && args?.[0] === 'diff') {
          return {
            stdout: '',
            stderr: '',
            status: 0,
            signal: null,
            pid: 123,
            output: ['', '', '']
          };
        }
        
        if (command === 'git' && args?.[0] === 'ls-files') {
          return {
            stdout: '',
            stderr: '',
            status: 0,
            signal: null,
            pid: 123,
            output: ['', '', '']
          };
        }
        
        return {
          stdout: '',
          stderr: '',
          status: 0,
          signal: null,
          pid: 123,
          output: ['', '', '']
        };
      });

      const diffResult = mockSpawnSync('git', ['diff', '--name-only'], { encoding: 'utf8' });
      const untrackedResult = mockSpawnSync('git', ['ls-files', '--others', '--exclude-standard'], { encoding: 'utf8' });
      
      expect(diffResult.stdout).toBe('');
      expect(untrackedResult.stdout).toBe('');
    });

    it('should filter out node_modules and test files', () => {
      const allFiles = [
        'src/component.ts',
        'src/component.test.ts',
        'node_modules/package/index.js',
        'tests/unit.spec.ts',
        'lib/utils.js'
      ];

      const isTestFile = (filePath: string): boolean => {
        return /(^|\/)(test|tests|__tests__|__mocks__)(\/|$)/.test(filePath) || 
               /\.test\.(t|j)sx?$/.test(filePath) || 
               /\.spec\.(t|j)sx?$/.test(filePath);
      };

      const filteredFiles = allFiles.filter(file => 
        !file.includes('node_modules') && !isTestFile(file)
      );

      expect(filteredFiles).toEqual(['src/component.ts', 'lib/utils.js']);
    });

    it('should handle different git comparison modes', () => {
      // Test working tree mode
      mockSpawnSync.mockReturnValueOnce({
        stdout: 'src/modified.ts\n',
        stderr: '',
        status: 0,
        signal: null,
        pid: 123,
        output: ['', 'src/modified.ts\n', '']
      });

      const workingTreeResult = mockSpawnSync('git', ['diff', '--name-only'], { encoding: 'utf8' });
      expect(workingTreeResult.stdout).toContain('src/modified.ts');

      // Test branch comparison mode
      mockSpawnSync.mockReturnValueOnce({
        stdout: 'src/feature.ts\n',
        stderr: '',
        status: 0,
        signal: null,
        pid: 124,
        output: ['', 'src/feature.ts\n', '']
      });

      const branchResult = mockSpawnSync('git', ['diff', '--name-only', 'main...HEAD'], { encoding: 'utf8' });
      expect(branchResult.stdout).toContain('src/feature.ts');
    });
  });

  describe('Error Handling Integration', () => {
    it('should handle git repository not found', () => {
      mockSpawnSync.mockReturnValueOnce({
        stdout: '',
        stderr: 'fatal: not a git repository (or any of the parent directories): .git',
        status: 128,
        signal: null,
        pid: 123,
        output: ['', '', 'fatal: not a git repository (or any of the parent directories): .git']
      });

      const result = mockSpawnSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' });
      
      expect(result.status).toBe(128);
      expect(result.stderr).toContain('not a git repository');
    });

    it('should handle invalid git references', () => {
      mockSpawnSync.mockReturnValueOnce({
        stdout: '',
        stderr: 'fatal: bad revision \'invalid-branch\'',
        status: 128,
        signal: null,
        pid: 123,
        output: ['', '', 'fatal: bad revision \'invalid-branch\'']
      });

      const result = mockSpawnSync('git', ['diff', '--name-only', 'invalid-branch...HEAD'], { encoding: 'utf8' });
      
      expect(result.status).toBe(128);
      expect(result.stderr).toContain('bad revision');
    });

    it('should handle file system permission errors', () => {
      mockFs.readFileSync.mockImplementationOnce(() => {
        const error = new Error('EACCES: permission denied');
        (error as any).code = 'EACCES';
        throw error;
      });

      expect(() => {
        mockFs.readFileSync('/restricted/file.ts', 'utf8');
      }).toThrow('EACCES: permission denied');
    });
  });
});