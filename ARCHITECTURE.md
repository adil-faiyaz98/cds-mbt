# Architecture

This document describes the technical design of `cds-mbt`, a Model-Based Testing library for SAP CAP agents and services.

## Overview

`cds-mbt` systematically explores all possible execution paths through XState state machines and verifies that invariants hold at every step. Unlike traditional unit tests that only cover paths developers anticipate, MBT discovers edge cases by exhaustively exploring the state space.

```
┌─────────────────────────────────────────────────────────────────┐
│                         cds-mbt                                  │
├─────────────────────────────────────────────────────────────────┤
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐  │
│  │  Core Engine │  │    Joule     │  │     TLA+ Export      │  │
│  │              │  │  Integration │  │                      │  │
│  │ path-explorer│  │              │  │   spec-generator     │  │
│  │ invariant-   │  │ machine-     │  │   tlc-runner         │  │
│  │   builder    │  │   extractor  │  │                      │  │
│  │ report-      │  │ react-       │  │                      │  │
│  │   generator  │  │   templates  │  │                      │  │
│  │              │  │ runtime-     │  │                      │  │
│  │              │  │   adapter    │  │                      │  │
│  └──────────────┘  └──────────────┘  └──────────────────────┘  │
├─────────────────────────────────────────────────────────────────┤
│                      CDS Integration Layer                       │
│                    cds-plugin.js / MbtService                    │
└─────────────────────────────────────────────────────────────────┘
```

## Core Engine

The core engine provides the fundamental MBT capabilities.

### Path Explorer (`lib/core/path-explorer.js`)

Systematically explores all reachable states through a state machine.

**Key Functions:**
- `explorePaths(machine, options)` - Discovers all execution paths
- `checkInvariants(paths, invariants)` - Validates invariants across paths
- `runMBT(machine, invariants, options)` - Main entry point combining exploration and checking

**Algorithm:**
```
┌───────────────────────────────────────────────────────────────┐
│                    Path Exploration                            │
├───────────────────────────────────────────────────────────────┤
│                                                                │
│   1. Start from initial state                                  │
│   2. For each state:                                           │
│      a. Record current path step                               │
│      b. Get all possible events                                │
│      c. For each event:                                        │
│         - Create actor snapshot                                │
│         - Send event, observe transition                       │
│         - Recursively explore from new state                   │
│   3. Detect loops via visited state tracking                   │
│   4. Stop at final states or max depth                         │
│                                                                │
└───────────────────────────────────────────────────────────────┘
```

**Options:**
- `maxDepth` (default: 50) - Maximum path length
- `maxPaths` (default: 1000) - Maximum paths to explore
- `stopOnLoop` (default: true) - Stop path at detected loops

### Invariant Builder (`lib/core/invariant-builder.js`)

Utilities for creating and composing invariants.

**Invariant Structure:**
```javascript
{
  name: string,           // Unique identifier
  description: string,    // Human-readable description
  check: Function,        // (context, state, meta) => { passed, message }
  severity: string,       // 'error' | 'warning'
  category: string        // 'budget' | 'safety' | 'custom'
}
```

**Composition Utilities:**
- `createInvariant(config)` - Create a named invariant
- `fromPredicate(name, predicate)` - Create from boolean function
- `combine(name, invariants)` - Combine multiple invariants
- `when(name, condition, check)` - Conditional invariant
- `bound(property, operator, boundProperty)` - Property bounds checking

### Report Generator (`lib/core/report-generator.js`)

Generates HTML reports from MBT results.

**Output:**
- Summary statistics (paths explored, invariants checked, violations)
- Violation details with path traces
- Path visualization (all explored paths)
- Timestamp and machine metadata

## Joule Integration

Support for SAP Joule and CAP agent patterns.

### Machine Extractor (`lib/joule/machine-extractor.js`)

Extracts XState machines from CDS service definitions.

