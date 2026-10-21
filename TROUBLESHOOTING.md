# Troubleshooting

Common issues and solutions for cds-mbt.

## Installation Issues

### `npm install` fails with peer dependency warning

**Symptom:**
```
npm WARN cds-mbt@1.0.0 requires a peer of @sap/cds@>=7.0.0
```

**Cause:** `@sap/cds` is an optional peer dependency.

**Solution:** If you're using cds-mbt with CAP, install `@sap/cds`:
```bash
npm install @sap/cds
```

If you're using cds-mbt standalone (without CAP), ignore this warning. The core MBT functionality works without it.

---

### `cds-mbt` command not found

**Symptom:**
```
'cds-mbt' is not recognized as an internal or external command
```

**Cause:** Global install didn't add to PATH, or using npx incorrectly.

**Solution:**
```bash
# Option 1: Use npx
npx cds-mbt --help

# Option 2: Install globally
npm install -g cds-mbt
cds-mbt --help

# Option 3: Use npm scripts (recommended)
# In package.json:
{
  "scripts": {
    "test:mbt": "cds-mbt run"
  }
}
npm run test:mbt
```

---

## CDS Plugin Issues

### Plugin not loading with `cds mbt`

**Symptom:**
```
Unknown command: mbt
```

**Cause:** cds-mbt not registered as CDS plugin.

**Solution:** Add to your `package.json`:
```json
{
  "cds": {
    "requires": {
      "mbt": {
        "impl": "cds-mbt"
      }
    }
  }
}
```

Or create `.cdsrc.json`:
```json
{
  "requires": {
    "mbt": {
      "impl": "cds-mbt"
    }
  }
}
```

---

### `@agent` annotation not recognized

**Symptom:**
```
Error: No @agent annotation found in service definition
```

**Cause:** CDS file missing the agent annotation.

**Solution:** Add `@agent` to your service:
```cds
@agent
service OrderService {
  action processOrder(orderId: UUID) returns String;
}
```

---

## XState Issues

### Version mismatch errors

**Symptom:**
```
TypeError: machine.provide is not a function
```

**Cause:** XState v4 vs v5 incompatibility.

**Solution:** cds-mbt requires XState v5. Check your version:
```bash
npm ls xstate
```

If you have v4, upgrade:
```bash
npm install xstate@^5.0.0
```

---

### "Maximum call stack size exceeded"

**Symptom:**
```
RangeError: Maximum call stack size exceeded
```

**Cause:** State machine has infinite loops without proper guards.

**Solution:**

1. Check your machine for cycles without exit conditions
2. Add guards to break loops:
```javascript
on: {
  RETRY: {
    target: 'processing',
    guard: ({ context }) => context.retries < context.maxRetries
  }
}
```

3. Reduce `maxDepth` option:
```javascript
await runMBT(machine, invariants, { maxDepth: 20 });
```

---

## TLA+ / TLC Issues

### "Java not found" or TLC won't run

**Symptom:**
```
Error: Java runtime not found. TLC requires Java 11+.
```

**Cause:** Java not installed or not in PATH.

**Solution:**

