/**
 * MBT Tests for Workflow Orchestration
 * 
 * This template provides a starting point for testing multi-step workflows
 * using model-based testing. Copy this file to your test/mbt/ directory
 * and customize for your specific workflow.
 * 
 * @example
 * // Run tests with: npx jest test/mbt/workflow.mbt.test.js
 * // Or with cds: cds mbt run
 */

const { runMBT, invariants } = require('cds-mbt');
const workflowMachine = require('./machines/workflow.machine');
const customInvariants = require('./invariants/workflow.invariants');

describe('Workflow Orchestration MBT', () => {
  
  /**
   * Test that step order is maintained
   */
  it('maintains step order across all paths', async () => {
    const result = await runMBT(workflowMachine, [
      customInvariants.stepOrderMaintained
    ]);
    
    console.log(`Explored ${result.stats.totalPaths} paths`);
    expect(result.violations).toHaveLength(0);
  });

  /**
   * Test that required steps are not skipped
   */
  it('does not skip required steps', async () => {
    const result = await runMBT(workflowMachine, [
      customInvariants.noSkippedRequiredSteps
    ]);
    
    expect(result.violations).toHaveLength(0);
  });

  /**
   * Test that approval is enforced when required
   */
  it('enforces approval when required', async () => {
    const result = await runMBT(workflowMachine, [
      customInvariants.approvalRequired
    ]);
    
    expect(result.violations).toHaveLength(0);
  });

  /**
   * Test that failures have documented reasons
   */
  it('always has failure reason', async () => {
    const result = await runMBT(workflowMachine, [
      customInvariants.failureHasReason
    ]);
    
    expect(result.violations).toHaveLength(0);
  });

  /**
   * Test all workflow invariants together
   */
  it('passes all workflow invariants', async () => {
    const result = await runMBT(workflowMachine, customInvariants.all);
    
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
   * Test edge cases with custom workflow configurations
   */
  describe('edge cases', () => {
    it('handles workflow with no required steps', async () => {
      const { createWorkflowMachine } = require('cds-mbt');
      const flexibleWorkflow = createWorkflowMachine({
        steps: ['optional1', 'optional2'],
        requireApproval: false
      });

      const result = await runMBT(flexibleWorkflow, customInvariants.all);
      expect(result.violations).toHaveLength(0);
    });

    it('handles single-step workflow', async () => {
      const { createWorkflowMachine } = require('cds-mbt');
      const singleStepWorkflow = createWorkflowMachine({
        steps: ['onlyStep'],
        requireApproval: true
      });

      const result = await runMBT(singleStepWorkflow, [
        customInvariants.stepOrderMaintained,
        customInvariants.approvalRequired
      ]);

      expect(result.violations).toHaveLength(0);
    });

    it('handles workflow with all steps required', async () => {
      const { createWorkflowMachine } = require('cds-mbt');
      const strictWorkflow = createWorkflowMachine({
        steps: ['step1', 'step2', 'step3'],
        requireApproval: true
      });

      const result = await runMBT(strictWorkflow, customInvariants.all);
      expect(result.violations).toHaveLength(0);
    });
  });

  /**
   * Test retry behavior
   */
  describe('retry behavior', () => {
    it('respects max retries per step', async () => {
      const result = await runMBT(workflowMachine, [
        invariants.retriesBounded
      ]);

      expect(result.violations).toHaveLength(0);
    });
  });
});
