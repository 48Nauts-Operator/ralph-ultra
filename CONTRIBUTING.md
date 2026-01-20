# Contributing to Ralph Ultra

Thank you for your interest in contributing to Ralph Ultra! This document provides guidelines and instructions for setting up your development environment and contributing to the project.

---

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Development Setup](#development-setup)
- [Project Architecture](#project-architecture)
- [Development Workflow](#development-workflow)
- [Coding Standards](#coding-standards)
- [Testing](#testing)
- [Submitting Changes](#submitting-changes)
- [Release Process](#release-process)

---

## Code of Conduct

Be respectful, collaborative, and constructive. We're all here to build great software together.

---

## Development Setup

### Prerequisites

Ensure you have the following installed:

- **Bun** ≥ 1.0.0 ([install](https://bun.sh))
- **Node.js** ≥ 18.0.0 (optional, for npm compatibility)
- **Git** for version control
- **Terminal** with Unicode and color support (minimum 80x24)

### Initial Setup

```bash
# Clone the repository
git clone https://github.com/48Nauts-Operator/ralph-ultra.git
cd ralph-ultra

# Install dependencies
bun install

# Run type checking to verify setup
bun run typecheck

# Run linting
bun run lint

# Start development mode
bun run dev
```

### Optional Setup

#### Ralph Nano Integration

To test Ralph Ultra's integration with Ralph Nano:

```bash
# Clone Ralph Nano
git clone https://github.com/48Nauts-Operator/ralph-nano.git
cd ralph-nano
./scripts/setup.sh

# Set environment variable
export RALPH_NANO_PATH="/path/to/ralph-nano/ralph.sh"
```

#### Tailscale for Remote Testing

```bash
# Install Tailscale
# macOS
brew install tailscale

# Linux
curl -fsSL https://tailscale.com/install.sh | sh

# Start Tailscale
tailscale up
```

---

## Project Architecture

### Directory Structure

```
ralph-ultra/
├── src/
│   ├── components/          # React Ink components (UI)
│   ├── hooks/               # Custom React hooks
│   ├── remote/              # Remote control modules
│   ├── themes/              # Theme definitions
│   ├── utils/               # Utility modules
│   └── types/               # TypeScript type definitions
├── prd.json                 # Project requirements document
├── progress.txt             # Development progress log
└── package.json             # Dependencies and scripts
```

### Key Technologies

- **TypeScript** — Type-safe JavaScript
- **Bun** — Fast all-in-one JavaScript runtime
- **Ink** — React for terminal UIs
- **WebSocket (ws)** — Real-time communication
- **Tailscale** — Secure remote access

### Architecture Patterns

#### Component Structure

All UI components follow the same pattern:

```typescript
import React from 'react';
import { Box, Text } from 'ink';
import { useTheme } from '@hooks/useTheme';

interface MyComponentProps {
  // Props with JSDoc comments
}

/**
 * Component description
 */
export const MyComponent: React.FC<MyComponentProps> = ({ ...props }) => {
  const { theme } = useTheme();

  return (
    <Box borderStyle="single" borderColor={theme.border}>
      <Text color={theme.foreground}>Content</Text>
    </Box>
  );
};
```

#### Hook Pattern

Custom hooks manage state and side effects:

```typescript
import { useState, useEffect } from 'react';

/**
 * Hook description
 */
export function useMyHook() {
  const [state, setState] = useState<Type>(initialValue);

  useEffect(() => {
    // Setup
    return () => {
      // Cleanup
    };
  }, [dependencies]);

  return { state, setState };
}
```

#### Context Pattern

Providers wrap the app for global state:

```typescript
import React, { createContext, useContext } from 'react';

interface MyContextValue {
  // Context value shape
}

const MyContext = createContext<MyContextValue | undefined>(undefined);

export const MyProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // Provider logic
  return <MyContext.Provider value={value}>{children}</MyContext.Provider>;
};

export function useMyContext(): MyContextValue {
  const context = useContext(MyContext);
  if (!context) {
    throw new Error('useMyContext must be used within MyProvider');
  }
  return context;
}
```

---

## Development Workflow

### Feature Development

1. **Create a feature branch**

```bash
git checkout -b feat/your-feature-name
```

2. **Make changes following coding standards** (see below)

3. **Run quality checks**

```bash
bun run typecheck  # Type checking
bun run lint       # Linting
bun run format     # Code formatting
```

4. **Test your changes**

```bash
bun run dev        # Test in development mode
bun run build      # Verify production build works
```

5. **Commit with conventional commit message**

```bash
git add .
git commit -m "feat: add new feature"
```

### Commit Message Convention

Follow [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>: <description>

[optional body]

[optional footer]
```

**Types:**
- `feat:` — New feature
- `fix:` — Bug fix
- `docs:` — Documentation changes
- `style:` — Code style changes (formatting, no logic change)
- `refactor:` — Code refactoring
- `perf:` — Performance improvements
- `test:` — Adding or updating tests
- `chore:` — Build process or auxiliary tool changes

**Examples:**

```bash
feat: add command palette with fuzzy search
fix: resolve session persistence race condition
docs: update README with remote access instructions
refactor: extract keyboard handling into useKeyboard hook
```

---

## Coding Standards

### TypeScript

- **Strict mode enabled** — No implicit `any`, enforce null checks
- **Type coverage >95%** — Avoid `any`, use proper types
- **JSDoc comments** — All exported functions and components
- **No unused variables** — Remove or prefix with `_` if intentionally unused

### Code Style

- **Prettier formatting** — Run `bun run format` before committing
- **ESLint rules** — Run `bun run lint` with zero warnings
- **Path aliases** — Use `@components`, `@hooks`, `@themes`, `@remote`, `@utils`, `@types`
- **Consistent naming** — PascalCase for components, camelCase for functions/variables

### React/Ink Patterns

- **Functional components** — No class components
- **Hooks for state** — `useState`, `useEffect`, `useContext`
- **Theme colors** — Always use `theme.accent`, `theme.border`, etc. (no hardcoded colors)
- **Keyboard handling** — Use `useInput` with `isActive` parameter
- **Cleanup** — Always return cleanup function from `useEffect` for timers/subscriptions

### Best Practices

1. **Keep components focused** — Single responsibility principle
2. **Extract reusable logic** — Create custom hooks for shared behavior
3. **Use TypeScript interfaces** — Define clear prop and state shapes
4. **Handle errors gracefully** — Provide helpful error messages
5. **Optimize performance** — Use `useCallback`, `useMemo` where appropriate
6. **Document complex logic** — Add comments for non-obvious code

---

## Testing

Currently, Ralph Ultra focuses on manual testing. Future versions will include automated tests.

### Manual Testing Checklist

Before submitting a PR, verify:

- [ ] Application starts without errors (`bun run dev`)
- [ ] All keyboard shortcuts work as expected
- [ ] Theme switching works (press `t`)
- [ ] Session persistence works (quit and restart)
- [ ] Multi-tab support works (Ctrl+Shift+T)
- [ ] Remote access works (if Tailscale installed)
- [ ] Command palette works (Ctrl+P or `:`)
- [ ] No TypeScript errors (`bun run typecheck`)
- [ ] No linting warnings (`bun run lint`)
- [ ] Production build succeeds (`bun run build`)

---

## Submitting Changes

### Pull Request Process

1. **Fork the repository**

2. **Create a feature branch**

```bash
git checkout -b feat/your-feature
```

3. **Make your changes** following coding standards

4. **Run quality checks**

```bash
bun run typecheck && bun run lint && bun run format
```

5. **Push to your fork**

```bash
git push origin feat/your-feature
```

6. **Create a pull request** on GitHub

### Pull Request Guidelines

- **Clear title** — Use conventional commit format
- **Description** — Explain what and why, not just how
- **Reference issues** — Link related issues (e.g., "Closes #123")
- **Screenshots** — Include for UI changes
- **Breaking changes** — Clearly document in PR description

### Code Review Process

- Maintainers will review your PR within 3-5 business days
- Address feedback by pushing new commits to your branch
- Once approved, maintainers will merge your PR

---

## Release Process

Ralph Ultra follows semantic versioning (MAJOR.MINOR.PATCH):

- **MAJOR** — Breaking changes
- **MINOR** — New features (backward compatible)
- **PATCH** — Bug fixes (backward compatible)

### Release Checklist

1. Update version in `package.json`
2. Update `CHANGELOG.md` with release notes
3. Run all quality checks
4. Create Git tag: `git tag v2.x.x`
5. Push tag: `git push origin v2.x.x`
6. Create GitHub release with changelog

---

## Getting Help

- **GitHub Issues** — Report bugs or request features
- **Discussions** — Ask questions or discuss ideas
- **Documentation** — Check README.md and inline JSDoc comments

---

## License

By contributing to Ralph Ultra, you agree that your contributions will be licensed under the MIT License.

---

<p align="center">
Thank you for contributing to Ralph Ultra! 🚀
</p>
