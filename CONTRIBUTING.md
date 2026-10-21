# Contributing to cds-mbt

Thank you for your interest in contributing to cds-mbt!

## How to Contribute

### Reporting Bugs

1. Check existing [issues](https://github.com/adil-faiyaz/cds-mbt/issues) first
2. Create a new issue with:
   - Clear title
   - Steps to reproduce
   - Expected vs actual behavior
   - Node.js and @sap/cds versions

### Suggesting Features

1. Open a [discussion](https://github.com/adil-faiyaz/cds-mbt/discussions)
2. Describe the use case
3. Explain why it would benefit other users

### Pull Requests

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/my-feature`
3. Make your changes
4. Add/update tests
5. Run tests: `npm test`
6. Commit with clear message: `git commit -m "feat: add custom invariant support"`
7. Push: `git push origin feature/my-feature`
8. Open a Pull Request

### Commit Messages

Follow [Conventional Commits](https://www.conventionalcommits.org/):

- `feat:` - New feature
- `fix:` - Bug fix
- `docs:` - Documentation only
- `test:` - Adding/updating tests
- `refactor:` - Code change that neither fixes a bug nor adds a feature
- `chore:` - Changes to build process or auxiliary tools

### Code Style

- Use ES6+ features
- Add JSDoc comments for public APIs
- Follow existing code patterns
- No unused dependencies

## Development Setup

```bash
git clone https://github.com/adil-faiyaz/cds-mbt.git
cd cds-mbt
npm install
npm test
```

## Questions?

Start a [discussion](https://github.com/adil-faiyaz/cds-mbt/discussions) - we're happy to help!
