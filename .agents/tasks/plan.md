# Implementation Plan: cds-mbt Full Implementation

Production-ready cds-mbt npm package with Joule agent integration, TLA+ export, comprehensive tests, and examples.

## Phase 1: Core Infrastructure (FEAT-001)

- [ ] 1. Create lib/cds-integration.js - CDS service integration module that hooks into cds.test to auto-run MBT tests. Export MbtService class with init(), run() methods. Use cds.log('mbt') for debug output.
      Files: lib/cds-integration.js
      Verify: `node -e "require('./lib/cds-integration')"` exits without error.

- [ ] 2. Create template files for scaffolding - All 9 template files following patterns in existing code.
      Files: templates/machines/agent-orchestrator.machine.js, templates/machines/workflow.machine.js, templates/machines/migration.machine.js, templates/invariants/agent.invariants.js, templates/invariants/workflow.invariants.js, templates/invariants/migration.invariants.js, templates/agent.mbt.test.js, templates/workflow.mbt.test.js, templates/migration.mbt.test.js
      Verify: `node -e "require('./templates/machines/agent-orchestrator.machine')"` loads successfully.

- [ ] 3. Create jest.config.js - Standard Jest configuration with coverage thresholds.
      Files: jest.config.js
      Verify: `npm test -- --passWithNoTests` passes.

- [ ] 4. Create .eslintrc.js and .npmignore - ESLint config matching code style, npm publish exclusions.
      Files: .eslintrc.js, .npmignore
      Verify: Files exist with valid content.

- [ ] 5. Update lib/index.js and package.json - Add joule and tla module exports (placeholders), update files array.
      Files: lib/index.js, package.json
      Verify: `node -e "require('./lib')"` loads successfully.

## Phase 2: Joule Agent Integration (FEAT-002)

- [ ] 6. Create lib/joule/index.js - Module entry point re-exporting submodules.
      Files: lib/joule/index.js
      Verify: Module can be required.

- [ ] 7. Create lib/joule/machine-extractor.js - Extract XState machines from @agent-annotated CDS services.
      Files: lib/joule/machine-extractor.js
      Verify: `node -e "require('./lib/joule/machine-extractor')"` loads.

- [ ] 8. Create lib/joule/react-templates.js - Pre-built ReAct loop patterns: createReActMachine, createA2AMachine, createHITLMachine, createSubagentMachine.
      Files: lib/joule/react-templates.js
      Verify: `node -e "const {createReActMachine} = require('./lib/joule/react-templates'); console.log(createReActMachine({id:'test'}).id)"` prints 'test'.

- [ ] 9. Create lib/joule/runtime-adapter.js - RuntimeAdapter class for live validation of running agents.
      Files: lib/joule/runtime-adapter.js
      Verify: `node -e "const {RuntimeAdapter} = require('./lib/joule/runtime-adapter'); const r = new RuntimeAdapter(); console.log(typeof r.attach)"` prints 'function'.

## Phase 3: TLA+ Export (FEAT-003)

- [ ] 10. Create lib/tla/index.js - Module entry point re-exporting spec-generator and tlc-runner.
       Files: lib/tla/index.js
       Verify: Module can be required.

- [ ] 11. Create lib/tla/spec-generator.js - Generate TLA+ specs from XState machines.
       Files: lib/tla/spec-generator.js
       Verify: `node -e "const {generateTLASpec} = require('./lib/tla/spec-generator'); console.log(typeof generateTLASpec)"` prints 'function'.

- [ ] 12. Create lib/tla/tlc-runner.js - Optional TLC model checker integration.
       Files: lib/tla/tlc-runner.js
       Verify: `node -e "const {TLCRunner} = require('./lib/tla/tlc-runner'); console.log(typeof TLCRunner)"` prints 'function'.

- [ ] 13. Update cds-plugin.js and add new CLI commands (extract, export, watch).
       Files: cds-plugin.js, lib/cli/index.js, lib/cli/extract.js, lib/cli/export.js, lib/cli/watch.js
       Verify: `node -e "require('./lib/cli')"` exports extract, export, watch.

## Phase 4: Tests (FEAT-004)

- [ ] 14. Create test/core/path-explorer.test.js - Tests for core MBT engine.
       Files: test/core/path-explorer.test.js
       Verify: `npm test -- test/core/path-explorer.test.js` passes.

- [ ] 15. Create test/core/invariant-builder.test.js - Tests for invariant builder.
       Files: test/core/invariant-builder.test.js
       Verify: `npm test -- test/core/invariant-builder.test.js` passes.

- [ ] 16. Create test/invariants/index.test.js - Tests for built-in invariants.
       Files: test/invariants/index.test.js
       Verify: `npm test -- test/invariants/index.test.js` passes.

- [ ] 17. Create test/joule/machine-extractor.test.js - Tests for machine extractor.
       Files: test/joule/machine-extractor.test.js
       Verify: `npm test -- test/joule/machine-extractor.test.js` passes.

