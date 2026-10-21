# API Reference

Complete API documentation for `cds-mbt`.

## Table of Contents

- [Core Functions](#core-functions)
  - [runMBT](#runmbt)
  - [explorePaths](#explorepaths)
  - [checkInvariants](#checkinvariants)
- [Invariant Helpers](#invariant-helpers)
  - [createInvariant](#createinvariant)
  - [validateInvariant](#validateinvariant)
  - [fromPredicate](#frompredicate)
  - [combine](#combine)
  - [when](#when)
  - [bound](#bound)
- [Built-in Invariants](#built-in-invariants)
- [Report Generation](#report-generation)
  - [generateReport](#generatereport)
- [Joule Module](#joule-module)
  - [extractMachine](#extractmachine)
  - [extractFromDefinition](#extractfromdefinition)
  - [createReActMachine](#createreactmachine)
  - [createA2AMachine](#createa2amachine)
  - [createHITLMachine](#createhitlmachine)
  - [createSubagentMachine](#createsubagentmachine)
  - [RuntimeAdapter](#runtimeadapter)
- [TLA+ Module](#tla-module)
  - [generateTLASpec](#generatetlaspec)
  - [generateTLCConfig](#generatetlcconfig)
  - [TLCRunner](#tlcrunner)

---

## Core Functions

### runMBT

Main entry point for running Model-Based Testing.

```javascript
const { runMBT } = require('cds-mbt');

const result = await runMBT(machine, invariants, options);
```

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `machine` | `Object` | XState machine definition |
| `invariants` | `Array<Invariant>` | Array of invariants to check |
| `options` | `Object` | (Optional) Configuration options |

**Options:**

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `verbose` | `boolean` | `false` | Enable verbose logging |
| `maxDepth` | `number` | `50` | Maximum path depth to explore |
| `maxPaths` | `number` | `1000` | Maximum number of paths to explore |
| `failFast` | `boolean` | `false` | Stop on first violation |

**Returns:** `Promise<MBTResult>`

```typescript
interface MBTResult {
  passed: boolean;          // True if all invariants passed
  violations: Violation[];  // Array of violations found
  stats: {
    totalPaths: number;
    totalSteps: number;
    invariantsChecked: number;
    pathsWithViolations: number;
  };
  machine: string;          // Machine ID
  paths: Path[];           // All explored paths
  options: Object;         // Options used
}
```

**Example:**

```javascript
const { runMBT, invariants } = require('cds-mbt');
const { createMachine } = require('xstate');

const orderMachine = createMachine({
  id: 'order',
  initial: 'pending',
  context: { llmCallsUsed: 0, llmCallsBudget: 10 },
  states: {
    pending: { on: { PROCESS: 'processing' } },
    processing: { on: { COMPLETE: 'completed', FAIL: 'failed' } },
    completed: { type: 'final' },
    failed: { type: 'final' }
  }
});

const result = await runMBT(orderMachine, [
  invariants.budgetRespected
], { maxDepth: 20 });

console.log(`Passed: ${result.passed}`);
console.log(`Paths explored: ${result.stats.totalPaths}`);
```

---

### explorePaths

Explore all reachable paths through a state machine.

```javascript
const { explorePaths } = require('cds-mbt');

const paths = explorePaths(machine, options);
```

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `machine` | `Object` | XState machine definition |
| `options` | `Object` | (Optional) Exploration options |

**Options:**

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `maxDepth` | `number` | `50` | Maximum path depth |
| `maxPaths` | `number` | `1000` | Maximum paths to find |
| `stopOnLoop` | `boolean` | `true` | Stop path when loop detected |

**Returns:** `Array<Path>`

```typescript
interface Path {
  machine: string;        // Machine ID
  steps: Step[];          // Array of transition steps
  hasLoop: boolean;       // Whether path contains a loop
}

interface Step {
  event: { type: string };  // Event that caused transition
  fromState: string | null; // Source state
  toState: string;          // Target state
  context: Object;          // Context after transition
}
```

**Example:**

```javascript
const { explorePaths } = require('cds-mbt');

const paths = explorePaths(myMachine, { maxDepth: 30 });

console.log(`Found ${paths.length} paths`);
for (const path of paths) {
  const route = path.steps.map(s => s.toState).join(' → ');
  console.log(route);
}
```

---

### checkInvariants

Check invariants across a set of paths.

```javascript
const { checkInvariants } = require('cds-mbt');

const result = checkInvariants(paths, invariants);
```

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `paths` | `Array<Path>` | Paths from `explorePaths()` |
| `invariants` | `Array<Invariant>` | Invariants to check |

**Returns:** `InvariantResult`

```typescript
interface InvariantResult {
  passed: boolean;
  violations: Violation[];
  stats: {
    totalPaths: number;
    totalSteps: number;
    invariantsChecked: number;
    pathsWithViolations: number;
  };
}

interface Violation {
  invariant: string;      // Invariant name
  message: string;        // Failure message
  path: string;          // Formatted path string
  step: number;          // Step index where violation occurred
  state: string;         // State at violation
  context: Object;       // Context at violation
  description: string;   // Invariant description
}
```

---

## Invariant Helpers

### createInvariant

Create a named invariant with metadata.

```javascript
const { createInvariant } = require('cds-mbt');

const invariant = createInvariant(config);
```

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `config` | `Object` | Invariant configuration |

**Config Object:**

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `name` | `string` | Yes | Unique identifier |
| `description` | `string` | No | Human-readable description |
| `check` | `Function` | Yes | Check function `(context, state, meta) => Result` |
| `severity` | `string` | No | `'error'` or `'warning'` (default: `'error'`) |
| `category` | `string` | No | Category for grouping (default: `'custom'`) |

**Check Function Signature:**

```typescript
(context: Object, state: string, meta?: Meta) => CheckResult

interface Meta {
  step: Step;
  path: Path;
  stepIndex: number;
}

interface CheckResult {
  passed: boolean;
  message?: string;   // Required if passed is false
  skipped?: boolean;  // True if invariant was not applicable
}
```

**Example:**

```javascript
const { createInvariant } = require('cds-mbt');

const dataConsistent = createInvariant({
  name: 'dataConsistent',
  description: 'Source and target counts must match unless rolling back',
  severity: 'error',
  category: 'data-integrity',
  check: (context, state) => {
    if (state === 'rollingBack') {
      return { passed: true, skipped: true };
    }
    const match = context.sourceCount === context.targetCount;
    return {
      passed: match,
      message: match ? null : `Count mismatch: source=${context.sourceCount}, target=${context.targetCount}`
    };
  }
});
```

---

### validateInvariant

Validate an invariant definition.

```javascript
const { validateInvariant } = require('cds-mbt');

const result = validateInvariant(invariant);
```

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `invariant` | `Object` | Invariant to validate |

**Returns:**

```typescript
interface ValidationResult {
  valid: boolean;
  errors: string[];
}
```

**Example:**

```javascript
const { validateInvariant } = require('cds-mbt');

const result = validateInvariant(myInvariant);
if (!result.valid) {
  console.error('Invalid invariant:', result.errors.join(', '));
}
```

---

### fromPredicate

Create an invariant from a simple boolean predicate.

```javascript
const { fromPredicate } = require('cds-mbt/lib/core/invariant-builder');

const invariant = fromPredicate(name, predicate, description);
```

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `name` | `string` | Invariant name |
| `predicate` | `Function` | `(context, state) => boolean` |
| `description` | `string` | (Optional) Description |

**Example:**

```javascript
const positive = fromPredicate(
  'balancePositive',
  (ctx) => ctx.balance >= 0,
  'Account balance must be non-negative'
);
```

---

### combine

Combine multiple invariants into one.

```javascript
const { combine } = require('cds-mbt/lib/core/invariant-builder');

const combined = combine(name, invariants);
```

**Example:**

```javascript
const allSafetyInvariants = combine('safetyChecks', [
  budgetRespected,
  retriesBounded,
  dataConsistent
]);
```

---

### when

Create a conditional invariant that only applies when a condition is met.

```javascript
const { when } = require('cds-mbt/lib/core/invariant-builder');

const conditional = when(name, condition, check);
```

**Example:**

```javascript
const paymentValid = when(
  'paymentValidWhenProcessing',
  (ctx, state) => state === 'processingPayment',
  (ctx, state) => ({
    passed: ctx.paymentAmount > 0,
    message: 'Payment amount must be positive when processing'
  })
);
```

---

### bound

Create an invariant that checks a property bound.

```javascript
const { bound } = require('cds-mbt/lib/core/invariant-builder');

const bounded = bound(property, operator, boundProperty);
```

**Operators:** `'lt'`, `'lte'`, `'gt'`, `'gte'`, `'eq'`

**Example:**

```javascript
const budgetBound = bound('llmCallsUsed', 'lte', 'llmCallsBudget');
// Equivalent to: llmCallsUsed <= llmCallsBudget
```

---

## Built-in Invariants

```javascript
const { invariants } = require('cds-mbt');
```

| Invariant | Description |
|-----------|-------------|
| `invariants.budgetRespected` | LLM calls must not exceed budget |
| `invariants.retriesBounded` | Retries per tool must not exceed max |
| `invariants.noInvalidCompletion` | Cannot complete without required tool success |
| `invariants.escalationHasReason` | Escalated state must have error reason |

**Usage:**

```javascript
const { runMBT, invariants } = require('cds-mbt');

await runMBT(machine, [
  invariants.budgetRespected,
  invariants.retriesBounded
]);
```

---

## Report Generation

### generateReport

Generate an HTML report from MBT results.

```javascript
const { generateReport } = require('cds-mbt');

const { path } = await generateReport(result, options);
```

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `result` | `MBTResult` | Result from `runMBT()` |
| `options` | `Object` | (Optional) Report options |

**Options:**

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `output` | `string` | `'./test/reports/mbt-report.html'` | Output file path |
| `title` | `string` | `'MBT Report'` | Report title |
| `includePathVisualization` | `boolean` | `true` | Show all explored paths |

**Returns:** `Promise<{ path: string }>`

**Example:**

```javascript
const { runMBT, generateReport, invariants } = require('cds-mbt');

const result = await runMBT(machine, [invariants.budgetRespected]);

const { path } = await generateReport(result, {
  output: './reports/agent-mbt.html',
  title: 'Agent MBT Report'
});

console.log(`Report generated: ${path}`);
```

---

## Joule Module

```javascript
const { joule } = require('cds-mbt');
// or
const joule = require('cds-mbt/lib/joule');
```

### extractMachine

Extract an XState machine from a CDS file with `@agent` annotation.

```javascript
const { joule } = require('cds-mbt');

const machine = joule.extractMachine(cdsFilePath);
```

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `cdsFilePath` | `string` | Path to CDS file |

**Returns:** XState machine definition

**Supported Annotations:**
- `@agent` - Marks service as an agent
- `@agent.hitl` - Requires human approval
- `@tool('name')` - Tool reference

**Example:**

```javascript
const { joule, runMBT, invariants } = require('cds-mbt');

// Given: srv/order.cds with @agent annotation
const machine = joule.extractMachine('./srv/order.cds');

const result = await runMBT(machine, [invariants.budgetRespected]);
```

---

### extractFromDefinition

Extract machine from a service definition object (programmatic use).

```javascript
const { joule } = require('cds-mbt');

const machine = joule.extractFromDefinition(serviceDefinition);
```

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `serviceDefinition` | `Object` | Service definition object |

**Service Definition:**

| Property | Type | Description |
|----------|------|-------------|
| `name` | `string` | Service name |
| `actions` | `Array<string>` | Action names |
| `hitlActions` | `Array<string>` | Actions requiring approval |
| `tools` | `Array<string>` | Available tools |
| `budget` | `number` | LLM call budget (default: 10) |
| `maxRetries` | `number` | Max retries per action (default: 3) |

**Example:**

```javascript
const { joule } = require('cds-mbt');

const machine = joule.extractFromDefinition({
  name: 'OrderService',
  actions: ['createOrder', 'processPayment', 'shipOrder'],
  hitlActions: ['processPayment'],
  budget: 15
});
```

---

### createReActMachine

Create a ReAct (observe → think → act) loop machine.

```javascript
const { joule } = require('cds-mbt');

const machine = joule.createReActMachine(config);
```

**Config:**

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `id` | `string` | `'react'` | Machine ID |
| `maxIterations` | `number` | `10` | Max observe-think-act cycles |
| `budget` | `number` | `20` | LLM call budget |
| `tools` | `string[]` | `[]` | Available tools |
| `additionalStates` | `Object` | `{}` | Extra state definitions |
| `additionalGuards` | `Object` | `{}` | Extra guard functions |
| `additionalActions` | `Object` | `{}` | Extra action functions |

**Machine States:**
- `idle` - Waiting to start
- `observing` - Gathering observations
- `thinking` - LLM reasoning
- `acting` - Executing actions
- `synthesizing` - Creating final answer
- `completed` - Successfully finished
- `escalated` - Failed/timed out

**Context:**

```typescript
interface ReActContext {
  iteration: number;
  maxIterations: number;
  llmCallsUsed: number;
  llmCallsBudget: number;
  observations: any[];
  thoughts: any[];
  actions: any[];
  toolResults: Record<string, any>;
  availableTools: string[];
  finalAnswer: any | null;
  errorReason: string | null;
}
```

**Example:**

```javascript
const { joule, runMBT, invariants } = require('cds-mbt');

const agentMachine = joule.createReActMachine({
  id: 'orderAgent',
  maxIterations: 5,
  budget: 15,
  tools: ['lookupOrder', 'updateStatus', 'sendNotification']
});

const result = await runMBT(agentMachine, [
  invariants.budgetRespected,
  invariants.retriesBounded
]);
```

---

### createA2AMachine

Create an Agent-to-Agent communication protocol machine.

```javascript
const { joule } = require('cds-mbt');

const machine = joule.createA2AMachine(config);
```

**Config:**

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `id` | `string` | `'a2a'` | Machine ID |
| `protocol` | `string` | `'request-response'` | Protocol type |
| `timeout` | `number` | `30000` | Timeout in ms |
| `maxNegotiations` | `number` | `3` | Max negotiation rounds |

**Machine States:**
- `idle` - Not connected
- `initializing` - Setting up connection
- `negotiating` - Protocol negotiation
- `executing` - Running the agreed task
- `finalizing` - Completing transaction
- `completed` - Success
- `failed` - Error state

---

### createHITLMachine

Create a Human-in-the-Loop approval workflow machine.

```javascript
const { joule } = require('cds-mbt');

const machine = joule.createHITLMachine(config);
```

**Config:**

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `id` | `string` | `'hitl'` | Machine ID |
| `approvers` | `string[]` | `[]` | Required approvers |
| `requiredApprovals` | `number` | `1` | Approvals needed |
| `timeout` | `number` | `86400000` | Timeout (24h default) |
| `allowEscalation` | `boolean` | `true` | Allow escalation on timeout |

**Machine States:**
- `idle` - No pending request
- `pending_approval` - Awaiting approval
- `approved` - Request approved
- `rejected` - Request rejected
- `escalated` - Escalated (timeout or manual)
- `cancelled` - Request cancelled

---

### createSubagentMachine

Create a subagent orchestration machine.

```javascript
const { joule } = require('cds-mbt');

const machine = joule.createSubagentMachine(config);
```

**Config:**

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `id` | `string` | `'subagent'` | Machine ID |
| `maxSubagents` | `number` | `5` | Max concurrent subagents |
| `timeout` | `number` | `60000` | Per-subagent timeout |
| `strategy` | `string` | `'parallel'` | `'parallel'`, `'sequential'`, or `'race'` |

**Machine States:**
- `idle` - Not initialized
- `spawning` - Creating subagents
- `monitoring` - Watching subagent progress
- `collecting` - Gathering results
- `synthesizing` - Combining results
- `completed` - Success
- `failed` - Error state

---

### RuntimeAdapter

Runtime adapter for connecting to live agents.

```javascript
const { joule } = require('cds-mbt');

const adapter = new joule.RuntimeAdapter(options);
```

**Constructor Options:**

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `autoValidate` | `boolean` | `false` | Auto-validate on state changes |
| `invariants` | `Array` | `[]` | Invariants for auto-validation |
| `recordHistory` | `boolean` | `true` | Keep state history |
| `maxHistorySize` | `number` | `1000` | Max history entries |

**Properties:**

| Property | Type | Description |
|----------|------|-------------|
| `isAttached` | `boolean` | Whether attached to an agent |
| `currentState` | `string | null` | Current agent state |
| `currentContext` | `Object | null` | Current context |
| `history` | `Array` | State transition history |

**Methods:**

#### attach(agentInstance)

Attach to a running agent.

```javascript
adapter.attach(myAgent);
```

Supports:
- XState actors (via `subscribe`)
- EventEmitters (via `on('stateChange')`)
- Callback-style agents (via `onStateChange`)

#### detach()

Detach from the current agent.

```javascript
adapter.detach();
```

#### onStateChange(callback)

Register callback for state changes.

```javascript
const unsubscribe = adapter.onStateChange((event) => {
  console.log(`${event.previousState} → ${event.currentState}`);
});

// Later:
unsubscribe();
```

**Event Object:**

```typescript
interface StateChangeEvent {
  previousState: string;
  currentState: string;
  context: Object;
  event: Object | null;
  timestamp: number;
}
```

#### validateCurrent(invariants?)

Validate current state against invariants.

```javascript
const result = adapter.validateCurrent([budgetRespected]);

if (!result.valid) {
  console.error('Violations:', result.failed);
}
```

**Returns:**

```typescript
interface ValidationResult {
  valid: boolean;
  passed: string[];
  failed: Array<{ name: string; message: string; severity: string }>;
  skipped: Array<{ name: string; message: string }>;
  state: string;
  timestamp: number;
}
```

#### onValidation(callback)

Register callback for validation results.

```javascript
const unsubscribe = adapter.onValidation((result) => {
  if (!result.valid) alertOps(result.failed);
});
```

#### setAutoValidate(enabled, invariants?)

Enable/disable auto-validation.

```javascript
adapter.setAutoValidate(true, [budgetRespected, retriesBounded]);
```

#### clearHistory()

Clear state transition history.

```javascript
adapter.clearHistory();
```

**Example:**

```javascript
const { joule, invariants } = require('cds-mbt');

const adapter = new joule.RuntimeAdapter({
  autoValidate: true,
  invariants: [invariants.budgetRespected]
});

adapter.attach(runningAgent);

adapter.onStateChange((event) => {
  console.log(`State: ${event.currentState}`);
});

adapter.onValidation((result) => {
  if (!result.valid) {
    console.error('Violation detected:', result.failed);
    // Could trigger alert, rollback, etc.
  }
});

// When done:
adapter.detach();
```

---

## TLA+ Module

```javascript
const { tla } = require('cds-mbt');
// or
const tla = require('cds-mbt/lib/tla');
```

### generateTLASpec

Generate a TLA+ specification from an XState machine.

```javascript
const { tla } = require('cds-mbt');

const tlaContent = tla.generateTLASpec(machine, invariants, options);
```

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `machine` | `Object` | XState machine definition |
| `invariants` | `Array` | (Optional) Invariants to translate |
| `options` | `Object` | (Optional) Generation options |

**Options:**

| Option | Type | Description |
|--------|------|-------------|
| `moduleName` | `string` | Override module name (defaults to machine ID) |

**Returns:** `string` - TLA+ specification content

**Example:**

```javascript
const { tla, invariants } = require('cds-mbt');
const { createMachine } = require('xstate');
const fs = require('fs');

const machine = createMachine({
  id: 'orderAgent',
  initial: 'idle',
  context: { llmCallsUsed: 0, llmCallsBudget: 10 },
  states: {
    idle: { on: { START: 'processing' } },
    processing: { on: { DONE: 'completed' } },
    completed: { type: 'final' }
  }
});

const spec = tla.generateTLASpec(machine, [invariants.budgetRespected]);
fs.writeFileSync('OrderAgent.tla', spec);
```

**Generated Structure:**

```tla+
---- MODULE OrderAgent ----
EXTENDS TLC, Naturals, Integers

CONSTANTS State_idle, State_processing, State_completed

VARIABLES state, llmCallsUsed, llmCallsBudget

vars == <<state, llmCallsUsed, llmCallsBudget>>

TypeOK == ...
Init == ...
Action_START_0 == ...
Next == ...
Spec == Init /\ [][Next]_vars

budgetRespected == llmCallsUsed <= llmCallsBudget

====
```

---

### generateTLCConfig

Generate a TLC configuration file.

```javascript
const { tla } = require('cds-mbt');

const cfgContent = tla.generateTLCConfig(machine, invariants, options);
```

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `machine` | `Object` | XState machine definition |
| `invariants` | `Array` | Invariants to check |
| `options` | `Object` | (Optional) Config options |

**Options:**

| Option | Type | Description |
|--------|------|-------------|
| `checkLiveness` | `boolean` | Include liveness properties section |

**Returns:** `string` - TLC configuration content

---

### TLCRunner

Run TLC model checker on TLA+ specifications.

```javascript
const { tla } = require('cds-mbt');

const runner = new tla.TLCRunner(options);
```

**Constructor Options:**

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `tlcPath` | `string` | auto-detect | Path to tla2tools.jar |
| `javaPath` | `string` | `'java'` | Path to Java executable |
| `tempDir` | `string` | OS temp | Temporary file directory |

**Methods:**

#### checkSpec(tlaContent, options)

Check a TLA+ specification provided as a string.

```javascript
const result = await runner.checkSpec(tlaContent, {
  workers: 2,
  depth: 100,
  timeout: 60000
});
```

**Options:**

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `workers` | `number` | `1` | Worker threads |
| `depth` | `number` | `100` | Max trace depth |
| `configContent` | `string` | `null` | TLC config content |
| `timeout` | `number` | `60000` | Timeout in ms |

**Returns:**

```typescript
interface TLCResult {
  passed: boolean | null;  // null if TLC not available or timed out
  counterexample: Counterexample | null;
  stats: {
    statesGenerated?: number;
    distinctStates?: number;
    depth?: number;
    timeMs?: number;
    timedOut?: boolean;
  };
  error?: string;
  raw?: string;
}

interface Counterexample {
  invariant: string | null;
  trace: Array<{ step: number; state: string }>;
}
```

#### runFile(tlaFilePath, options)

Run TLC on a TLA+ file.

```javascript
const result = await runner.runFile('./specs/Agent.tla', {
  workers: 4,
  depth: 200
});
```

**Options:**

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `workers` | `number` | `1` | Worker threads |
| `depth` | `number` | `100` | Max trace depth |
| `timeout` | `number` | `60000` | Timeout in ms |
| `deadlock` | `boolean` | `true` | Check for deadlocks |

#### TLCRunner.getTestSpec()

Get a minimal test specification to verify TLC installation.

```javascript
const testSpec = tla.TLCRunner.getTestSpec();
const result = await runner.checkSpec(testSpec);
if (result.passed) {
  console.log('TLC is working correctly');
}
```

**Example:**

```javascript
const { tla, invariants } = require('cds-mbt');
const { createMachine } = require('xstate');

// Create machine
const machine = createMachine({ /* ... */ });

// Generate TLA+ spec
const spec = tla.generateTLASpec(machine, [invariants.budgetRespected]);

// Run TLC
const runner = new tla.TLCRunner();
const result = await runner.checkSpec(spec, { workers: 2 });

if (result.passed === null) {
  console.log('TLC not available:', result.error);
} else if (result.passed) {
  console.log('Verification passed!');
  console.log(`States explored: ${result.stats.statesGenerated}`);
} else {
  console.log('Counterexample found:', result.counterexample);
}
```
