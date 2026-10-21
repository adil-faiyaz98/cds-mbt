# Approval Flow Example

A complete CAP project demonstrating multi-step approval workflows with human-in-the-loop (HITL) patterns, tested using cds-mbt for formal verification of approval chain integrity.

## Business Value

Approval workflows are critical for compliance and governance. This example demonstrates:

- **Approval Chain Integrity**: All required levels must approve before completion
- **Audit Trail**: Complete history of every action for compliance
- **Escalation Handling**: Urgent cases can bypass normal chain with documentation
- **Delegation Support**: Approvers can delegate to colleagues when needed

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                  Approval Flow State Machine                     │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│   ┌───────┐    ┌───────────┐    ┌───────────────┐               │
│   │ draft │───►│ submitted │───►│ pendingLevel1 │               │
│   └───────┘    └───────────┘    └───────────────┘               │
│                     │                   │                        │
│                     │           ┌───────┴──────┐                 │
│              (auto-approve)     │              │                 │
│                     │       APPROVE       REJECT                 │
│                     │           │              │                 │
│                     │           ▼              │                 │
│                     │   ┌───────────────┐     │                  │
│                     │   │ pendingLevel2 │     │                  │
│                     │   └───────────────┘     │                  │
│                     │           │              │                 │
│                     │           ▼              │                 │
│                     │   ┌───────────────┐     │                  │
│                     │   │ pendingLevel3 │     │                  │
│                     │   └───────────────┘     │                  │
│                     │           │              │                 │
│                     ▼           ▼              ▼                 │
│              ┌──────────┐  ┌──────────┐                          │
│              │ approved │  │ rejected │                          │
│              └──────────┘  └──────────┘                          │
│                     ▲                                            │
│                     │                                            │
│              ┌─────────────┐                                     │
│              │  escalated  │ ◄─── (ESCALATE from any level)      │
│              └─────────────┘                                     │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

## HITL Patterns

Human-in-the-loop actions marked with `@hitl`:

1. **approve** - Approve at current level, advance to next
2. **reject** - Reject request with mandatory reason
3. **escalate** - Bypass chain for urgent cases (requires reason)
4. **delegate** - Hand off to another approver

## Invariants Verified

The cds-mbt tests verify these critical properties:

1. **approvalChainComplete**: Approved requests have all levels completed
2. **noSkippedApprovers**: Levels must be approved in sequence
3. **escalationHasReason**: Escalations have documented reasons
4. **rejectionHasReason**: Rejections have documented reasons
5. **delegationBounded**: Delegations don't exceed max limit
6. **approvalHasApprover**: Every approval identifies the approver

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

```bash
npm run test:mbt
```

Expected output:
```
Approval Flow MBT
  Path Exploration
    ✓ should explore all paths through the approval machine
    ✓ should find multi-level approval paths
    ✓ should find escalation paths
    ✓ should find rejection paths
    ✓ should find delegation paths
  Invariant Checking
    ✓ should verify approval chain completeness
    ✓ should verify no approvers are skipped
    ✓ should verify escalations have reasons
    ✓ should verify rejections have reasons
    ✓ should verify delegation is bounded
    ✓ should verify all invariants together
  HITL Pattern Verification
    ✓ should ensure human approval is required at each level
    ✓ should verify each approval has an identified approver
    ✓ should track approval history correctly
```

## Project Structure

```
approval-flow/
├── db/
│   └── schema.cds               # Approval data model
├── srv/
│   ├── approval.cds             # Service with @hitl actions
│   └── approval.js              # Workflow implementation
├── test/
│   └── mbt/
│       ├── machines/
│       │   └── approval.machine.js      # State machine
│       ├── invariants/
│       │   └── approval.invariants.js   # HITL invariants
│       └── approval.mbt.test.js          # MBT test suite
├── package.json
└── README.md
```

## Service API

### HITL Actions (require human decision)

- `approve(requestId, comments)` - Approve at current level
- `reject(requestId, reason)` - Reject with mandatory reason
- `escalate(requestId, reason, targetApproverId)` - Escalate to executive
- `delegate(requestId, toApproverId, reason)` - Delegate to colleague

### Standard Actions

- `submitRequest(requestId)` - Submit for approval
- `recallRequest(requestId, reason)` - Recall before first approval

### Query Functions

- `getPendingApprovals(approverId)` - Get pending items for approver
- `getApprovalChain(requestId)` - Get full chain status
- `checkAutoApproval(requestId)` - Check if auto-approve is possible

## Key Implementation Patterns

### Multi-Level Approval Chain

```javascript
// Each level transitions to the next or completes
pendingLevel1: {
  on: {
    APPROVE: [
      { target: 'pendingLevel2', guard: 'needsMoreLevels' },
      { target: 'approved', guard: 'isFinalLevel' }
    ]
  }
}
```

### Approval Tracking

```javascript
context: {
  currentLevel: 1,
  totalLevels: 3,
  approvalsByLevel: {
    1: { approver: 'Manager', comments: '...', timestamp: '...' },
    2: { approver: 'Director', comments: '...', timestamp: '...' }
  }
}
```

### HITL Invariant

```javascript
const escalationHasReason = createInvariant({
  name: 'escalationHasReason',
  description: 'Escalated requests must have documented reason',
  check: (context, state) => {
    if (state !== 'escalated') return { passed: true };
    
    return {
      passed: context.escalationReason?.trim() !== '',
      message: 'Escalation requires documented reason'
    };
  }
});
```

## Approval Chain Configuration

Configure approval chains in `ApprovalChains` entity:

```
Type      | Level | Role     | Amount Threshold
----------|-------|----------|------------------
expense   | 1     | manager  | 0
expense   | 2     | director | 5000
expense   | 3     | vp       | 25000
purchase  | 1     | manager  | 0
purchase  | 2     | cfo      | 10000
```

## Extending This Example

### Add New Approval Types

1. Add entries to `ApprovalChains`
2. Machine automatically routes based on type/amount
3. Run MBT to verify no new violations

### Add New Invariants

```javascript
const myInvariant = createInvariant({
  name: 'urgentHasFastSLA',
  description: 'Urgent requests must have 1-day SLA',
  check: (context, state) => {
    // Verify urgent requests are handled quickly
  }
});
```

## Why MBT for Approval Workflows?

Traditional tests might miss edge cases like:

- What if Level 2 approves before Level 1?
- Can a request be approved without any human action?
- Does escalation properly document the reason?
- What happens with multiple delegations?

MBT exhaustively explores these scenarios, ensuring compliance rules are never violated.
