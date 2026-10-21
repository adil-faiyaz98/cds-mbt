# Frequently Asked Questions

## General

### What is Model-Based Testing?

Model-Based Testing (MBT) generates tests from a model of your system's behavior. Instead of writing individual test cases, you define:
1. A state machine describing possible states and transitions
2. Invariants (rules that must always hold)

The MBT engine explores all reachable paths and checks invariants at every step, finding edge cases you'd never think to test manually.

### How is this different from unit tests?

| Unit Tests | Model-Based Testing |
|------------|---------------------|
| Test paths you think of | Tests all reachable paths |
| Manual test case creation | Automatic path exploration |
| Miss edge case combinations | Finds unexpected interactions |
| Pass/fail on specific inputs | Pass/fail on invariant violations |

MBT complements unit tests – use both.

### Do I need @sap/cds to use cds-mbt?

No. The core MBT functionality (path exploration, invariant checking, XState integration) works standalone. `@sap/cds` is only needed for:
- CDS plugin integration (`cds mbt init/run/watch`)
- Extracting machines from `.cds` files with `@agent` annotation
- Running inside CAP projects

### What XState version is required?

XState v5.x. cds-mbt uses the v5 API (`machine.provide`, actor model). XState v4 is not supported.

---

## TLA+ Integration

### Do I need Java for TLA+?

Only if you want to run the TLC model checker. The `generateTLASpec` function works without Java – it just produces `.tla` files.

To run TLC verification, you need Java 11+.

### Is TLA+ required to use cds-mbt?

No. TLA+ integration is optional. You can use:
- `runMBT()` – JavaScript-based path exploration (no Java)
- `explorePaths()` + `checkInvariants()` – manual exploration (no Java)
- `generateTLASpec()` + `TLCRunner` – TLA+ verification (requires Java)

Most users don't need TLA+. Use it for:
- Formal verification requirements
- Complex concurrent systems
- Safety-critical applications

### Why would I use TLA+ over JavaScript exploration?

| JavaScript (runMBT) | TLA+ (TLCRunner) |
|---------------------|------------------|
| Faster for small machines | Better for large state spaces |
| No external dependencies | Requires Java |
| Explores paths sequentially | Multi-threaded exploration |
| Good for agent workflows | Good for distributed systems |

---

## Joule / SAP AI Integration

### Does cds-mbt work with Joule?

Yes. The `joule` module provides:
- `createReActMachine` – ReAct loop pattern
- `createHITLMachine` – Human-in-the-loop approval
- `createA2AMachine` – Agent-to-agent communication
- `createSubagentMachine` – Subagent orchestration
- `RuntimeAdapter` – Attach to running agents

### How do I test my Joule agent?

```javascript
const { joule, runMBT, invariants } = require('cds-mbt');

// Option 1: Create a ReAct machine
const machine = joule.createReActMachine({
  maxIterations: 10,
  budget: 20,
  tools: ['search', 'calculate', 'respond']
});

// Option 2: Extract from CDS definition
const machine = joule.extractMachine('./srv/my-agent.cds');

// Run MBT
const result = await runMBT(machine, [
  invariants.budgetRespected,
  invariants.retriesBounded
]);
```

### Can I test a live running agent?

Yes, using `RuntimeAdapter`:

```javascript
const { joule, invariants } = require('cds-mbt');

const adapter = new joule.RuntimeAdapter({
  autoValidate: true,
  invariants: [invariants.budgetRespected]
});

adapter.attach(myRunningAgent);

adapter.onValidation((result) => {
  if (!result.valid) {
    console.error('Violation:', result.failed);
  }
});
```

---

## Invariants

### What invariants come built-in?

| Invariant | Checks |
|-----------|--------|
| `budgetRespected` | `llmCallsUsed <= llmCallsBudget` |
| `retriesBounded` | Retries per tool ≤ max retries |
| `noInvalidCompletion` | Can't complete without required success |
| `escalationHasReason` | Escalated state has error reason |

### How do I write a custom invariant?

```javascript
const { createInvariant } = require('cds-mbt');

const dataConsistent = createInvariant({
  name: 'dataConsistent',
  description: 'Source and target counts must match',
  severity: 'error',
  check: (context, state) => {
    // Skip check in certain states
    if (state === 'rollingBack') {
      return { passed: true, skipped: true };
    }
    
    const match = context.sourceCount === context.targetCount;
    return {
      passed: match,
      message: match ? null : `Mismatch: ${context.sourceCount} vs ${context.targetCount}`
    };
  }
});
```

### Can invariants access transition history?

Yes, via the `meta` parameter:

```javascript
check: (context, state, meta) => {
  // meta.step - current step
  // meta.path - full path so far
  // meta.stepIndex - position in path
  
  const previousStates = meta.path.steps.map(s => s.toState);
  // ... check something about history
}
```

---

## CI/CD Integration

### How do I run MBT in CI?

Add to your test script:

```json
{
  "scripts": {
    "test": "jest",
    "test:mbt": "cds-mbt run",
    "test:all": "npm test && npm run test:mbt"
  }
}
```

GitHub Actions example:
```yaml
- name: Run MBT tests
  run: npm run test:mbt
```

### Does cds-mbt produce JUnit/TAP output?

Not directly, but you can generate reports:

```javascript
const { runMBT, generateReport } = require('cds-mbt');

const result = await runMBT(machine, invariants);
await generateReport(result, { output: './reports/mbt.html' });

// For CI: exit with error code on failure
process.exit(result.passed ? 0 : 1);
```

### How do I fail CI on violations?

`cds-mbt run` exits with code 1 if any invariant fails. In your CI:

```yaml
- name: Run MBT
  run: npx cds-mbt run
  # CI fails automatically if violations found
```

---

## Performance

### How many paths can cds-mbt explore?

Default limits:
- `maxDepth`: 50 transitions per path
- `maxPaths`: 1000 total paths

Adjust for your needs:
```javascript
await runMBT(machine, invariants, {
  maxDepth: 100,
  maxPaths: 5000
});
```

### My machine has too many states. What can I do?

1. **Abstract** – Group similar states
2. **Constrain** – Limit context value ranges
3. **Focus** – Test subsystems separately
4. **Limit** – Use lower `maxDepth`/`maxPaths`
5. **TLA+** – Use TLC for multi-threaded exploration

### Is path exploration deterministic?

Yes. The same machine and options produce the same paths. This makes tests reproducible.

---

## Comparison with Other Tools

### How does cds-mbt compare to @xstate/graph?

`@xstate/graph` is a dependency of cds-mbt. We extend it with:
- Invariant checking at every step
- Built-in agent-specific invariants
- CDS/CAP integration
- Joule templates
- TLA+ export
- HTML reports

### Why not use property-based testing (fast-check)?

Property-based testing generates random inputs. MBT explores state transitions systematically. They're complementary:

- **Property-based**: Good for input validation, data transformations
- **MBT**: Good for workflows, state machines, multi-step processes

### Can I use cds-mbt with non-XState machines?

The core requires XState format. For other state machine libraries, convert to XState format first, or use the TLA+ export for a language-agnostic spec.

---

## Licensing & Support

### What license is cds-mbt under?

Apache 2.0. Free for commercial use.

### Where do I report bugs?

[GitHub Issues](https://github.com/adil-faiyaz98/cds-mbt/issues)

### Is there commercial support?

Not currently. Community support via GitHub Issues and Discussions.
