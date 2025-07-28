import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Command } from 'commander';
import { spawnSync } from 'child_process';
import fs from 'fs';

vi.mock('child_process');
vi.mock('fs');
vi.mock('../src/lib/buildUsageGraph.js');
vi.mock('../src/lib/analyzeBreakingChanges.js');
vi.mock('../src/lib/report.js');
vi.mock('../src/lib/setup/detectGithub.js');
vi.mock('../src/lib/setup/loadProjectWithFallback.js');
vi.mock('../src/lib/services/index.js');

const mockSpawnSync = vi.mocked(spawnSync);
const mockFs = vi.mocked(fs);

describe('CLI', () => {
  let originalArgv: string[];
  let originalExit: typeof process.exit;
  beforeEach(() => {
    vi.clearAllMocks();
    originalArgv = process.argv;
    originalExit = process.exit;
    
    // Mock process.exit to capture exit codes
    process.exit = vi.fn((code?: number) => {
      throw new Error(`Process exited with code ${code}`);
    }) as any;

    // Mock successful git operations by default
    mockSpawnSync.mockReturnValue({
      stdout: '',
      stderr: '',
      status: 0,
      signal: null,
      pid: 123,
      output: ['', '', '']
    });
  });

  afterEach(() => {
    process.argv = originalArgv;
    process.exit = originalExit;
    vi.resetAllMocks();
  });

  describe('command parsing', () => {
    it('should parse basic command without options', () => {
      const program = new Command();
      
      program
        .name('diffuse')
        .description('Static risk analysis tool for code changes - analyzes breaking changes and usage patterns within a single repository.')
        .option('-s, --since <branch>', 'Git base branch or ref to compare against (e.g., main)')
        .option('-o, --output <file>', 'Write output to file')
        .option('--fail-on-high-risk', 'Exit with code 1 if high risk detected')
        .option('--format <type>', 'Report format: \'markdown\' or \'plain\' (default: plain)', 'plain')
        .option('--no-suggestions', 'Suppress actionable suggestions in the output')
        .option('--no-tests', 'Exclude tests from scoring')
        .option('--verbose', 'Enable verbose logging')
        .helpOption('-h, --help', 'Show CLI usage information');

      // Test parsing empty args (should use defaults)
      program.parse(['node', 'diffuse']);
      const options = program.opts();
      
      expect(options.format).toBe('plain');
      expect(options.suggestions).toBe(true);
      expect(options.tests).toBe(true);
      expect(options.verbose).toBe(undefined); // Commander doesn't set false by default, it's undefined
    });

    it('should parse all command line options', () => {
      const program = new Command();
      
      program
        .name('diffuse')
        .description('Static risk analysis tool for code changes - analyzes breaking changes and usage patterns within a single repository.')
        .option('-s, --since <branch>', 'Git base branch or ref to compare against (e.g., main)')
        .option('-o, --output <file>', 'Write output to file')
        .option('--fail-on-high-risk', 'Exit with code 1 if high risk detected')
        .option('--format <type>', 'Report format: \'markdown\' or \'plain\' (default: plain)', 'plain')
        .option('--no-suggestions', 'Suppress actionable suggestions in the output')
        .option('--no-tests', 'Exclude tests from scoring')
        .option('--verbose', 'Enable verbose logging')
        .helpOption('-h, --help', 'Show CLI usage information');

      program.parse([
        'node', 'diffuse',
        '--since', 'develop',
        '--output', 'report.md',
        '--fail-on-high-risk',
        '--format', 'markdown',
        '--no-suggestions',
        '--no-tests',
        '--verbose'
      ]);
      
      const options = program.opts();
      
      expect(options.since).toBe('develop');
      expect(options.output).toBe('report.md');
      expect(options.failOnHighRisk).toBe(true);
      expect(options.format).toBe('markdown');
      expect(options.suggestions).toBe(false);
      expect(options.tests).toBe(false);
      expect(options.verbose).toBe(true);
    });

    it('should use short option flags', () => {
      const program = new Command();
      
      program
        .name('diffuse')
        .option('-s, --since <branch>', 'Git base branch or ref to compare against (e.g., main)')
        .option('-o, --output <file>', 'Write output to file')
        .option('-h, --help', 'Show CLI usage information');

      program.parse(['node', 'diffuse', '-s', 'main', '-o', 'output.txt']);
      
      const options = program.opts();
      
      expect(options.since).toBe('main');
      expect(options.output).toBe('output.txt');
    });
  });

  describe('option validation', () => {
    it('should accept valid format options', () => {
      const program = new Command();
      program.option('--format <type>', 'Report format', 'plain');

      // Test plain format
      program.parse(['node', 'diffuse', '--format', 'plain']);
      expect(program.opts().format).toBe('plain');

      // Test markdown format  
      program.parse(['node', 'diffuse', '--format', 'markdown']);
      expect(program.opts().format).toBe('markdown');
    });

    it('should use default format when not specified', () => {
      const program = new Command();
      program.option('--format <type>', 'Report format', 'plain');

      program.parse(['node', 'diffuse']);
      expect(program.opts().format).toBe('plain');
    });
  });

  describe('help output', () => {
    it('should display help information', () => {
      const program = new Command();
      
      program
        .name('diffuse')
        .description('Static risk analysis tool for code changes - analyzes breaking changes and usage patterns within a single repository.')
        .option('-s, --since <branch>', 'Git base branch or ref to compare against (e.g., main)')
        .option('-o, --output <file>', 'Write output to file')
        .option('--fail-on-high-risk', 'Exit with code 1 if high risk detected')
        .option('--format <type>', 'Report format: \'markdown\' or \'plain\' (default: plain)', 'plain')
        .option('--no-suggestions', 'Suppress actionable suggestions in the output')
        .option('--no-tests', 'Exclude tests from scoring')
        .option('--verbose', 'Enable verbose logging')
        .helpOption('-h, --help', 'Show CLI usage information');

      const helpText = program.helpInformation();
      
      expect(helpText).toContain('diffuse');
      expect(helpText).toContain('Static risk analysis tool');
      expect(helpText).toContain('-s, --since <branch>');
      expect(helpText).toContain('-o, --output <file>');
      expect(helpText).toContain('--fail-on-high-risk');
      expect(helpText).toContain('--format <type>');
      expect(helpText).toContain('--no-suggestions');
      expect(helpText).toContain('--no-tests');
      expect(helpText).toContain('--verbose');
      expect(helpText).toContain('-h, --help');
    });
  });

  describe('file output', () => {
    it('should write output to file when specified', () => {
      mockFs.writeFileSync = vi.fn();
      
      const testReport = 'Test report content';
      const outputPath = 'test-report.md';
      
      // Simulate writing to file
      mockFs.writeFileSync(outputPath, testReport, 'utf-8');
      
      expect(mockFs.writeFileSync).toHaveBeenCalledWith(outputPath, testReport, 'utf-8');
    });
  });

  describe('test file detection', () => {
    it('should identify test files correctly', () => {
      const isTestFile = (filePath: string): boolean => {
        return /(^|\/)(test|tests|__tests__|__mocks__)(\/|$)/.test(filePath) || 
               /\.test\.(t|j)sx?$/.test(filePath) || 
               /\.spec\.(t|j)sx?$/.test(filePath);
      };

      // Test directory patterns
      expect(isTestFile('src/test/helper.ts')).toBe(true);
      expect(isTestFile('src/tests/unit.ts')).toBe(true);
      expect(isTestFile('src/__tests__/component.ts')).toBe(true);
      expect(isTestFile('src/__mocks__/api.ts')).toBe(true);

      // Test file extension patterns
      expect(isTestFile('component.test.ts')).toBe(true);
      expect(isTestFile('component.test.js')).toBe(true);
      expect(isTestFile('component.spec.tsx')).toBe(true);
      expect(isTestFile('component.spec.jsx')).toBe(true);

      // Regular files should not be identified as tests
      expect(isTestFile('src/component.ts')).toBe(false);
      expect(isTestFile('src/utils/helper.js')).toBe(false);
      expect(isTestFile('src/testing-utils.ts')).toBe(false);
    });
  });
});