export const SUPPORTED_EXTENSIONS = [".ts", ".tsx", ".js", ".jsx"];

export enum RiskFactorType {
  JSXEventChange = 'JSX_EVENT_CHANGE',
  PropsChanged = 'PROPS_CHANGED',
  ReturnTypeChanged = 'RETURN_TYPE_CHANGED',
  TypeNarrowing = 'TYPE_NARROWING',
  TypeWidening = 'TYPE_WIDENING',
  MissingTest = 'MISSING_TEST',
  ExportRemoved = 'EXPORT_REMOVED',
  ExportAdded = 'EXPORT_ADDED',
  DangerousTypeUse = 'DANGEROUS_TYPE_USE',
  PublicAPI = 'PUBLIC_API',
  ImportedInFiles = 'IMPORTED_IN_FILES',
  UsedInMultipleTrees = 'USED_IN_MULTIPLE_TREES',
  PartialImport = 'PARTIAL_IMPORT',
  FileRemoved = 'FILE_REMOVED',
  FileAdded = 'FILE_ADDED',
  FileRenamed = 'FILE_RENAMED',
  LargeChange = 'LARGE_CHANGE',
}

export const riskWeights: Record<RiskFactorType, number> = {
  [RiskFactorType.JSXEventChange]: 12,
  [RiskFactorType.PropsChanged]: 10,
  [RiskFactorType.ReturnTypeChanged]: 8,
  [RiskFactorType.TypeNarrowing]: 6,
  [RiskFactorType.TypeWidening]: 2,
  [RiskFactorType.MissingTest]: 4,
  [RiskFactorType.ExportRemoved]: 10,
  [RiskFactorType.ExportAdded]: 0,
  [RiskFactorType.DangerousTypeUse]: 4,
  [RiskFactorType.PublicAPI]: 5,
  [RiskFactorType.ImportedInFiles]: 1.2, // multiplier, special handling
  [RiskFactorType.UsedInMultipleTrees]: 5,
  [RiskFactorType.PartialImport]: 0,
  [RiskFactorType.FileRemoved]: 10,
  [RiskFactorType.FileAdded]: 2,
  [RiskFactorType.FileRenamed]: 5,
  [RiskFactorType.LargeChange]: 7,
};

export interface RiskInput {
  type: RiskFactorType;
  value?: number; // only needed for scalable metrics like import count
  subject: string;
}

export interface ScoredRisk {
  subject: string;
  factor: RiskFactorType;
  points: number;
  explanation: string;
}

export const riskSuggestions: Record<RiskFactorType, string> = {
  [RiskFactorType.JSXEventChange]: "Test interactions or wrap handler in a stable callback if behavior changed.",
  [RiskFactorType.PropsChanged]: "Ensure consuming components still function correctly; consider adding story/test cases.",
  [RiskFactorType.ReturnTypeChanged]: "Review all consumers to confirm they still handle the new return shape.",
  [RiskFactorType.TypeNarrowing]: "Check for null/undefined/edge cases in consumers that may now fail silently.",
  [RiskFactorType.TypeWidening]: "Widening is generally safe, but review if it affects validation or runtime checks.",
  [RiskFactorType.MissingTest]: "Add or update tests that reflect the changed behavior of this symbol.",
  [RiskFactorType.ExportRemoved]: "Confirm this export isn't used outside this repo or by internal tooling.",
  [RiskFactorType.ExportAdded]: "Document or test this export if it's intended for use outside this file.",
  [RiskFactorType.DangerousTypeUse]: "Avoid `any`, `as`, or non-null assertions unless necessary; review with care.",
  [RiskFactorType.PublicAPI]: "Changing a public API? Double-check downstream consumers or publish notes.",
  [RiskFactorType.ImportedInFiles]: "High usage: prioritize test coverage and backward compatibility.",
  [RiskFactorType.UsedInMultipleTrees]: "Used across distinct app areas — check for coupled assumptions or side effects.",
  [RiskFactorType.PartialImport]: "Diffuse currently only supports Typescript files. Dynamic imports are not supported.",
  [RiskFactorType.FileRemoved]: "File was removed - Check downstream imports",
  [RiskFactorType.FileAdded]: "File was added",
  [RiskFactorType.FileRenamed]: "File was renamed - Check downstream imports",
  [RiskFactorType.LargeChange]: "Large change: consider breaking up the PR or adding more tests. Review carefully.",
};

export function encodeGitHubFilePath(path: string): string {
  return path.replace(/\(/g, '%28').replace(/\)/g, '%29');
}

export function escapeMarkdownLinkText(text: string): string {
  return text.replace(/[()]/g, (char) => `\\${char}`);
}
