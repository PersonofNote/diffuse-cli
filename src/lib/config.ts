import fs from 'fs';
import path from 'path';
import { RiskFactorType, riskWeights as defaultRiskWeights } from './constants.js';

export interface DiffuseConfig {
  /** Custom risk weights for different factors */
  riskWeights?: Partial<Record<RiskFactorType, number>>;
  
  /** Thresholds for risk level classification */
  thresholds?: {
    /** Score threshold for high risk (default: 60) */
    highRisk?: number;
    /** Score threshold for medium risk (default: 40) */
    mediumRisk?: number;
    /** Score threshold for very high risk (default: 80) */
    veryHighRisk?: number;
    /** Percentage threshold for large change detection (default: 20) */
    largeChangePercentage?: number;
  };
  
  /** File and directory exclusion patterns */
  exclusions?: {
    /** Glob patterns for files to exclude from analysis */
    files?: string[];
    /** Glob patterns for directories to exclude from analysis */
    directories?: string[];
    /** Additional test file patterns beyond defaults */
    testPatterns?: string[];
  };
  
  /** Analysis behavior settings */
  analysis?: {
    /** Whether to include test coverage analysis (default: true) */
    includeTestCoverage?: boolean;
    /** Whether to analyze usage graph (default: true) */
    includeUsageGraph?: boolean;
    /** Maximum number of files to analyze in usage graph (default: unlimited) */
    maxFilesInGraph?: number;
  };
  
  /** Report generation settings */
  reporting?: {
    /** Whether to include suggestions in output (default: true) */
    includeSuggestions?: boolean;
    /** Whether to show verbose file statistics (default: false) */
    verboseStats?: boolean;
    /** Custom suggestion messages for risk factors */
    suggestions?: Partial<Record<RiskFactorType, string>>;
  };
}

export interface ResolvedConfig {
  /** Merged risk weights (defaults + overrides) */
  riskWeights: Record<RiskFactorType, number>;
  
  /** Thresholds for risk level classification */
  thresholds: {
    highRisk: number;
    mediumRisk: number;
    veryHighRisk: number;
    largeChangePercentage: number;
  };
  
  /** File and directory exclusion patterns */
  exclusions: {
    files: string[];
    directories: string[];
    testPatterns: string[];
  };
  
  /** Analysis behavior settings */
  analysis: {
    includeTestCoverage: boolean;
    includeUsageGraph: boolean;
    maxFilesInGraph?: number;
  };
  
  /** Report generation settings */
  reporting: {
    includeSuggestions: boolean;
    verboseStats: boolean;
    suggestions: Partial<Record<RiskFactorType, string>>;
  };
}

const DEFAULT_CONFIG: ResolvedConfig = {
  riskWeights: defaultRiskWeights,
  thresholds: {
    highRisk: 60,
    mediumRisk: 40,
    veryHighRisk: 80,
    largeChangePercentage: 20,
  },
  exclusions: {
    files: [],
    directories: ['node_modules', 'dist', 'build', '.git'],
    testPatterns: [],
  },
  analysis: {
    includeTestCoverage: true,
    includeUsageGraph: true,
    maxFilesInGraph: undefined,
  },
  reporting: {
    includeSuggestions: true,
    verboseStats: false,
    suggestions: {},
  },
};

