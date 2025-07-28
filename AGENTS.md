# Agent Guidelines for Diffuse

## Build/Test Commands
- `npm run build` - Compile TypeScript to dist/
- `npm test` - Run all tests with Vitest
- `npm run test:run` - Run tests once (non-watch mode)
- `npm run test:watch` - Run tests in watch mode
- `vitest run tests/specific.test.ts` - Run single test file

## Code Style & Conventions
- **TypeScript**: Strict mode enabled, ES2020 target, NodeNext modules
- **Imports**: Use `.js` extensions for local imports (e.g., `./lib/services/index.js`)
- **Naming**: camelCase for variables/functions, PascalCase for classes/interfaces
- **Error Handling**: Return objects with `success: boolean` and optional `error` fields
- **Async**: Use async/await, avoid callbacks
- **Types**: Define interfaces for all public APIs and complex objects
- **File Structure**: Group related functionality in `lib/` subdirectories
- **CLI**: Use commander.js for CLI parsing with kebab-case options
- **Git Operations**: Use spawnSync/execSync for git commands with proper error handling
- **Logging**: Use `console.log/error` with optional verbose flags
- **Tests**: Place in `tests/` directory with `.test.ts` suffix, use Vitest globals