- [ ] 18. Create test/joule/react-templates.test.js - Tests for ReAct templates.
       Files: test/joule/react-templates.test.js
       Verify: `npm test -- test/joule/react-templates.test.js` passes.

- [ ] 19. Create test/tla/spec-generator.test.js - Tests for TLA+ spec generator.
       Files: test/tla/spec-generator.test.js
       Verify: `npm test -- test/tla/spec-generator.test.js` passes.

- [ ] 20. Create test/cli/init.test.js and test/cli/run.test.js - Tests for CLI commands.
       Files: test/cli/init.test.js, test/cli/run.test.js
       Verify: `npm test` passes all tests.

## Phase 5: Examples (FEAT-005)

- [ ] 21. Create examples/migration-workflow/ - Complete data migration example with ETL states and rollback.
       Files: examples/migration-workflow/package.json, examples/migration-workflow/db/schema.cds, examples/migration-workflow/srv/migration.cds, examples/migration-workflow/srv/migration.js, examples/migration-workflow/test/mbt/machines/migration.machine.js, examples/migration-workflow/test/mbt/invariants/migration.invariants.js, examples/migration-workflow/test/mbt/migration.mbt.test.js, examples/migration-workflow/README.md
       Verify: `node -e "require('./examples/migration-workflow/test/mbt/machines/migration.machine')"` loads.

- [ ] 22. Create examples/order-agent/ - E-commerce Joule agent example with ReAct pattern.
       Files: examples/order-agent/package.json, examples/order-agent/db/schema.cds, examples/order-agent/srv/order.cds, examples/order-agent/srv/order.js, examples/order-agent/test/mbt/machines/order-agent.machine.js, examples/order-agent/test/mbt/invariants/order-agent.invariants.js, examples/order-agent/test/mbt/order-agent.mbt.test.js, examples/order-agent/README.md
       Verify: `node -e "require('./examples/order-agent/test/mbt/machines/order-agent.machine')"` loads.

- [ ] 23. Create examples/approval-flow/ - Multi-step approval workflow with HITL.
       Files: examples/approval-flow/package.json, examples/approval-flow/db/schema.cds, examples/approval-flow/srv/approval.cds, examples/approval-flow/srv/approval.js, examples/approval-flow/test/mbt/machines/approval.machine.js, examples/approval-flow/test/mbt/invariants/approval.invariants.js, examples/approval-flow/test/mbt/approval.mbt.test.js, examples/approval-flow/README.md
       Verify: `node -e "require('./examples/approval-flow/test/mbt/machines/approval.machine')"` loads.

## Phase 6: Documentation and CI (FEAT-006)

- [ ] 24. Create ARCHITECTURE.md - Technical architecture documentation with module descriptions and data flow.
       Files: ARCHITECTURE.md
       Verify: File exists with Core Engine, Joule Integration, TLA+ Export sections.

- [ ] 25. Create API.md - Comprehensive API reference with all exported functions.
       Files: API.md
       Verify: File contains runMBT, createInvariant, extractMachine, generateTLASpec documentation.

- [ ] 26. Create .github/workflows/ci.yml - CI/CD pipeline for testing and publishing.
       Files: .github/workflows/ci.yml
       Verify: Valid YAML file with lint, test, publish jobs.

- [ ] 27. Update README.md and CHANGELOG.md - Add CI badges, links to new docs, changelog entries.
       Files: README.md, CHANGELOG.md
       Verify: README links to ARCHITECTURE.md and API.md.

---

## Key Design Decisions

1. **Joule Machine Extraction**: Parse CDS files as text using regex patterns for @agent annotations rather than relying on CDS compiler APIs. This avoids hard dependency on specific @sap/cds versions and works with any text file.

2. **TLA+ Spec Generation**: Generate a module per XState machine. States become enumerated values in a VARIABLE. Transitions become disjuncts in the Next state relation. Invariants become TLA+ Invariant formulas.

3. **Runtime Adapter**: Use EventEmitter pattern for state change notifications. Adapter attaches to agent instance via duck-typing (expects onStateChange hook), not inheritance.

4. **ReAct Templates**: Four pre-built machine templates covering common agent patterns. Each returns a complete XState machine that can be customized via config options.

5. **Examples Structure**: Each example is a self-contained CAP project that can run independently. Uses file:../.. dependency on parent cds-mbt for local development.

## Dependencies Between Features

- FEAT-001 (Core Infrastructure) is independent - can start immediately
- FEAT-002 (Joule) depends on FEAT-001 completing lib/index.js updates
- FEAT-003 (TLA+) depends on FEAT-001 completing lib/index.js updates
- FEAT-004 (Tests) depends on FEAT-001, FEAT-002, FEAT-003 (tests the modules)
- FEAT-005 (Examples) depends on FEAT-001, FEAT-002 (uses templates and joule)
- FEAT-006 (Docs) depends on all others (documents final APIs)

Execute in order: FEAT-001 → FEAT-002 → FEAT-003 → FEAT-004 → FEAT-005 → FEAT-006