export function loadConfig(configPath?: string): ResolvedConfig {
  let userConfig: Partial<DiffuseConfig> = {};
  
  if (configPath) {
    // Load from specified path
    if (!fs.existsSync(configPath)) {
      throw new Error(`Configuration file not found: ${configPath}`);
    }
    userConfig = loadConfigFile(configPath);
  } else {
    // Try to find config file in common locations
    const possiblePaths = [
      'diffuse.config.js',
      'diffuse.config.json',
      '.diffuserc.json',
      '.diffuserc.js',
      'package.json', // Look for diffuse key in package.json
    ];
    
    for (const possiblePath of possiblePaths) {
      if (fs.existsSync(possiblePath)) {
        userConfig = loadConfigFile(possiblePath);
        break;
      }
    }
  }
  
  // Merge with defaults
  const mergedRiskWeights = { ...DEFAULT_CONFIG.riskWeights };
  if (userConfig.riskWeights) {
    for (const [key, value] of Object.entries(userConfig.riskWeights)) {
      if (value !== undefined) {
        mergedRiskWeights[key as RiskFactorType] = value;
      }
    }
  }

  const resolved: ResolvedConfig = {
    riskWeights: mergedRiskWeights,
    thresholds: {
      highRisk: userConfig.thresholds?.highRisk ?? DEFAULT_CONFIG.thresholds.highRisk,
      mediumRisk: userConfig.thresholds?.mediumRisk ?? DEFAULT_CONFIG.thresholds.mediumRisk,
      veryHighRisk: userConfig.thresholds?.veryHighRisk ?? DEFAULT_CONFIG.thresholds.veryHighRisk,
      largeChangePercentage: userConfig.thresholds?.largeChangePercentage ?? DEFAULT_CONFIG.thresholds.largeChangePercentage,
    },
    exclusions: {
      files: [...DEFAULT_CONFIG.exclusions.files, ...(userConfig.exclusions?.files || [])],
      directories: [...DEFAULT_CONFIG.exclusions.directories, ...(userConfig.exclusions?.directories || [])],
      testPatterns: [...DEFAULT_CONFIG.exclusions.testPatterns, ...(userConfig.exclusions?.testPatterns || [])],
    },
    analysis: {
      includeTestCoverage: userConfig.analysis?.includeTestCoverage ?? DEFAULT_CONFIG.analysis.includeTestCoverage,
      includeUsageGraph: userConfig.analysis?.includeUsageGraph ?? DEFAULT_CONFIG.analysis.includeUsageGraph,
      maxFilesInGraph: userConfig.analysis?.maxFilesInGraph ?? DEFAULT_CONFIG.analysis.maxFilesInGraph,
    },
    reporting: {
      includeSuggestions: userConfig.reporting?.includeSuggestions ?? DEFAULT_CONFIG.reporting.includeSuggestions,
      verboseStats: userConfig.reporting?.verboseStats ?? DEFAULT_CONFIG.reporting.verboseStats,
      suggestions: { ...DEFAULT_CONFIG.reporting.suggestions, ...userConfig.reporting?.suggestions },
    },
  };
  
  validateConfig(resolved);
  return resolved;
}

function loadConfigFile(filePath: string): Partial<DiffuseConfig> {
  const ext = path.extname(filePath);
  
  try {
    if (ext === '.json' || filePath.endsWith('.diffuserc.json')) {
      const content = fs.readFileSync(filePath, 'utf8');
      return JSON.parse(content);
    } else if (ext === '.js' || filePath.endsWith('.diffuserc.js')) {
      // For .js files, we need to use dynamic import or require
      // Since we're in ESM, we'll use dynamic import
      delete require.cache[path.resolve(filePath)];
      const config = require(path.resolve(filePath));
      return config.default || config;
    } else if (filePath === 'package.json') {
      const content = fs.readFileSync(filePath, 'utf8');
      const packageJson = JSON.parse(content);
      return packageJson.diffuse || {};
    }
    
    throw new Error(`Unsupported config file format: ${filePath}`);
  } catch (error) {
    throw new Error(`Failed to load config from ${filePath}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function validateConfig(config: ResolvedConfig): void {
  // Validate thresholds
  const { thresholds } = config;
  if (thresholds.mediumRisk >= thresholds.highRisk) {
    throw new Error('mediumRisk threshold must be less than highRisk threshold');
  }
  if (thresholds.highRisk >= thresholds.veryHighRisk) {
    throw new Error('highRisk threshold must be less than veryHighRisk threshold');
  }
  if (thresholds.largeChangePercentage <= 0 || thresholds.largeChangePercentage > 100) {
    throw new Error('largeChangePercentage must be between 0 and 100');
  }
  
  // Validate risk weights
  for (const [factor, weight] of Object.entries(config.riskWeights)) {
    if (typeof weight !== 'number' || weight < 0) {
      throw new Error(`Risk weight for ${factor} must be a non-negative number`);
    }
  }
  
  // Validate analysis settings
  if (config.analysis.maxFilesInGraph !== undefined && config.analysis.maxFilesInGraph <= 0) {
    throw new Error('maxFilesInGraph must be a positive number');
  }
}

export function getDefaultConfig(): ResolvedConfig {
  return JSON.parse(JSON.stringify(DEFAULT_CONFIG)) as ResolvedConfig;
}