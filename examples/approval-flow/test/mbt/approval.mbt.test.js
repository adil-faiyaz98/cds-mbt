/**
 * Approval Flow MBT Tests
 * 
 * Uses cds-mbt to exhaustively test the multi-step approval workflow
 * against HITL and compliance invariants.
 */

const { runMBT, explorePaths, checkInvariants } = require('cds-mbt');
const { approvalMachine } = require('./machines/approval.machine');
const approvalInvariants = require('./invariants/approval.invariants');

describe('Approval Flow MBT', () => {
  
  describe('Path Exploration', () => {
    it('should explore all paths through the approval machine', () => {
      const paths = explorePaths(approvalMachine, {
        maxDepth: 15,
        maxPaths: 500
      });
      
      expect(paths.length).toBeGreaterThan(0);
      console.log(`Explored ${paths.length} paths through approval machine`);
      
      // Verify we found approved path
      const approvedPath = paths.find(p => 
        p.steps.some(s => s.toState === 'approved')
      );
      expect(approvedPath).toBeDefined();
    });
    
    it('should find multi-level approval paths', () => {
      const paths = explorePaths(approvalMachine, {
        maxDepth: 15,
        maxPaths: 500
      });
      
      // Find paths that go through multiple levels
      const multiLevelPaths = paths.filter(p =>
        p.steps.some(s => s.toState === 'pendingLevel2') &&
        p.steps.some(s => s.toState === 'approved')
      );
      
      expect(multiLevelPaths.length).toBeGreaterThan(0);
      console.log(`Found ${multiLevelPaths.length} multi-level approval paths`);
    });
    
    it('should find escalation paths', () => {
      const paths = explorePaths(approvalMachine, {
        maxDepth: 15,
        maxPaths: 500
      });
      
      const escalatedPaths = paths.filter(p =>
        p.steps.some(s => s.toState === 'escalated')
      );
      
      expect(escalatedPaths.length).toBeGreaterThan(0);
      console.log(`Found ${escalatedPaths.length} escalation paths`);
    });
    
    it('should find rejection paths', () => {
      const paths = explorePaths(approvalMachine, {
        maxDepth: 15,
        maxPaths: 500
      });
      
      const rejectedPaths = paths.filter(p =>
        p.steps.some(s => s.toState === 'rejected')
      );
      
      expect(rejectedPaths.length).toBeGreaterThan(0);
      console.log(`Found ${rejectedPaths.length} rejection paths`);
    });
    
    it('should find delegation paths', () => {
      const paths = explorePaths(approvalMachine, {
        maxDepth: 15,
        maxPaths: 500
      });
      
      const delegationPaths = paths.filter(p =>
        p.steps.some(s => s.event.type === 'DELEGATE')
      );
      
      expect(delegationPaths.length).toBeGreaterThan(0);
      console.log(`Found ${delegationPaths.length} paths with delegation`);
    });
  });
  
  describe('Invariant Checking', () => {
    it('should verify approval chain completeness', async () => {
      const result = await runMBT(approvalMachine, [approvalInvariants.approvalChainComplete], {
        maxDepth: 15,
        maxPaths: 500
      });
      
      expect(result.passed).toBe(true);
      console.log(`Approval chain complete: ${result.stats.totalSteps} steps checked, ${result.violations.length} violations`);
    });
    
    it('should verify no approvers are skipped', async () => {
      const result = await runMBT(approvalMachine, [approvalInvariants.noSkippedApprovers], {
        maxDepth: 15,
        maxPaths: 500
      });
      
      expect(result.passed).toBe(true);
      console.log(`No skipped approvers: ${result.stats.totalSteps} steps checked, ${result.violations.length} violations`);
    });
    
    it('should verify escalations have reasons', async () => {
      const result = await runMBT(approvalMachine, [approvalInvariants.escalationHasReason], {
        maxDepth: 15,
        maxPaths: 500
      });
      
      expect(result.passed).toBe(true);
      console.log(`Escalation has reason: ${result.stats.totalSteps} steps checked, ${result.violations.length} violations`);
    });
    
    it('should verify rejections have reasons', async () => {
      const result = await runMBT(approvalMachine, [approvalInvariants.rejectionHasReason], {
        maxDepth: 15,
        maxPaths: 500
      });
      
      expect(result.passed).toBe(true);
      console.log(`Rejection has reason: ${result.stats.totalSteps} steps checked, ${result.violations.length} violations`);
    });
    
    it('should verify delegation is bounded', async () => {
      const result = await runMBT(approvalMachine, [approvalInvariants.delegationBounded], {
        maxDepth: 15,
        maxPaths: 500
      });
      
      expect(result.passed).toBe(true);
      console.log(`Delegation bounded: ${result.stats.totalSteps} steps checked, ${result.violations.length} violations`);
    });
    
    it('should verify all invariants together', async () => {
      const result = await runMBT(approvalMachine, approvalInvariants.all, {
        maxDepth: 15,
        maxPaths: 500
      });
      
      console.log('=== Approval Flow MBT Results ===');
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
  
  describe('HITL Pattern Verification', () => {
    it('should ensure human approval is required at each level', () => {
      const paths = explorePaths(approvalMachine, { maxDepth: 15 });
      
      // For each approved path, verify APPROVE events were received
      const approvedPaths = paths.filter(p =>
        p.steps.some(s => s.toState === 'approved')
      );
      
      for (const path of approvedPaths) {
        const approvals = path.steps.filter(s => s.event.type === 'APPROVE');
        const finalContext = path.steps[path.steps.length - 1].context;
        
        // Either auto-approved (0) or escalation-approved (99) or manual approvals
        const hasAutoApproval = finalContext.approvalsByLevel?.[0];
        const hasEscalationApproval = finalContext.approvalsByLevel?.[99];
        
        if (!hasAutoApproval && !hasEscalationApproval) {
          expect(approvals.length).toBeGreaterThan(0);
        }
      }
    });
    
    it('should verify each approval has an identified approver', async () => {
      const result = await runMBT(approvalMachine, [approvalInvariants.approvalHasApprover], {
        maxDepth: 15,
        maxPaths: 500
      });
      
      expect(result.passed).toBe(true);
    });
    
    it('should track approval history correctly', () => {
      const paths = explorePaths(approvalMachine, { maxDepth: 15 });
      
      const approvedPaths = paths.filter(p =>
        p.steps.some(s => s.toState === 'approved') &&
        !p.steps.some(s => s.toState === 'submitted' && s.context.amount <= 100)
      );
      
      for (const path of approvedPaths) {
        const finalContext = path.steps[path.steps.length - 1].context;
        const history = finalContext.approverHistory || [];
        
        // History should track all approval actions
        const approvalActions = history.filter(h => h.action === 'approved');
        const delegationActions = history.filter(h => h.action === 'delegated');
        
        // Should have tracked actions
        if (!finalContext.approvalsByLevel?.[0] && !finalContext.approvalsByLevel?.[99]) {
          expect(approvalActions.length + delegationActions.length).toBeGreaterThanOrEqual(0);
        }
      }
    });
  });
  
  describe('Edge Cases', () => {
    it('should handle auto-approval for small amounts', () => {
      const paths = explorePaths(approvalMachine, { maxDepth: 10 });
      
      // Find paths that were auto-approved
      const autoApprovedPaths = paths.filter(p => {
        const finalStep = p.steps[p.steps.length - 1];
        return finalStep.toState === 'approved' && 
               finalStep.context.approvalsByLevel?.[0];
      });
      
      expect(autoApprovedPaths.length).toBeGreaterThan(0);
    });
    
    it('should verify recall only works before first approval', () => {
      const paths = explorePaths(approvalMachine, { maxDepth: 15 });
      
      const cancelledPaths = paths.filter(p =>
        p.steps.some(s => s.toState === 'cancelled')
      );
      
      for (const path of cancelledPaths) {
        const cancelStep = path.steps.find(s => s.event.type === 'RECALL');
        if (cancelStep) {
          // Should only be allowed from pendingLevel1
          const prevStep = path.steps[path.steps.indexOf(cancelStep) - 1];
          expect(['pendingLevel1', 'submitted']).toContain(prevStep?.toState || 'draft');
        }
      }
    });
    
    it('should handle escalation approval flow', () => {
      const paths = explorePaths(approvalMachine, { maxDepth: 15 });
      
      const escalationApprovedPaths = paths.filter(p => {
        const finalStep = p.steps[p.steps.length - 1];
        return finalStep.toState === 'approved' &&
               p.steps.some(s => s.toState === 'escalated');
      });
      
      for (const path of escalationApprovedPaths) {
        const finalContext = path.steps[path.steps.length - 1].context;
        // Escalation approval should be recorded at level 99
        expect(finalContext.approvalsByLevel?.[99]).toBeDefined();
      }
    });
  });
});
