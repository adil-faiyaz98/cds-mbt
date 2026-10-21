# Migration Workflow Example

A complete CAP project demonstrating data migration with rollback capability, tested using cds-mbt for formal verification of data integrity guarantees.

## Business Value

Data migrations are high-risk operations that can leave systems in inconsistent states. This example demonstrates:

- **Atomic Migrations**: Either all data is migrated or none, preventing partial data states
- **Rollback Capability**: Any migration can be rolled back before commit
- **Audit Trail**: Complete logging of migration status and any errors
- **Data Consistency**: Formal verification that source and target counts always match

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    Migration State Machine                       │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│   ┌──────┐    ┌────────────┐    ┌──────────────┐                │
│   │ idle │───►│ extracting │───►│ transforming │                │
│   └──────┘    └────────────┘    └──────────────┘                │
│                     │                  │                         │
│                     │                  ▼                         │
│                     │           ┌──────────┐                     │
│                     │           │ loading  │                     │
│                     │           └──────────┘                     │
│                     │                  │                         │
│                     ▼                  ▼                         │
│              ┌───────────┐      ┌───────────┐     ┌──────────┐  │
│              │ verifying │─────►│ committing│────►│ completed │  │
│              └───────────┘      └───────────┘     └──────────┘  │
│                     │                  │                         │
│                     │                  │                         │
│                     ▼                  ▼                         │
│              ┌─────────────┐    ┌────────┐                       │
│              │ rollingBack │───►│ failed │                       │
│              └─────────────┘    └────────┘                       │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

## Invariants Verified

The cds-mbt tests verify these critical properties:

1. **dataConsistent**: Source and target record counts match after completion
2. **rollbackAvailable**: Rollback data exists until migration is committed
3. **noPartialCommit**: Commit is atomic - all records or none
4. **errorDocumented**: All failures have documented reasons for audit

## Quick Start

```bash
# Install dependencies
npm install

# Run MBT tests
npm run test:mbt

# Start the service (requires @sap/cds)
npm start
```

## Running MBT

The MBT tests explore all possible paths through the migration state machine:

```bash
npm run test:mbt
```

Expected output:
```
Migration Workflow MBT
  Path Exploration
    ✓ should explore all paths through the migration machine
    ✓ should find rollback paths
    ✓ should find error handling paths
  Invariant Checking
    ✓ should verify data consistency invariant across all paths
    ✓ should verify rollback availability invariant
    ✓ should verify no partial commit invariant
    ✓ should verify error documentation invariant
    ✓ should verify all invariants together
```

## Project Structure

```
migration-workflow/
├── db/
│   └── schema.cds          # Data model (Products, MigrationLog)
├── srv/
│   ├── migration.cds       # Service definition
│   └── migration.js        # Service implementation
├── test/
│   └── mbt/
│       ├── machines/
│       │   └── migration.machine.js   # State machine definition
│       ├── invariants/
│       │   └── migration.invariants.js # Custom invariants
│       └── migration.mbt.test.js       # MBT test suite
├── package.json
└── README.md
```

## Service API

### Actions

- `startMigration(batchSize)` - Begin a new migration batch
- `commitMigration(migrationId)` - Finalize migration (no rollback after)
- `rollback(migrationId)` - Revert all changes from a migration

### Functions

- `checkStatus(migrationId)` - Get current migration status
- `verifyMigration(migrationId)` - Verify data consistency

## Key Implementation Patterns

### State Machine Design

The migration uses a state machine to ensure:
- Transitions only happen in valid order (extract → transform → load)
- Rollback is always available until commit
- Errors are caught and documented at each phase

### Rollback Data

```javascript
// Rollback data is stored at each phase
context.rollbackData = {
  timestamp: Date.now(),
  sourceRecords: [...],
  targetIds: [...]  // IDs of inserted records
};
```

### Invariant Definition

```javascript
const dataConsistent = createInvariant({
  name: 'dataConsistent',
  description: 'Source and target counts must match',
  check: (context, state) => {
    if (state === 'completed') {
      return {
        passed: context.sourceCount === context.targetCount,
        message: context.sourceCount !== context.targetCount
          ? `Mismatch: source=${context.sourceCount}, target=${context.targetCount}`
          : null
      };
    }
    return { passed: true };
  }
});
```

## Extending This Example

### Add New Migration Phases

1. Add state to machine in `migration.machine.js`
2. Add transitions and actions
3. Update invariants to cover new state
4. Run MBT to verify no violations

### Add New Invariants

```javascript
const myInvariant = createInvariant({
  name: 'myInvariant',
  description: 'What this checks',
  check: (context, state) => {
    // Return { passed: boolean, message?: string }
  }
});
```

## Why MBT?

Traditional unit tests check specific scenarios. MBT exhaustively explores ALL possible paths through the state machine, finding edge cases you might not think to test:

- What happens if load fails after partial processing?
- Can we reach completed state with mismatched counts?
- Is rollback data always available when needed?

This catches bugs before they cause data corruption in production.
