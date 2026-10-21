/**
 * Migration Service Implementation
 * 
 * Implements data migration workflow with:
 * - Extract: Read data from legacy source
 * - Transform: Convert to target format
 * - Load: Insert into target system
 * - Verify: Ensure data consistency
 * - Commit/Rollback: Make permanent or revert
 */

const cds = require('@sap/cds');

class MigrationService extends cds.ApplicationService {
  
  async init() {
    await super.init();
    
    const { Products, MigrationLog, MigrationSource } = this.entities;
    
    /**
     * Start a new migration batch
     */
    this.on('startMigration', async (req) => {
      const { batchSize = 100 } = req.data;
      const tx = cds.tx(req);
      
      try {
        // Create migration log entry
        const migrationId = cds.utils.uuid();
        const batchNumber = await this._getNextBatchNumber(tx, MigrationLog);
        
        await tx.run(INSERT.into(MigrationLog).entries({
          ID: migrationId,
          batchNumber,
          status: 'extracting',
          sourceCount: 0,
          targetCount: 0,
          processedCount: 0
        }));
        
        // Extract phase - get source data
        const sourceData = await tx.run(
          SELECT.from(MigrationSource).limit(batchSize)
        );
        
        if (sourceData.length === 0) {
          await this._updateMigrationStatus(tx, MigrationLog, migrationId, 'completed', {
            sourceCount: 0,
            message: 'No source data to migrate'
          });
          return {
            migrationId,
            status: 'completed',
            message: 'No source data to migrate'
          };
        }
        
        await this._updateMigrationStatus(tx, MigrationLog, migrationId, 'transforming', {
          sourceCount: sourceData.length,
          rollbackData: JSON.stringify({ sourceIds: sourceData.map(s => s.legacyId) })
        });
        
        // Transform phase
        const transformedData = await this._transformData(sourceData);
        
        await this._updateMigrationStatus(tx, MigrationLog, migrationId, 'loading');
        
        // Load phase
        const insertedIds = [];
        for (const record of transformedData) {
          const id = cds.utils.uuid();
          await tx.run(INSERT.into(Products).entries({
            ID: id,
            ...record,
            migratedAt: new Date().toISOString(),
            status: 'migrated'
          }));
          insertedIds.push(id);
        }
        
        // Update rollback data with inserted IDs
        await this._updateMigrationStatus(tx, MigrationLog, migrationId, 'verifying', {
          targetCount: insertedIds.length,
          processedCount: insertedIds.length,
          rollbackData: JSON.stringify({
            sourceIds: sourceData.map(s => s.legacyId),
            targetIds: insertedIds
          })
        });
        
        return {
          migrationId,
          status: 'verifying',
          message: `Processed ${insertedIds.length} records, awaiting verification`
        };
        
      } catch (error) {
        return {
          migrationId: null,
          status: 'failed',
          message: `Migration failed: ${error.message}`
        };
      }
    });
    
    /**
     * Check migration status
     */
    this.on('checkStatus', async (req) => {
      const { migrationId } = req.data;
      const tx = cds.tx(req);
      
      const log = await tx.run(
        SELECT.one.from(MigrationLog).where({ ID: migrationId })
      );
      
      if (!log) {
        return {
          status: 'not_found',
          sourceCount: 0,
          targetCount: 0,
          processedCount: 0,
          canRollback: false
        };
      }
      
      return {
        status: log.status,
        sourceCount: log.sourceCount,
        targetCount: log.targetCount,
        processedCount: log.processedCount,
        canRollback: log.status !== 'committed' && log.status !== 'rolledBack' && log.rollbackData !== null
      };
    });
    
    /**
     * Rollback a migration batch
     */
    this.on('rollback', async (req) => {
      const { migrationId } = req.data;
      const tx = cds.tx(req);
      
      const log = await tx.run(
        SELECT.one.from(MigrationLog).where({ ID: migrationId })
      );
      
      if (!log) {
        return { success: false, message: 'Migration not found', recordsReverted: 0 };
      }
      
      if (log.status === 'committed') {
        return { success: false, message: 'Cannot rollback committed migration', recordsReverted: 0 };
      }
      
      if (log.status === 'rolledBack') {
        return { success: false, message: 'Migration already rolled back', recordsReverted: 0 };
      }
      
      if (!log.rollbackData) {
        return { success: false, message: 'No rollback data available', recordsReverted: 0 };
      }
      
      try {
        const rollbackInfo = JSON.parse(log.rollbackData);
        let recordsReverted = 0;
        
        // Delete inserted target records
        if (rollbackInfo.targetIds && rollbackInfo.targetIds.length > 0) {
          for (const id of rollbackInfo.targetIds) {
            await tx.run(DELETE.from(Products).where({ ID: id }));
            recordsReverted++;
          }
        }
        
        await this._updateMigrationStatus(tx, MigrationLog, migrationId, 'rolledBack', {
          rollbackData: null,
          errorMessage: 'Rolled back by user request'
        });
        
        return {
          success: true,
          message: 'Rollback completed successfully',
          recordsReverted
        };
        
      } catch (error) {
        await this._updateMigrationStatus(tx, MigrationLog, migrationId, 'failed', {
          errorMessage: `Rollback failed: ${error.message}`
        });
        
        return {
          success: false,
          message: `Rollback failed: ${error.message}`,
          recordsReverted: 0
        };
      }
    });
    
    /**
     * Commit migration (makes it permanent)
     */
    this.on('commitMigration', async (req) => {
      const { migrationId } = req.data;
      const tx = cds.tx(req);
      
      const log = await tx.run(
        SELECT.one.from(MigrationLog).where({ ID: migrationId })
      );
      
      if (!log) {
        return { success: false, message: 'Migration not found' };
      }
      
      if (log.status === 'committed') {
        return { success: true, message: 'Migration already committed' };
      }
      
      if (log.status === 'rolledBack' || log.status === 'failed') {
        return { success: false, message: `Cannot commit migration in ${log.status} status` };
      }
      
      // Update migrated products to verified status
      const rollbackInfo = log.rollbackData ? JSON.parse(log.rollbackData) : {};
      if (rollbackInfo.targetIds) {
        for (const id of rollbackInfo.targetIds) {
          await tx.run(UPDATE(Products).where({ ID: id }).set({ status: 'verified' }));
        }
      }
      
      await this._updateMigrationStatus(tx, MigrationLog, migrationId, 'committed', {
        rollbackData: null // Clear rollback data on commit
      });
      
      return { success: true, message: 'Migration committed successfully' };
    });
    
    /**
     * Verify migration data consistency
     */
    this.on('verifyMigration', async (req) => {
      const { migrationId } = req.data;
      const tx = cds.tx(req);
      
      const log = await tx.run(
        SELECT.one.from(MigrationLog).where({ ID: migrationId })
      );
      
      if (!log) {
        return {
          consistent: false,
          sourceCount: 0,
          targetCount: 0,
          discrepancies: ['Migration not found']
        };
      }
      
      const discrepancies = [];
      
      // Check counts match
      if (log.sourceCount !== log.targetCount) {
        discrepancies.push(`Count mismatch: source=${log.sourceCount}, target=${log.targetCount}`);
      }
      
      // Verify all records exist in target
      if (log.rollbackData) {
        const rollbackInfo = JSON.parse(log.rollbackData);
        if (rollbackInfo.targetIds) {
          for (const id of rollbackInfo.targetIds) {
            const exists = await tx.run(SELECT.one.from(Products).where({ ID: id }));
            if (!exists) {
              discrepancies.push(`Missing target record: ${id}`);
            }
          }
        }
      }
      
      return {
        consistent: discrepancies.length === 0,
        sourceCount: log.sourceCount,
        targetCount: log.targetCount,
        discrepancies
      };
    });
  }
  
  /**
   * Transform source data to target format
   */
  async _transformData(sourceData) {
    return sourceData.map(source => ({
      name: source.productName,
      description: source.productDesc,
      price: source.unitPrice,
      currency: source.currencyCode || 'USD',
      category: source.productCategory,
      legacyId: source.legacyId
    }));
  }
  
  /**
   * Get next batch number
   */
  async _getNextBatchNumber(tx, MigrationLog) {
    const result = await tx.run(
      SELECT.one.from(MigrationLog).columns('max(batchNumber) as maxBatch')
    );
    return (result?.maxBatch || 0) + 1;
  }
  
  /**
   * Update migration status
   */
  async _updateMigrationStatus(tx, MigrationLog, migrationId, status, updates = {}) {
    await tx.run(
      UPDATE(MigrationLog).where({ ID: migrationId }).set({
        status,
        ...updates
      })
    );
  }
}

module.exports = MigrationService;
