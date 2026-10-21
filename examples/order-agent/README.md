# Order Agent Example

A complete CAP project demonstrating an AI-powered order processing agent using the ReAct (Reason + Act) pattern, tested with cds-mbt for formal verification of business rules.

## Business Value

AI agents in e-commerce must handle complex workflows while respecting critical business rules. This example demonstrates:

- **LLM Budget Control**: Agent never exceeds configured LLM call budget
- **Business Rule Enforcement**: Inventory checked → Credit validated → Payment processed → Fulfillment
- **Graceful Degradation**: Agent escalates to humans when it cannot complete
- **Audit Trail**: Complete logging of agent reasoning and actions

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                   Order Agent State Machine                      │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│   ┌──────┐    ┌───────────┐    ┌─────────────────────┐          │
│   │ idle │───►│ reasoning │───►│ checkingInventory   │          │
│   └──────┘    └───────────┘    └─────────────────────┘          │
│                     │                    │                       │
│                     │                    ▼                       │
│                     │          ┌─────────────────────┐           │
│                     │          │ validatingCredit    │           │
│                     │          └─────────────────────┘           │
│                     │                    │                       │
│                     │                    ▼                       │
│                     │          ┌─────────────────────┐           │
│                     │          │ processingPayment   │           │
│                     │          └─────────────────────┘           │
│                     │                    │                       │
│                     │                    ▼                       │
│                     │          ┌─────────────────────┐           │
│                     │          │ reservingInventory  │           │
│                     │          └─────────────────────┘           │
│                     │                    │                       │
│                     ▼                    ▼                       │
│              ┌─────────────┐     ┌───────────┐                   │
│              │ synthesizing│────►│ completed │                   │
│              └─────────────┘     └───────────┘                   │
│                     │                                            │
│                     └───────────────►┌───────────┐               │
│         (budget exhausted)           │ escalated │               │
│         (tool failures)              └───────────┘               │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

## ReAct Pattern

The agent uses the Reason + Act pattern:

1. **Reason (think)**: Analyze order request, plan next action
2. **Act (tool_call)**: Execute a tool (check inventory, process payment, etc.)
3. **Observe**: Process tool result
4. **Repeat** until order is complete or escalation needed

## Invariants Verified

The cds-mbt tests verify these critical properties:

1. **budgetRespected**: LLM calls never exceed configured budget
2. **inventoryChecked**: Inventory verified before charging customer
3. **creditBeforePayment**: Credit validated before processing payment
4. **paymentBeforeFulfillment**: Payment confirmed before reserving stock
5. **retriesBounded**: Tool retries limited to prevent infinite loops
6. **escalationHasReason**: All escalations have documented reasons

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
Order Agent MBT
  Path Exploration
    ✓ should explore all paths through the order agent machine
    ✓ should find the happy path (all tools succeed)
    ✓ should find escalation paths
    ✓ should find retry paths
  Invariant Checking
    ✓ should verify LLM budget is never exceeded
    ✓ should verify payment always comes before fulfillment
    ✓ should verify inventory is always checked before payment
    ✓ should verify tool retries are bounded
    ✓ should verify escalations have reasons
    ✓ should verify all invariants together
```

## Project Structure

```
order-agent/
├── db/
│   └── schema.cds               # E-commerce data model
├── srv/
│   ├── order.cds                # Service definition with @agent
│   └── order.js                 # Agent implementation
├── test/
│   └── mbt/
│       ├── machines/
│       │   └── order-agent.machine.js   # Agent state machine
│       ├── invariants/
│       │   └── order-agent.invariants.js # Business rule invariants
│       └── order-agent.mbt.test.js       # MBT test suite
├── package.json
└── README.md
```

## Service API

### Agent Actions (with @agent annotation)

- `createOrder(customerId, items)` - Create order with inventory check
- `processPayment(orderId, paymentMethod)` - Process payment with credit validation
- `fulfillOrder(orderId)` - Reserve inventory and prepare shipping

### Tool Functions

- `checkInventory(productId, quantity)` - Verify stock availability
- `validateCustomerCredit(customerId, amount)` - Check credit limit
- `reserveInventory(productId, quantity, orderId)` - Reserve stock

### Supporting Actions

- `cancelOrder(orderId, reason)` - Cancel and refund if needed
- `getAgentStatus(sessionId)` - Check agent processing status

## Key Implementation Patterns

### State Machine with Tool Ordering

```javascript
// Guards enforce tool execution order
needsCreditValidation: ({ context }) => 
  context.toolResults['checkInventory'] === 'success' &&
  context.toolResults['validateCredit'] !== 'success',

needsPaymentProcessing: ({ context }) => 
  context.toolResults['checkInventory'] === 'success' &&
  context.toolResults['validateCredit'] === 'success' &&
  context.toolResults['processPayment'] !== 'success',
```

### Budget Management

```javascript
// Context tracks LLM usage
context: {
  llmCallsUsed: 0,
  llmCallsBudget: 10,
  // ...
}

// Guard prevents over-budget operations
budgetExhausted: ({ context }) => 
  context.llmCallsUsed >= context.llmCallsBudget,
```

### Business Rule Invariant

```javascript
const paymentBeforeFulfillment = createInvariant({
  name: 'paymentBeforeFulfillment',
  description: 'Payment must be processed before inventory is reserved',
  check: (context, state) => {
    if (state === 'reservingInventory') {
      return {
        passed: context.toolResults['processPayment'] === 'success',
        message: 'Attempting to reserve inventory without payment'
      };
    }
    return { passed: true };
  }
});
```

## Extending This Example

### Add New Tools

1. Add tool function to `order.cds`
2. Add tool state to machine
3. Update `requiredTools` if needed
4. Add transition guards
5. Run MBT to verify no violations

### Add New Business Rules

```javascript
const myRule = createInvariant({
  name: 'myBusinessRule',
  description: 'Description of the rule',
  check: (context, state) => {
    // Verify rule holds
    return { passed: true/false, message: '...' };
  }
});
```

## Why MBT for Agents?

Traditional tests verify specific scenarios. MBT exhaustively explores ALL possible paths, including:

- What happens if inventory check fails after credit approval?
- Can the agent reach "completed" without processing payment?
- Does budget exhaustion always lead to proper escalation?
- Are all tool retry combinations properly bounded?

This catches subtle orchestration bugs before they affect customers.
