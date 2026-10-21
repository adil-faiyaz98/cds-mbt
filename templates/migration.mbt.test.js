/**
 * MBT Tests for Data Migration
 * 
 * This template provides a starting point for testing data migration workflows
 * using model-based testing. Copy this file to your test/mbt/ directory
 * and customize for your specific migration patterns.
 * 
 * @example
 * // Run tests with: npx jest test/mbt/migration.mbt.test.js
 * // Or with cds: cds mbt run
 */

const { runMBT, invariants } = require('cds-mbt');
const migrationMachine = require('./machines/migration.machine');
const customInvariants = require('./invariants/migration.invariants');

describe('Data Migration MBT', () => {
  
  /**
   * Test that data is consistent between source and target
   */
  it('maintains data consistency across all paths', async () => {
    const result = await runMBT(migrationMachine, [
      customInvariants.dataConsistent
    ]);
    
    console.log(`Explored ${result.stats.totalPaths} paths`);
    expect(result.violations).toHaveLength(0);
  });

  /**
   * Test that rollback is available until commit
   */
  it('maintains rollback availability until commit', async () => {
    const result = await runMBT(migrationMachine, [
      customInvariants.rollbackAvailable
    ]);
    
    expect(result.violations).toHaveLength(0);
  });

  /**
   * Test that no partial commits occur
   */
  it('prevents partial commits', async () => {
    const result = await runMBT(migrationMachine, [
      customInvariants.noPartialCommit
    ]);
    
    expect(result.violations).toHaveLength(0);
  });

  /**
   * Test that failures have documented reasons
   */
  it('always has failure reason', async () => {
    const result = await runMBT(migrationMachine, [
      customInvariants.failureHasReason
    ]);
    
    expect(result.violations).toHaveLength(0);
  });

  /**
   * Test all migration invariants together
   */
  it('passes all migration invariants', async () => {
    const result = await runMBT(migrationMachine, customInvariants.all);
    
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
   * Test built-in data integrity invariants
   */
  it('passes built-in data integrity invariants', async () => {
    const result = await runMBT(migrationMachine, [
      invariants.dataConsistent,
      invariants.rollbackAvailable
    ]);

    expect(result.violations).toHaveLength(0);
  });

  /**
   * Test edge cases with custom migration configurations
   */
  describe('edge cases', () => {
    it('handles migration with no verification', async () => {
      const { createMigrationMachine } = require('cds-mbt');
      const noVerifyMigration = createMigrationMachine({
        batchSize: 500,
        requireVerification: false
      });

      const result = await runMBT(noVerifyMigration, customInvariants.all);
      expect(result.violations).toHaveLength(0);
    });

    it('handles small batch migration', async () => {
      const { createMigrationMachine } = require('cds-mbt');
      const smallBatchMigration = createMigrationMachine({
        batchSize: 10,
        requireVerification: true
      });

      const result = await runMBT(smallBatchMigration, [
        customInvariants.dataConsistent,
        customInvariants.batchSizeRespected
      ]);

      expect(result.violations).toHaveLength(0);
    });

    it('handles large batch migration', async () => {
      const { createMigrationMachine } = require('cds-mbt');
      const largeBatchMigration = createMigrationMachine({
        batchSize: 10000,
        requireVerification: true
      });

      const result = await runMBT(largeBatchMigration, customInvariants.all);
      expect(result.violations).toHaveLength(0);
    });
  });

  /**
   * Test rollback scenarios
   */
  describe('rollback scenarios', () => {
    it('can rollback from any pre-commit state', async () => {
      const result = await runMBT(migrationMachine, [
        customInvariants.rollbackAvailable,
        customInvariants.noPartialCommit
      ]);

      expect(result.violations).toHaveLength(0);
    });
  });

  /**
   * Test ETL phase transitions
   */
  describe('ETL phases', () => {
    it('follows correct ETL sequence', async () => {
      const result = await runMBT(migrationMachine, customInvariants.all);

      // Check that paths follow extract -> transform -> load order
      result.stats.paths?.forEach(path => {
        const states = path.steps.map(s => s.toState);
        const extractIndex = states.indexOf('extracting');
        const transformIndex = states.indexOf('transforming');
        const loadIndex = states.indexOf('loading');

        if (transformIndex >= 0) {
          expect(extractIndex).toBeLessThan(transformIndex);
        }
        if (loadIndex >= 0 && transformIndex >= 0) {
          expect(transformIndex).toBeLessThan(loadIndex);
        }
      });

      expect(result.violations).toHaveLength(0);
    });
  });
});
