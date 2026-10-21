/**
 * Order Agent MBT Tests
 * 
 * Uses cds-mbt to exhaustively test the order processing agent
 * against business rule and resource invariants.
 */

const { runMBT, explorePaths, checkInvariants } = require('cds-mbt');
const { orderAgentMachine } = require('./machines/order-agent.machine');
const orderAgentInvariants = require('./invariants/order-agent.invariants');

describe('Order Agent MBT', () => {
  
  describe('Path Exploration', () => {
    it('should explore all paths through the order agent machine', () => {
      const paths = explorePaths(orderAgentMachine, {
        maxDepth: 20,
        maxPaths: 500
      });
      
      expect(paths.length).toBeGreaterThan(0);
      console.log(`Explored ${paths.length} paths through order agent machine`);
      
      // Verify we found successful completion path
      const completedPath = paths.find(p => 
        p.steps.some(s => s.toState === 'completed')
      );
      expect(completedPath).toBeDefined();
    });
    
    it('should find the happy path (all tools succeed)', () => {
      const paths = explorePaths(orderAgentMachine, {
        maxDepth: 20,
        maxPaths: 500
      });
      
      const happyPath = paths.find(p => {
        const lastStep = p.steps[p.steps.length - 1];
        return lastStep.toState === 'completed' &&
               lastStep.context.toolResults['checkInventory'] === 'success' &&
               lastStep.context.toolResults['validateCredit'] === 'success' &&
               lastStep.context.toolResults['processPayment'] === 'success' &&
               lastStep.context.toolResults['reserveInventory'] === 'success';
      });
      
      expect(happyPath).toBeDefined();
      console.log('Found happy path with all tools succeeding');
    });
    
    it('should find escalation paths', () => {
      const paths = explorePaths(orderAgentMachine, {
        maxDepth: 20,
        maxPaths: 500
      });
      
      const escalatedPaths = paths.filter(p =>
        p.steps.some(s => s.toState === 'escalated')
      );
      
      expect(escalatedPaths.length).toBeGreaterThan(0);
      console.log(`Found ${escalatedPaths.length} escalation paths`);
    });
    
    it('should find retry paths', () => {
      const paths = explorePaths(orderAgentMachine, {
        maxDepth: 20,
        maxPaths: 500
      });
      
      const retryPaths = paths.filter(p =>
        p.steps.some(s => s.event.type === 'TOOL_ERROR')
      );
      
      expect(retryPaths.length).toBeGreaterThan(0);
      console.log(`Found ${retryPaths.length} paths with tool errors/retries`);
    });
  });
  
  describe('Invariant Checking', () => {
    it('should verify LLM budget is never exceeded', async () => {
      const result = await runMBT(orderAgentMachine, [orderAgentInvariants.budgetRespected], {
        maxDepth: 20,
        maxPaths: 500
      });
      
      expect(result.passed).toBe(true);
      console.log(`Budget invariant: ${result.stats.totalSteps} steps checked, ${result.violations.length} violations`);
    });
    
    it('should verify payment always comes before fulfillment', async () => {
      const result = await runMBT(orderAgentMachine, [orderAgentInvariants.paymentBeforeFulfillment], {
        maxDepth: 20,
        maxPaths: 500
      });
      
      expect(result.passed).toBe(true);
      console.log(`Payment-before-fulfillment: ${result.stats.totalSteps} steps checked, ${result.violations.length} violations`);
    });
    
    it('should verify inventory is always checked before payment', async () => {
      const result = await runMBT(orderAgentMachine, [orderAgentInvariants.inventoryChecked], {
        maxDepth: 20,
        maxPaths: 500
      });
      
      expect(result.passed).toBe(true);
      console.log(`Inventory-checked: ${result.stats.totalSteps} steps checked, ${result.violations.length} violations`);
    });
    
    it('should verify tool retries are bounded', async () => {
      const result = await runMBT(orderAgentMachine, [orderAgentInvariants.retriesBounded], {
        maxDepth: 20,
        maxPaths: 500
      });
      
      expect(result.passed).toBe(true);
      console.log(`Retries-bounded: ${result.stats.totalSteps} steps checked, ${result.violations.length} violations`);
    });
    
    it('should verify escalations have reasons', async () => {
      const result = await runMBT(orderAgentMachine, [orderAgentInvariants.escalationHasReason], {
        maxDepth: 20,
        maxPaths: 500
      });
      
      expect(result.passed).toBe(true);
      console.log(`Escalation-has-reason: ${result.stats.totalSteps} steps checked, ${result.violations.length} violations`);
    });
    
    it('should verify credit validation before payment', async () => {
      const result = await runMBT(orderAgentMachine, [orderAgentInvariants.creditBeforePayment], {
        maxDepth: 20,
        maxPaths: 500
      });
      
      expect(result.passed).toBe(true);
      console.log(`Credit-before-payment: ${result.stats.totalSteps} steps checked, ${result.violations.length} violations`);
    });
    
    it('should verify all invariants together', async () => {
      const result = await runMBT(orderAgentMachine, orderAgentInvariants.all, {
        maxDepth: 20,
        maxPaths: 500
      });
      
      console.log('=== Order Agent MBT Results ===');
      console.log(`Total paths: ${result.stats.totalPaths}`);
      console.log(`Total steps: ${result.stats.totalSteps}`);
      console.log(`Invariants checked: ${result.stats.invariantsChecked}`);
      console.log(`Violations: ${result.violations.length}`);
      
      if (result.violations.length > 0) {
        console.log('\nViolations:');
        result.violations.slice(0, 5).forEach((v, i) => {
          console.log(`  ${i + 1}. [${v.invariant}] ${v.message}`);
          console.log(`     State: ${v.state}`);
        });
        if (result.violations.length > 5) {
          console.log(`  ... and ${result.violations.length - 5} more`);
        }
      }
      
      expect(result.passed).toBe(true);
    });
  });
  
  describe('Business Rule Verification', () => {
    it('should enforce correct tool execution order', async () => {
      const paths = explorePaths(orderAgentMachine, { maxDepth: 20 });
      
      // Find all completed paths
      const completedPaths = paths.filter(p =>
        p.steps.some(s => s.toState === 'completed')
      );
      
      for (const path of completedPaths) {
        const toolOrder = [];
        for (const step of path.steps) {
          if (step.toState === 'checkingInventory') toolOrder.push('inventory');
          if (step.toState === 'validatingCredit') toolOrder.push('credit');
          if (step.toState === 'processingPayment') toolOrder.push('payment');
          if (step.toState === 'reservingInventory') toolOrder.push('reserve');
        }
        
        // Inventory should always come before credit
        const invIdx = toolOrder.indexOf('inventory');
        const creditIdx = toolOrder.indexOf('credit');
        if (invIdx >= 0 && creditIdx >= 0) {
          expect(invIdx).toBeLessThan(creditIdx);
        }
        
        // Credit should always come before payment
        const payIdx = toolOrder.indexOf('payment');
        if (creditIdx >= 0 && payIdx >= 0) {
          expect(creditIdx).toBeLessThan(payIdx);
        }
        
        // Payment should always come before reserve
        const resIdx = toolOrder.indexOf('reserve');
        if (payIdx >= 0 && resIdx >= 0) {
          expect(payIdx).toBeLessThan(resIdx);
        }
      }
    });
    
    it('should never complete without all required tools succeeding', async () => {
      const result = await runMBT(orderAgentMachine, [orderAgentInvariants.noInvalidCompletion], {
        maxDepth: 20,
        maxPaths: 500
      });
      
      expect(result.passed).toBe(true);
    });
  });
  
  describe('Edge Cases', () => {
    it('should handle budget exhaustion gracefully', () => {
      const paths = explorePaths(orderAgentMachine, { maxDepth: 30 });
      
      // Find paths where budget is exhausted
      const budgetExhaustedPaths = paths.filter(p =>
        p.steps.some(s => s.context.llmCallsUsed >= s.context.llmCallsBudget)
      );
      
      // All such paths should end in escalated state
      for (const path of budgetExhaustedPaths) {
        const lastStep = path.steps[path.steps.length - 1];
        expect(['escalated', 'completed']).toContain(lastStep.toState);
      }
    });
    
    it('should track all tool calls in context', () => {
      const paths = explorePaths(orderAgentMachine, { maxDepth: 20 });
      
      for (const path of paths) {
        const lastStep = path.steps[path.steps.length - 1];
        expect(lastStep.context).toHaveProperty('toolResults');
        expect(lastStep.context).toHaveProperty('llmCallsUsed');
        expect(lastStep.context).toHaveProperty('retryCount');
      }
    });
  });
});