```
┌─────────────────────────────────────────────────────────────┐
│                    Machine Extraction                        │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│   CDS File with @agent annotation                            │
│           │                                                  │
│           ▼                                                  │
│   ┌───────────────────┐                                      │
│   │ parseAnnotations  │ → Extract @agent, @agent.hitl, tools │
│   └─────────┬─────────┘                                      │
│             │                                                │
│             ▼                                                │
│   ┌───────────────────┐                                      │
│   │   buildStates     │ → Generate state machine structure   │
│   └─────────┬─────────┘                                      │
│             │                                                │
│             ▼                                                │
│   ┌───────────────────┐                                      │
│   │  createMachine    │ → XState machine definition          │
│   └───────────────────┘                                      │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

**Supported Annotations:**
- `@agent` - Marks service as an agent
- `@agent.hitl` - Human-in-the-loop approval required
- `@tool('name')` - Tool references

### ReAct Templates (`lib/joule/react-templates.js`)

Pre-built machine templates for common agent patterns.

**Templates:**

| Template | Pattern | Use Case |
|----------|---------|----------|
| `createReActMachine` | observe → think → act | Standard LLM agent loops |
| `createA2AMachine` | init → negotiate → execute → finalize | Agent-to-agent communication |
| `createHITLMachine` | request → pending → approved/rejected | Human approval workflows |
| `createSubagentMachine` | spawn → monitor → collect → synthesize | Subagent orchestration |

**ReAct Machine States:**
```
┌─────────────────────────────────────────────────────────────┐
│                      ReAct Loop                              │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│   idle ──START──▶ observing ──OBSERVATION──▶ thinking       │
│                       ▲                         │            │
│                       │                         │            │
│                       │      ◀──THOUGHT──       │            │
│                       │                         ▼            │
│                   acting ◀──────────────── acting            │
│                       │                                      │
│                       │                                      │
│   escalated ◀────────┴────────────▶ completed               │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### Runtime Adapter (`lib/joule/runtime-adapter.js`)

Connects to running agents for live validation.

**Capabilities:**
- Attach to XState actors or EventEmitter-based agents
- State change notifications via callbacks
- Real-time invariant validation
- State transition history recording

**Usage Pattern:**
```javascript
const adapter = new RuntimeAdapter({ autoValidate: true });
adapter.attach(runningAgent);
adapter.onStateChange(event => console.log(event));
const result = adapter.validateCurrent(invariants);
adapter.detach();
```

## TLA+ Export

Formal verification support via TLA+ and TLC model checker.

### Spec Generator (`lib/tla/spec-generator.js`)

Converts XState machines to TLA+ specifications.

**Translation Process:**
```
┌─────────────────────────────────────────────────────────────┐
│                    TLA+ Generation                           │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│   XState Machine                                             │
│         │                                                    │
│         ├──▶ extractStates() ──▶ State constants             │
│         │                                                    │
│         ├──▶ extractTransitions() ──▶ Action definitions     │
│         │                                                    │
│         ├──▶ extractContextVariables() ──▶ Variable decls    │
│         │                                                    │
│         └──▶ translateInvariant() ──▶ TLA+ invariants        │
│                                                              │
│   Output: Complete .tla specification                        │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

**Generated TLA+ Structure:**
- Module header and EXTENDS
- CONSTANTS for state names
- VARIABLES declaration
- TypeOK type invariant
- Init predicate
- Action definitions for each transition
- Next state relation
- Spec temporal formula
- Translated invariants

### TLC Runner (`lib/tla/tlc-runner.js`)

Executes TLC model checker and parses results.

**Features:**
- Auto-detection of TLC installation
- Temporary file management
- Configurable workers and depth
- Output parsing with counterexample extraction
- Timeout handling

## CDS Integration

### Plugin Registration (`cds-plugin.js`)

Registers CLI commands with CDS:
- `cds mbt init` - Scaffold test files
- `cds mbt run` - Execute MBT tests
- `cds mbt validate` - Validate machine definitions
- `cds mbt tla` - Generate TLA+ specifications

### MbtService (`lib/cds-integration.js`)

CDS service for runtime MBT integration.

## Data Flow

### MBT Execution Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                        MBT Execution                             │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│   Machine Definition                                             │
│         │                                                        │
│         ▼                                                        │
│   ┌─────────────┐    ┌─────────────┐    ┌─────────────┐         │
│   │ explorePaths│───▶│checkInvari- │───▶│generateReport│        │
│   │             │    │   ants      │    │             │         │
│   └─────────────┘    └─────────────┘    └─────────────┘         │
│         │                  │                  │                  │
│         ▼                  ▼                  ▼                  │
│   Array<Path>        Result{passed,     HTML Report              │
│   with steps         violations}                                 │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Invariant Check Flow

```
For each path:
  For each step in path:
    For each invariant:
      result = invariant.check(context, state, meta)
      if (!result.passed):
        record violation with:
          - invariant name
          - failure message  
          - path trace
          - step index
          - state and context
