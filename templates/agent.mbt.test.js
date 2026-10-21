/**
 * MBT Tests for Agent Orchestration
 * 
 * This template provides a starting point for testing AI agent orchestration
 * using model-based testing. Copy this file to your test/mbt/ directory
 * and customize for your specific agent.
 * 
 * @example
 * // Run tests with: npx jest test/mbt/agent.mbt.test.js
 * // Or with cds: cds mbt run
 */

const { runMBT, invariants } = require('cds-mbt');
const agentMachine = require('./machines/agent-orchestrator.machine');
const customInvariants = require('./invariants/agent.invariants');

describe('Agent Orchestration MBT', () => {
  
  /**
   * Test that LLM budget is never exceeded
   */
  it('respects budget across all paths', async () => {
    const result = await runMBT(agentMachine, [
      invariants.budgetRespected
    ]);
    
    console.log(`Explored ${result.stats.totalPaths} paths`);
    expect(result.violations).toHaveLength(0);
  });

  /**
   * Test that retry limits are respected
   */
  it('bounds retries across all paths', async () => {
    const result = await runMBT(agentMachine, [
      invariants.retriesBounded
    ]);
    
    expect(result.violations).toHaveLength(0);
  });

  /**
   * Test that completion requires all tools to succeed
   */
  it('never completes with failed tools', async () => {
    const result = await runMBT(agentMachine, [
      invariants.noInvalidCompletion
    ]);
    
    expect(result.violations).toHaveLength(0);
  });

  /**
   * Test that escalation always has a reason
   */
  it('always has escalation reason', async () => {
    const result = await runMBT(agentMachine, [
      invariants.escalationHasReason
    ]);
    
    expect(result.violations).toHaveLength(0);
  });

  /**
   * Test all built-in agent invariants together
   */
  it('passes all agent invariants', async () => {
    const result = await runMBT(agentMachine, invariants.all);
    
    if (result.violations.length > 0) {
      console.log('Violations found:');
      result.violations.forEach(v => {
        console.log(`  - ${v.invariant}: ${v.message}`);
        console.log(`    Path: ${v.path}`);
      });
    }
    
    expect(result.passed).toBe(true);
  });

  /**
   * Test custom project-specific invariants
   */
  it('passes custom invariants', async () => {
    const result = await runMBT(agentMachine, customInvariants.all);
    
    expect(result.violations).toHaveLength(0);
  });

  /**
   * Test edge cases with a custom machine configuration
   */
  describe('edge cases', () => {
    it('handles zero budget gracefully', async () => {
      const { createAgentMachine } = require('cds-mbt');
      const zeroBudgetMachine = createAgentMachine({
        llmBudget: 0,
        requiredTools: ['tool1']
      });

      const result = await runMBT(zeroBudgetMachine, [
        invariants.budgetRespected,
        invariants.escalationHasReason
      ]);

      // Should escalate immediately due to no budget
      expect(result.violations).toHaveLength(0);
    });

    it('handles no required tools', async () => {
      const { createAgentMachine } = require('cds-mbt');
      const noToolsMachine = createAgentMachine({
        llmBudget: 5,
        requiredTools: []
      });

      const result = await runMBT(noToolsMachine, [
        invariants.noInvalidCompletion
      ]);

      expect(result.violations).toHaveLength(0);
    });
  });
});
