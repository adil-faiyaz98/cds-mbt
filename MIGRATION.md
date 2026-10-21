# Migration Guide

This guide helps you upgrade between major versions of cds-mbt.

## Current Version: 1.x

You're on the latest major version. No migration needed.

---

## Future Migrations

This section will be updated when new major versions are released.

### Planned for v2.0 (Future)

The following changes are being considered for the next major release. This is not a commitment – actual changes will be documented here when v2.0 ships.

**Potential breaking changes:**
- Minimum Node.js version may increase to 20
- XState peer dependency may require v5.5+
- Some deprecated APIs may be removed

**How to prepare:**
1. Run on Node.js 20+ in CI
2. Avoid using deprecated APIs (warnings in console)
3. Pin to `^1.0.0` in package.json for stability

---

## Deprecation Notices

### v1.x Deprecations

None currently. Deprecated features will be listed here with their removal timeline.

---

## Version Support Policy

| Version | Status | Support Until |
|---------|--------|---------------|
| 1.x | Current | Active development |
| 0.x | N/A | Never released publicly |

**Support definitions:**
- **Active**: Bug fixes, security patches, new features
- **Maintenance**: Security patches only
- **End of Life**: No updates

---

## Checking Your Version

```bash
# Check installed version
npm ls cds-mbt

# Check latest available
npm view cds-mbt version

# Update to latest
npm update cds-mbt
```

---

## Reporting Migration Issues

If you encounter problems upgrading:

1. Check this guide for known breaking changes
2. Search [GitHub Issues](https://github.com/adil-faiyaz98/cds-mbt/issues) for similar reports
3. Open a new issue with:
   - Previous version
   - New version
   - Error message
   - Minimal reproduction

---

## Changelog

See [CHANGELOG.md](./CHANGELOG.md) for detailed release notes.
