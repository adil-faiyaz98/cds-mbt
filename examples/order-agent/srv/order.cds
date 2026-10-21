/**
 * Order Service Definition
 * 
 * AI-powered order processing service using ReAct (Reason + Act) pattern.
 * Demonstrates agent orchestration with tool calling.
 */

using { ecommerce } from '../db/schema';

@path: '/orders'
service OrderService {
  
  /**
   * Order views
   */
  @readonly entity Orders as projection on ecommerce.Orders;
  @readonly entity OrderItems as projection on ecommerce.OrderItems;
  @readonly entity Products as projection on ecommerce.Products;
  @readonly entity Customers as projection on ecommerce.Customers;
  @readonly entity Payments as projection on ecommerce.Payments;
  @readonly entity AgentLog as projection on ecommerce.AgentLog;
  
  /**
   * Create a new order - triggers agent processing
   * @agent - Indicates this action uses AI agent orchestration
   */
  @agent
  action createOrder(
    customerId : UUID @mandatory,
    items : array of {
      productId : UUID;
      quantity : Integer;
    } @mandatory
  ) returns {
    orderId : UUID;
    status : String;
    message : String;
    totalAmount : Decimal;
  };
  
  /**
   * Process payment for an order
   * @agent - Part of agent workflow
   */
  @agent
  action processPayment(
    orderId : UUID @mandatory,
    paymentMethod : String default 'credit_card'
  ) returns {
    success : Boolean;
    transactionId : String;
    message : String;
  };
  
  /**
   * Fulfill an order (reserve inventory, prepare shipping)
   * @agent - Part of agent workflow
   */
  @agent
  action fulfillOrder(
    orderId : UUID @mandatory
  ) returns {
    success : Boolean;
    message : String;
    trackingNumber : String;
  };
  
  /**
   * Cancel an order and release resources
   */
  action cancelOrder(
    orderId : UUID @mandatory,
    reason : String
  ) returns {
    success : Boolean;
    message : String;
    refundAmount : Decimal;
  };
  
  /**
   * Tool: Check inventory availability
   * Called by agent during order processing
   */
  function checkInventory(
    productId : UUID @mandatory,
    quantity : Integer @mandatory
  ) returns {
    available : Boolean;
    currentStock : Integer;
    reservedStock : Integer;
    availableQuantity : Integer;
  };
  
  /**
   * Tool: Validate customer credit
   * Called by agent during payment processing
   */
  function validateCustomerCredit(
    customerId : UUID @mandatory,
    amount : Decimal @mandatory
  ) returns {
    approved : Boolean;
    creditLimit : Decimal;
    currentBalance : Decimal;
    availableCredit : Decimal;
    reason : String;
  };
  
  /**
   * Tool: Reserve inventory
   * Called by agent during fulfillment
   */
  action reserveInventory(
    productId : UUID @mandatory,
    quantity : Integer @mandatory,
    orderId : UUID @mandatory
  ) returns {
    success : Boolean;
    reservationId : String;
    message : String;
  };
  
  /**
   * Get agent processing status
   */
  function getAgentStatus(
    sessionId : String @mandatory
  ) returns {
    phase : String;
    llmCallsUsed : Integer;
    toolCallsMade : Integer;
    lastAction : String;
    isComplete : Boolean;
  };
}
