/**
 * E-commerce Data Model
 * 
 * Defines entities for an order processing agent:
 * - Customers with addresses
 * - Products with inventory
 * - Orders with line items
 * - Payment transactions
 */

namespace ecommerce;

/**
 * Customer entity
 */
entity Customers {
  key ID : UUID;
  email : String(100) @mandatory;
  name : String(100);
  tier : String(20) default 'standard'; // standard, premium, vip
  creditLimit : Decimal(12, 2) default 1000.00;
  currentBalance : Decimal(12, 2) default 0.00;
}

/**
 * Product entity with inventory tracking
 */
entity Products {
  key ID : UUID;
  sku : String(50) @mandatory;
  name : String(100) @mandatory;
  description : String(500);
  price : Decimal(10, 2) @mandatory;
  stockQuantity : Integer default 0;
  reservedQuantity : Integer default 0; // Reserved but not yet fulfilled
  reorderThreshold : Integer default 10;
  category : String(50);
}

/**
 * Order entity
 */
entity Orders {
  key ID : UUID;
  orderNumber : String(20);
  customer : Association to Customers;
  status : String(20) default 'pending';
  // Status: pending, inventoryChecked, paymentProcessed, fulfilled, completed, cancelled, failed
  totalAmount : Decimal(12, 2);
  createdAt : Timestamp default $now;
  updatedAt : Timestamp;
  agentSessionId : String(50); // For tracking agent interactions
  errorReason : String(500);
}

/**
 * Order line items
 */
entity OrderItems {
  key ID : UUID;
  order : Association to Orders;
  product : Association to Products;
  quantity : Integer @mandatory;
  unitPrice : Decimal(10, 2);
  lineTotal : Decimal(12, 2);
}

/**
 * Payment transactions
 */
entity Payments {
  key ID : UUID;
  order : Association to Orders;
  amount : Decimal(12, 2) @mandatory;
  method : String(20); // credit_card, debit, paypal, invoice
  status : String(20) default 'pending'; // pending, authorized, captured, failed, refunded
  transactionId : String(50);
  processedAt : Timestamp;
  errorMessage : String(200);
}

/**
 * Agent audit log
 */
entity AgentLog {
  key ID : UUID;
  sessionId : String(50);
  timestamp : Timestamp default $now;
  action : String(50); // think, observe, act, tool_call, escalate
  toolName : String(50);
  input : LargeString;
  output : LargeString;
  llmTokensUsed : Integer default 0;
}
