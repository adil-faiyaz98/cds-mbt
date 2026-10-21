/**
 * Data Migration Schema
 * 
 * Defines the data model for a product migration workflow
 * with audit logging for tracking migration status.
 */

namespace migration;

/**
 * Products entity - the data being migrated
 */
entity Products {
  key ID : UUID;
  name : String(100) @mandatory;
  description : String(500);
  price : Decimal(10, 2) @mandatory;
  currency : String(3) default 'USD';
  category : String(50);
  legacyId : String(50); // Reference to source system
  migratedAt : Timestamp;
  status : String(20) default 'pending'; // pending, migrated, verified, failed
}

/**
 * MigrationLog - tracks migration batches and their status
 */
entity MigrationLog {
  key ID : UUID;
  timestamp : Timestamp default $now;
  batchNumber : Integer;
  status : String(20); // extracting, transforming, loading, verifying, committed, rolledBack, failed
  sourceCount : Integer default 0;
  targetCount : Integer default 0;
  processedCount : Integer default 0;
  errorMessage : String(500);
  rollbackData : LargeString; // JSON serialized rollback information
}

/**
 * MigrationSource - simulates source data from legacy system
 */
entity MigrationSource {
  key legacyId : String(50);
  productName : String(100);
  productDesc : String(500);
  unitPrice : Decimal(10, 2);
  currencyCode : String(3);
  productCategory : String(50);
}
