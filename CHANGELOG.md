# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

#### Joule Agent Integration
- `joule.extractMachine(cdsPath)` - Extract XState machines from CDS files with @agent annotation
- `joule.extractFromDefinition(serviceDef)` - Programmatic machine extraction from service definitions
- `joule.createReActMachine(config)` - ReAct (observe → think → act) loop template
- `joule.createA2AMachine(config)` - Agent-to-Agent communication protocol template
- `joule.createHITLMachine(config)` - Human-in-the-Loop approval workflow template
- `joule.createSubagentMachine(config)` - Subagent orchestration template
- `joule.RuntimeAdapter` - Live agent monitoring and validation

#### TLA+ Export
- `tla.generateTLASpec(machine, invariants)` - Convert XState machines to TLA+ specifications
- `tla.generateTLCConfig(machine, invariants)` - Generate TLC configuration files
- `tla.TLCRunner` - Run TLC model checker and parse results
- Automatic invariant translation to TLA+ formulas
- Support for formal verification of state machines

#### CLI Commands
- `cds mbt init` - Scaffold MBT test structure
- `cds mbt run` - Execute MBT tests with all invariants
- `cds mbt validate` - Validate machine definitions
- `cds mbt tla` - Generate TLA+ specifications

#### Examples
- `examples/order-agent/` - CAP agent for order processing
- `examples/migration-workflow/` - Data migration with rollback
- `examples/approval-flow/` - Multi-step approval process

#### Documentation & CI
- ARCHITECTURE.md - Technical design documentation
- API.md - Complete API reference
- GitHub Actions CI pipeline with lint, test, and publish jobs
- Node.js 18, 20, 22 test matrix
- Codecov integration for coverage reporting

## [1.0.0] - 2026-10-20

### Added
- Initial release
- `cds mbt init` command for scaffolding
- `cds mbt run` command for running MBT
- Built-in invariants: budgetRespected, retriesBounded, noInvalidCompletion, escalationHasReason
- Custom invariant support via `createInvariant()`
- HTML report generation
- Integration with `cds test`

[Unreleased]: https://github.com/adil-faiyaz98/cds-mbt/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/adil-faiyaz98/cds-mbt/releases/tag/v1.0.0
