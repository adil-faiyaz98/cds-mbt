/**
 * Migration Service Definition
 * 
 * Exposes actions for data migration with rollback capability.
 * Demonstrates ETL (Extract-Transform-Load) workflow pattern.
 */

using { migration } from '../db/schema';

service MigrationService @(path: '/migration') {
  
  /**
   * View of products being migrated
   */
  @readonly
  entity Products as projection on migration.Products;
  
  /**
   * View of migration logs for auditing
   */
  @readonly
  entity MigrationLog as projection on migration.MigrationLog;
  
  /**
   * View of source data (legacy system simulation)
   */
  @readonly
  entity MigrationSource as projection on migration.MigrationSource;
  
  /**
   * Start a new migration batch
   * @returns Migration batch ID and initial status
   */
  action startMigration(
    batchSize : Integer default 100
  ) returns {
    migrationId : UUID;
    status : String;
    message : String;
  };
  
  /**
   * Check the status of a migration
   * @param migrationId - The migration batch ID to check
   * @returns Current status and counts
   */
  function checkStatus(
    migrationId : UUID @mandatory
  ) returns {
    status : String;
    sourceCount : Integer;
    targetCount : Integer;
    processedCount : Integer;
    canRollback : Boolean;
  };
  
  /**
   * Execute rollback for a migration batch
   * @param migrationId - The migration batch ID to rollback
   * @returns Rollback result
   */
  action rollback(
    migrationId : UUID @mandatory
  ) returns {
    success : Boolean;
    message : String;
    recordsReverted : Integer;
  };
  
  /**
   * Commit the migration (makes it permanent)
   * @param migrationId - The migration batch ID to commit
   */
  action commitMigration(
    migrationId : UUID @mandatory
  ) returns {
    success : Boolean;
    message : String;
  };
  
  /**
   * Verify data consistency between source and target
   * @param migrationId - The migration batch ID to verify
   */
  function verifyMigration(
    migrationId : UUID @mandatory
  ) returns {
    consistent : Boolean;
    sourceCount : Integer;
    targetCount : Integer;
    discrepancies : array of String;
  };
}