1. Install Java 11 or later:
   - macOS: `brew install openjdk@11`
   - Ubuntu: `sudo apt install openjdk-11-jre`
   - Windows: Download from [Adoptium](https://adoptium.net/)

2. Verify installation:
```bash
java -version
```

3. If Java is installed but not found, set JAVA_HOME:
```bash
export JAVA_HOME=/path/to/java
export PATH=$JAVA_HOME/bin:$PATH
```

---

### "tla2tools.jar not found"

**Symptom:**
```
Error: TLC tools not found at expected location
```

**Cause:** TLA+ tools not downloaded.

**Solution:**

1. Download tla2tools.jar from [TLA+ releases](https://github.com/tlaplus/tlaplus/releases)

2. Set path in options:
```javascript
const runner = new TLCRunner({
  tlcPath: '/path/to/tla2tools.jar'
});
```

Or set environment variable:
```bash
export TLC_JAR=/path/to/tla2tools.jar
```

---

### TLC times out on large machines

**Symptom:**
```
TLC timed out after 60000ms
```

**Cause:** State space too large for default timeout.

**Solution:**

1. Increase timeout:
```javascript
await runner.checkSpec(spec, { timeout: 300000 }); // 5 minutes
```

2. Use more workers:
```javascript
await runner.checkSpec(spec, { workers: 4 });
```

3. Reduce state space by constraining context values in your machine.

---

## Invariant Issues

### Custom invariant not being checked

**Symptom:** Your invariant never reports violations even when it should.

**Cause:** Invariant returning wrong structure.

**Solution:** Ensure your check function returns the correct format:
```javascript
const myInvariant = createInvariant({
  name: 'myCheck',
  check: (context, state) => ({
    passed: context.value > 0,  // Must be boolean
    message: 'Value must be positive'  // Required when passed is false
  })
});
```

Common mistakes:
- Returning just `true`/`false` instead of `{ passed: boolean }`
- Forgetting `message` when `passed` is `false`
- Returning `undefined`

---

### "Invariant 'X' is not valid"

**Symptom:**
```
Error: Invariant 'budgetCheck' is not valid: missing 'check' function
```

**Cause:** Invariant object missing required properties.

**Solution:** Use `createInvariant` helper:
```javascript
const { createInvariant } = require('cds-mbt');

const budgetCheck = createInvariant({
  name: 'budgetCheck',           // Required
  check: (ctx, state) => ({      // Required
    passed: ctx.used <= ctx.budget,
    message: `Used ${ctx.used} exceeds budget ${ctx.budget}`
  }),
  description: 'Budget must not be exceeded',  // Optional
  severity: 'error'              // Optional: 'error' or 'warning'
});
```

---

## Joule Integration Issues

### RuntimeAdapter not receiving state changes

**Symptom:** `onStateChange` callback never fires.

**Cause:** Agent not emitting state change events in expected format.

**Solution:**

1. For XState actors:
```javascript
const adapter = new RuntimeAdapter();
adapter.attach(actor);  // Must be a running actor, not machine definition
```

2. For custom agents, emit events:
```javascript
// Your agent must emit 'stateChange' events
agent.on('stateChange', (event) => { /* ... */ });
// Or have onStateChange method
agent.onStateChange = (callback) => { /* ... */ };
```

---

### "Cannot extract machine from CDS file"

**Symptom:**
```
Error: Failed to parse CDS file: unexpected token
```

**Cause:** CDS file has syntax errors or unsupported constructs.

**Solution:**

1. Validate CDS syntax:
```bash
cds compile srv/my-service.cds
```

2. Use `extractFromDefinition` instead for programmatic use:
```javascript
const { joule } = require('cds-mbt');

const machine = joule.extractFromDefinition({
  name: 'MyService',
  actions: ['doSomething'],
  budget: 10
});
```

---

## Report Generation Issues

### HTML report not generating

**Symptom:**
```
Error: ENOENT: no such file or directory, open './test/reports/mbt-report.html'
```

**Cause:** Output directory doesn't exist.

**Solution:** Create the directory first:
```javascript
const fs = require('fs');
fs.mkdirSync('./test/reports', { recursive: true });

await generateReport(result, {
  output: './test/reports/mbt-report.html'
});
```

---

## Performance Issues

### Path exploration is slow

**Symptom:** `explorePaths` takes minutes to complete.

**Cause:** State space explosion from large context or many states.

**Solution:**

1. Limit exploration:
```javascript
const paths = explorePaths(machine, {
  maxDepth: 20,    // Reduce from default 50
  maxPaths: 100    // Reduce from default 1000
});
```

2. Simplify context – remove values not needed for transitions.

3. Use `failFast` to stop on first violation:
```javascript
await runMBT(machine, invariants, { failFast: true });
```

---

## Still stuck?

1. Check [GitHub Issues](https://github.com/adil-faiyaz98/cds-mbt/issues) for similar problems
2. Open a new issue with:
   - cds-mbt version (`npm ls cds-mbt`)
   - Node.js version (`node --version`)
   - Minimal reproduction case
   - Full error output