```

## Extension Points

### Custom Invariants

Create application-specific invariants:

```javascript
const { createInvariant } = require('cds-mbt');

const myInvariant = createInvariant({
  name: 'orderTotalPositive',
  description: 'Order total must always be positive',
  check: (context, state) => ({
    passed: context.total >= 0,
    message: `Total is negative: ${context.total}`
  })
});
```

### Custom Machine Templates

Extend the base templates for domain-specific patterns:

```javascript
const { joule } = require('cds-mbt');

const myMachine = joule.createReActMachine({
  id: 'myAgent',
  maxIterations: 5,
  budget: 15,
  additionalStates: {
    customState: {
      on: { CUSTOM_EVENT: 'idle' }
    }
  }
});
```

### Runtime Hooks

Monitor agent execution in real-time:

```javascript
const { joule } = require('cds-mbt');

const adapter = new joule.RuntimeAdapter({
  autoValidate: true,
  invariants: [budgetRespected, retriesBounded]
});

adapter.onValidation(result => {
  if (!result.valid) {
    alertOps(result.failed);
  }
});
```

## Design Decisions

### Why XState?

- First-class state machine support with guards, actions, and context
- Actor model enables isolated path exploration
- Well-defined semantics for transitions and final states
- Active ecosystem and SAP CAP agent compatibility

### Why Not Random Testing?

Random (fuzz) testing finds some bugs but misses systematic coverage:
- MBT explores ALL reachable paths up to configured limits
- Guarantees invariants hold everywhere, not just on random samples
- Deterministic reproduction of violations

### Depth vs Breadth

The explorer uses depth-first search with loop detection:
- Memory efficient (only current path in memory)
- Finds deep bugs that breadth-first might miss within limits
- Loop detection prevents infinite exploration

### Invariant Design

Invariants return `{ passed, message }` rather than throwing:
- Allows collecting all violations in one run
- Non-throwing checks compose better
- Messages improve debugging

## Directory Structure

```
cds-mbt/
├── lib/
│   ├── index.js              # Main entry point
│   ├── core/
│   │   ├── path-explorer.js  # Path exploration engine
│   │   ├── invariant-builder.js
│   │   └── report-generator.js
│   ├── joule/
│   │   ├── index.js          # Joule module exports
│   │   ├── machine-extractor.js
│   │   ├── react-templates.js
│   │   └── runtime-adapter.js
│   ├── tla/
│   │   ├── index.js          # TLA+ module exports
│   │   ├── spec-generator.js
│   │   └── tlc-runner.js
│   ├── invariants/           # Built-in invariants
│   ├── machines/             # Machine templates
│   ├── cli/                  # CLI command handlers
│   └── cds-integration.js    # CDS service integration
├── bin/
│   └── cds-mbt.js            # Standalone CLI entry
├── templates/                # Scaffolding templates
├── test/                     # Unit tests
└── examples/                 # Complete example projects
    ├── order-agent/
    ├── migration-workflow/
    └── approval-flow/
```

## Performance Considerations

- Path exploration is exponential in worst case (O(events^depth))
- Default limits (maxDepth=50, maxPaths=1000) balance coverage vs time
- Loop detection prunes infinite branches early
- XState actor creation has overhead; reuse snapshots where possible
- TLA+ export adds no runtime cost; TLC runs are separate from MBT
