import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GitService } from '../src/lib/services/GitService.js';
import { spawnSync } from 'child_process';
import fs from 'fs';

vi.mock('child_process');
vi.mock('fs');

const mockSpawnSync = vi.mocked(spawnSync);
const mockFs = vi.mocked(fs);

describe('GitService', () => {
  let gitService: GitService;

  beforeEach(() => {
    vi.clearAllMocks();
    gitService = new GitService();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('constructor', () => {
    it('should initialize with default options', () => {
      const service = new GitService();
      expect(service).toBeInstanceOf(GitService);
    });

    it('should initialize with custom options', () => {
      const service = new GitService({
        baseRef: 'develop',
        encoding: 'ascii',
        verbose: true
      });
      expect(service).toBeInstanceOf(GitService);
    });
  });

  describe('getWorkingTreeChangedFiles', () => {
    it('should return changed and untracked files', () => {
      mockSpawnSync
        .mockReturnValueOnce({
          stdout: 'file1.ts\nfile2.ts\n',
          stderr: '',
          status: 0,
          signal: null,
          pid: 123,
          output: ['', 'file1.ts\nfile2.ts\n', '']
        })
        .mockReturnValueOnce({
          stdout: 'file3.ts\nfile4.ts\n',
          stderr: '',
          status: 0,
          signal: null,
          pid: 124,
          output: ['', 'file3.ts\nfile4.ts\n', '']
        });

      const result = gitService.getWorkingTreeChangedFiles();

      expect(result).toEqual(['file1.ts', 'file2.ts', 'file3.ts', 'file4.ts']);
      expect(mockSpawnSync).toHaveBeenCalledWith('git', ['diff', '--name-only'], { encoding: 'utf8' });
      expect(mockSpawnSync).toHaveBeenCalledWith('git', ['ls-files', '--others', '--exclude-standard'], { encoding: 'utf8' });
    });

    it('should deduplicate files', () => {
      mockSpawnSync
        .mockReturnValueOnce({
          stdout: 'file1.ts\nfile2.ts\n',
          stderr: '',
          status: 0,
          signal: null,
          pid: 123,
          output: ['', 'file1.ts\nfile2.ts\n', '']
        })
        .mockReturnValueOnce({
          stdout: 'file1.ts\nfile3.ts\n',
          stderr: '',
          status: 0,
          signal: null,
          pid: 124,
          output: ['', 'file1.ts\nfile3.ts\n', '']
        });

      const result = gitService.getWorkingTreeChangedFiles();

      expect(result).toEqual(['file1.ts', 'file2.ts', 'file3.ts']);
    });
  });

  describe('getChangedFilesSinceBase', () => {
    it('should return files changed since base branch', () => {
      // Mock execSync instead of spawnSync since the method uses execSync
      const mockExecSync = vi.fn().mockReturnValueOnce('file1.ts\nfile2.ts\n');
      vi.doMock('child_process', () => ({
        spawnSync: mockSpawnSync,
        execSync: mockExecSync
      }));

      const result = gitService.getChangedFilesSinceBase('main');

      expect(result).toEqual(['file1.ts', 'file2.ts']);
    });

    it('should handle git command failure', () => {
      mockSpawnSync.mockReturnValueOnce({
        stdout: '',
        stderr: 'fatal: bad revision',
        status: 1,
        signal: null,
        pid: 123,
        output: ['', '', 'fatal: bad revision']
      });

      const result = gitService.getChangedFilesSinceBase('invalid-branch');

      expect(result).toEqual([]);
    });
  });

  describe('getFileFromGit', () => {
    it('should return file content from git', () => {
      mockSpawnSync.mockReturnValueOnce({
        stdout: 'file content',
        stderr: '',
        status: 0,
        signal: null,
        pid: 123,
        output: ['', 'file content', '']
      });

      const result = gitService.getFileFromGit('main', 'file.ts');

      expect(result).toEqual({
        content: 'file content',
        success: true
      });
      expect(mockSpawnSync).toHaveBeenCalledWith('git', ['show', 'main:file.ts'], { encoding: 'utf8' });
    });

    it('should handle file not found in git', () => {
      mockSpawnSync.mockReturnValueOnce({
        stdout: '',
        stderr: 'fatal: path not found',
        status: 1,
        signal: null,
        pid: 123,
        output: ['', '', 'fatal: path not found']
      });

      const result = gitService.getFileFromGit('main', 'nonexistent.ts');

      expect(result).toEqual({
        content: 'Skipped',
        success: false,
        error: 'fatal: path not found'
      });
    });
  });

  describe('getCurrentFileContent', () => {
    it('should return current file content', () => {
      mockFs.readFileSync.mockReturnValueOnce('current file content');

      const result = gitService.getCurrentFileContent('file.ts');

      expect(result).toEqual({
        content: 'current file content',
        success: true
      });
      expect(mockFs.readFileSync).toHaveBeenCalledWith('file.ts', 'utf8');
    });

    it('should handle file read error', () => {
      mockFs.readFileSync.mockImplementationOnce(() => {
        throw new Error('File not found');
      });

      const result = gitService.getCurrentFileContent('nonexistent.ts');

      expect(result).toEqual({
        content: 'Skipped',
        success: false,
        error: 'File not found'
      });
    });
  });

  describe('isGitRepository', () => {
    it('should return true for git repository', () => {
      mockSpawnSync.mockReturnValueOnce({
        stdout: '.git',
        stderr: '',
        status: 0,
        signal: null,
        pid: 123,
        output: ['', '.git', '']
      });

      const result = gitService.isGitRepository();

      expect(result).toBe(true);
      expect(mockSpawnSync).toHaveBeenCalledWith('git', ['rev-parse', '--git-dir'], { encoding: 'utf8' });
    });

    it('should return false for non-git directory', () => {
      mockSpawnSync.mockReturnValueOnce({
        stdout: '',
        stderr: 'fatal: not a git repository',
        status: 1,
        signal: null,
        pid: 123,
        output: ['', '', 'fatal: not a git repository']
      });

      const result = gitService.isGitRepository();

      expect(result).toBe(false);
    });
  });

  describe('getCurrentBranch', () => {
    it('should return current branch name', () => {
      mockSpawnSync.mockReturnValueOnce({
        stdout: 'feature-branch\n',
        stderr: '',
        status: 0,
        signal: null,
        pid: 123,
        output: ['', 'feature-branch\n', '']
      });

      const result = gitService.getCurrentBranch();

      expect(result).toBe('feature-branch');
      expect(mockSpawnSync).toHaveBeenCalledWith('git', ['branch', '--show-current'], { encoding: 'utf8' });
    });

    it('should return main as fallback', () => {
      mockSpawnSync.mockImplementationOnce(() => {
        throw new Error('Git command failed');
      });

      const result = gitService.getCurrentBranch();

      expect(result).toBe('main');
    });
  });

  describe('fileExists', () => {
    it('should return true if file exists', () => {
      mockFs.existsSync.mockReturnValueOnce(true);

      const result = gitService.fileExists('file.ts');

      expect(result).toBe(true);
      expect(mockFs.existsSync).toHaveBeenCalledWith('file.ts');
    });

    it('should return false if file does not exist', () => {
      mockFs.existsSync.mockReturnValueOnce(false);

      const result = gitService.fileExists('nonexistent.ts');

      expect(result).toBe(false);
    });

    it('should handle exceptions gracefully', () => {
      mockFs.existsSync.mockImplementationOnce(() => {
        throw new Error('Permission denied');
      });

      const result = gitService.fileExists('file.ts');

      expect(result).toBe(false);
    });
  });
});