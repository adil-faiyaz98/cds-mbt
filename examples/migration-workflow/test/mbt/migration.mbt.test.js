/**
 * Migration Workflow MBT Tests
 * 
 * Uses cds-mbt to exhaustively test the migration state machine
 * against data integrity invariants.
 */

const { runMBT, explorePaths, checkInvariants } = require('cds-mbt');
const { migrationMachine } = require('./machines/migration.machine');
const migrationInvariants = require('./invariants/migration.invariants');

describe('Migration Workflow MBT', () => {
  
  describe('Path Exploration', () => {
    it('should explore all paths through the migration machine', () => {
      const paths = explorePaths(migrationMachine, {
        maxDepth: 15,
        maxPaths: 500
      });
      
      expect(paths.length).toBeGreaterThan(0);
      console.log(`Explored ${paths.length} paths through migration machine`);
      
      // Verify we found the main happy path
      const happyPath = paths.find(p => 
        p.steps.some(s => s.toState === 'completed')
      );
      expect(happyPath).toBeDefined();
    });
    
    it('should find rollback paths', () => {
      const paths = explorePaths(migrationMachine, {
        maxDepth: 15,
        maxPaths: 500
      });
      
      const rollbackPaths = paths.filter(p =>
        p.steps.some(s => s.toState === 'rollingBack')
      );
      
      expect(rollbackPaths.length).toBeGreaterThan(0);
      console.log(`Found ${rollbackPaths.length} paths involving rollback`);
    });
    
    it('should find error handling paths', () => {
      const paths = explorePaths(migrationMachine, {
        maxDepth: 15,
        maxPaths: 500
      });
      
      const failedPaths = paths.filter(p =>
        p.steps.some(s => s.toState === 'failed')
      );
      
      expect(failedPaths.length).toBeGreaterThan(0);
      console.log(`Found ${failedPaths.length} paths ending in failure`);
    });
  });
  
  describe('Invariant Checking', () => {
    it('should verify data consistency invariant across all paths', async () => {
      const result = await runMBT(migrationMachine, [migrationInvariants.dataConsistent], {
        maxDepth: 15,
        maxPaths: 500
      });
      
      expect(result.passed).toBe(true);
      console.log(`Data consistency: ${result.stats.totalSteps} steps checked, ${result.violations.length} violations`);
    });
    
    it('should verify rollback availability invariant', async () => {
      const result = await runMBT(migrationMachine, [migrationInvariants.rollbackAvailable], {
        maxDepth: 15,
        maxPaths: 500
      });
      
      expect(result.passed).toBe(true);
      console.log(`Rollback availability: ${result.stats.totalSteps} steps checked, ${result.violations.length} violations`);
    });
    
    it('should verify no partial commit invariant', async () => {
      const result = await runMBT(migrationMachine, [migrationInvariants.noPartialCommit], {
        maxDepth: 15,
        maxPaths: 500
      });
      
      expect(result.passed).toBe(true);
      console.log(`No partial commit: ${result.stats.totalSteps} steps checked, ${result.violations.length} violations`);
    });
    
    it('should verify error documentation invariant', async () => {
      const result = await runMBT(migrationMachine, [migrationInvariants.errorDocumented], {
        maxDepth: 15,
        maxPaths: 500
      });
      
      expect(result.passed).toBe(true);
      console.log(`Error documentation: ${result.stats.totalSteps} steps checked, ${result.violations.length} violations`);
    });
    
    it('should verify all invariants together', async () => {
      const result = await runMBT(migrationMachine, migrationInvariants.all, {
        maxDepth: 15,
        maxPaths: 500
      });
      
      console.log('=== Migration MBT Results ===');
      console.log(`Total paths: ${result.stats.totalPaths}`);
      console.log(`Total steps: ${result.stats.totalSteps}`);
      console.log(`Invariants checked: ${result.stats.invariantsChecked}`);
      console.log(`Violations: ${result.violations.length}`);
      
      if (result.violations.length > 0) {
        console.log('\nViolations:');
        result.violations.forEach((v, i) => {
          console.log(`  ${i + 1}. [${v.invariant}] ${v.message}`);
          console.log(`     State: ${v.state}`);
        });
      }
      
      expect(result.passed).toBe(true);
    });
  });
  
  describe('Edge Cases', () => {
    it('should handle empty data migration', async () => {
      const paths = explorePaths(migrationMachine, { maxDepth: 10 });
      
      // Find path where NO_DATA is triggered
      const emptyDataPath = paths.find(p =>
        p.steps.some(s => s.event.type === 'NO_DATA')
      );
      
      expect(emptyDataPath).toBeDefined();
      
      // Should end in completed state
      const lastStep = emptyDataPath.steps[emptyDataPath.steps.length - 1];
      expect(lastStep.toState).toBe('completed');
    });
    
    it('should verify rollback clears target data', async () => {
      const paths = explorePaths(migrationMachine, { maxDepth: 15 });
      
      // Find paths that go through rollback
      const rollbackPaths = paths.filter(p =>
        p.steps.some(s => s.event.type === 'ROLLBACK_SUCCESS')
      );
      
      // Verify target count is 0 after rollback
      for (const path of rollbackPaths) {
        const afterRollback = path.steps.find(s => s.event.type === 'ROLLBACK_SUCCESS');
        if (afterRollback) {
          expect(afterRollback.context.targetCount).toBe(0);
        }
      }
    });
  });
});
