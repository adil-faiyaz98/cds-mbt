# cds-mbt

[![npm version](https://img.shields.io/npm/v/cds-mbt.svg)](https://www.npmjs.com/package/cds-mbt)
[![CI](https://github.com/adil-faiyaz98/cds-mbt/actions/workflows/ci.yml/badge.svg)](https://github.com/adil-faiyaz98/cds-mbt/actions/workflows/ci.yml)
[![codecov](https://codecov.io/gh/adil-faiyaz98/cds-mbt/branch/main/graph/badge.svg)](https://codecov.io/gh/adil-faiyaz98/cds-mbt)
[![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)

Model-Based Testing for SAP CAP agents and services using XState.

## About

`cds-mbt` catches orchestration bugs that unit tests and LLM evals miss. It systematically explores **every possible path** through your agent's state machine and verifies that invariants hold at every step.

### The Problem

Your CAP agent passes all tests:
- ✅ 247 LLM eval tests
- ✅ 42 unit tests  
- ✅ 89% code coverage

Three weeks later in production:
- ❌ Agent enters infinite retry loop
- ❌ Burns through LLM budget
- ❌ Customer gets no response
- ❌ $15,000 incident cost

**Why?** Unit tests and evals only test paths you think of. They miss edge case combinations like: tool timeout → network failure → partial success → retry → repeat.

### The Solution

Model-Based Testing explores **all reachable state combinations** automatically:

```
✗ Path 17/24: idle → planning → executing → [TIMEOUT] → [RETRY] → [TIMEOUT] → [RETRY] → ...

❌ INVARIANT VIOLATION
   budgetRespected: LLM calls (12) exceeds budget (10)
   Root cause: Missing guard on RETRY transition
```

Bug found in **1 second** instead of 3 weeks.

## Requirements

- Node.js >= 18
- @sap/cds >= 7.0.0

## Installation

```bash
npm add cds-mbt
```

## Quick Start

### 1. Initialize

```bash
cds mbt init
```

Creates test scaffolding:
```
test/
└── mbt/
    ├── machines/
    │   └── sample-agent.machine.js
    ├── invariants/
    │   └── sample.invariants.js
    └── mbt.test.js
```

### 2. Define Your State Machine

```javascript
// test/mbt/machines/order-agent.machine.js
const { createMachine } = require('xstate');

module.exports = createMachine({
  id: 'orderAgent',
  initial: 'idle',
  context: {
    llmCallsUsed: 0,
    llmCallsBudget: 10,
    retryCount: {},
    maxRetries: 2
  },
  states: {
    idle: {
      on: { START: 'planning' }
    },
    planning: {
      on: { PLAN_READY: 'executing' }
    },
    executing: {
      on: {
        TOOL_SUCCESS: 'synthesizing',
        TOOL_FAILURE: { 
          target: 'executing',
          guard: 'canRetry',  // This guard prevents infinite loops
          actions: 'incrementRetry'
        },
        ESCALATE: 'escalated'
      }
    },
    synthesizing: {
      on: { DONE: 'completed' }
    },
    completed: { type: 'final' },
    escalated: { type: 'final' }
  }
});
```

### 3. Run MBT

```bash
cds mbt run
```

Output:
```
🔍 cds-mbt v1.0.0
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Machine: order-agent
Exploring 24 paths...

Invariants:
✓ budgetRespected     (24/24 paths)
✓ retriesBounded      (24/24 paths)
✓ noInvalidCompletion (24/24 paths)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✅ MBT PASSED - All 24 paths verified
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

## Built-in Invariants

```javascript
const { invariants } = require('cds-mbt');

// Agent can NEVER exceed LLM budget
invariants.budgetRespected

// Each tool can NEVER be retried more than maxRetries
invariants.retriesBounded

// Can NEVER report "completed" unless all tools succeeded
invariants.noInvalidCompletion

// If escalated, MUST have a reason
invariants.escalationHasReason
```

## Custom Invariants

```javascript
const { createInvariant, runMBT } = require('cds-mbt');

// Migration-specific invariant
const dataConsistent = createInvariant({
  name: 'dataConsistent',
  description: 'Source and target counts must match unless rolling back',
  check: (context, state) => 
    context.sourceCount === context.targetCount || 
    state === 'rollingBack'
});

await runMBT(migrationMachine, [dataConsistent]);
```

## CLI Reference

```bash
cds mbt init              # Scaffold test files
cds mbt run               # Run all MBT tests
cds mbt run --verbose     # Show all paths explored
cds mbt run --machine X   # Run specific machine only
cds mbt run --report      # Generate HTML report
```

## Integration with cds test

MBT runs automatically with your existing tests:

```bash
cds test    # Includes MBT
```

## When to Use

| Question | Use This |
|----------|----------|
| Does the agent give accurate answers? | LLM Evals |
| Do OData queries return correct data? | CDS Unit Tests |
| Can the orchestrator deadlock? | **MBT** |
| Can budget be exceeded through any path? | **MBT** |
| Is there a path that skips required approvals? | **MBT** |

**Rule of thumb:**
- Testing **LLM quality** → Evals
- Testing **schema/endpoints** → CDS tests  
- Testing **orchestration logic** → MBT

## Examples

See the [examples/](./examples) folder for complete working examples:

- `examples/order-agent/` - CAP agent for order processing with LLM orchestration
- `examples/migration-workflow/` - Data migration state machine with rollback
- `examples/approval-flow/` - Multi-step approval process with HITL

## Documentation

- [ARCHITECTURE.md](./ARCHITECTURE.md) - Technical design and system overview
- [API.md](./API.md) - Complete API reference with examples

## Related

- [SAP Community Blog: Preventing the $200 Loop](https://community.sap.com/...) - Detailed explanation
- [@cap-js/agents](https://cap.cloud.sap/docs/guides/ai/cap-agents) - CAP agent plugin
- [XState Documentation](https://stately.ai/docs/xstate) - State machine library

## Contributing

Contributions welcome! Please read [CONTRIBUTING.md](./CONTRIBUTING.md) first.

## Support

- Create an [issue](https://github.com/adil-faiyaz/cds-mbt/issues) for bugs
- Start a [discussion](https://github.com/adil-faiyaz/cds-mbt/discussions) for questions

## License

[Apache-2.0](./LICENSE)
