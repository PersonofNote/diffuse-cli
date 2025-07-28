# Tests

This directory contains comprehensive tests for the Diffuse CLI tool.

## Test Files

- **`core.test.ts`** - Tests core functionality like file filtering, test detection, and node_modules handling
- **`integration.test.ts`** - Integration tests for Git operations, file system interactions, and CLI workflow
- **`GitService.test.ts`** - Unit tests for the GitService class (some tests may need fixes)
- **`FileFilter.test.ts`** - Unit tests for the FileFilter class (some tests may need fixes)  
- **`cli.test.ts`** - Tests for CLI command parsing and options (some tests may need fixes)

## Running Tests

```bash
# Run all tests
npm test

# Run tests once (no watch mode)
npm run test:run

# Run specific test file
npm run test:run -- tests/core.test.ts

# Run tests in watch mode
npm run test:watch
```

## Test Framework

- **Vitest** - Fast test runner with TypeScript support
- **Mocking** - Uses `vi.mock()` for mocking external dependencies
- **Coverage** - Tests cover core functionality, Git operations, and CLI parsing

## Working Tests

The `core.test.ts` and `integration.test.ts` files contain fully working tests that verify:

- File type detection (test files, supported extensions)
- Node modules filtering
- Git repository operations
- File system interactions
- Error handling scenarios

## Notes

Some unit tests in `GitService.test.ts`, `FileFilter.test.ts`, and `cli.test.ts` may need adjustments to match the actual implementation behavior. The core functionality tests provide good coverage of the main features.