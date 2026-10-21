/**
 * Order Service Implementation
 * 
 * Implements an AI-powered order processing agent using the ReAct pattern:
 * 1. Reason: Analyze the request and plan next action
 * 2. Act: Execute tool calls (inventory check, payment, fulfillment)
 * 3. Observe: Process results and decide next step
 * 
 * The agent orchestrates multiple tools while respecting LLM budget
 * and handling failures gracefully.
 */

const cds = require('@sap/cds');

class OrderService extends cds.ApplicationService {
  
  async init() {
    await super.init();
    
    const { Orders, OrderItems, Products, Customers, Payments, AgentLog } = this.entities;
    
    /**
     * Create Order - Agent orchestrated
     * 
     * The agent will:
     * 1. Validate all items have sufficient inventory
     * 2. Calculate total amount
     * 3. Create the order
     * 4. Return for payment processing
     */
    this.on('createOrder', async (req) => {
      const { customerId, items } = req.data;
      const tx = cds.tx(req);
      const sessionId = `order-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      
      try {
        // Log agent start
        await this._logAgent(tx, AgentLog, sessionId, 'think', null, 
          { phase: 'order_creation', customerId, itemCount: items.length });
        
        // Verify customer exists
        const customer = await tx.run(SELECT.one.from(Customers).where({ ID: customerId }));
        if (!customer) {
          return {
            orderId: null,
            status: 'failed',
            message: 'Customer not found',
            totalAmount: 0
          };
        }
        
        // Check inventory for all items (tool calls)
        let totalAmount = 0;
        const orderItems = [];
        
        for (const item of items) {
          await this._logAgent(tx, AgentLog, sessionId, 'tool_call', 'checkInventory',
            { productId: item.productId, quantity: item.quantity });
          
          const inventoryCheck = await this._checkInventory(tx, Products, item.productId, item.quantity);
          
          await this._logAgent(tx, AgentLog, sessionId, 'observe', 'checkInventory',
            { result: inventoryCheck });
          
          if (!inventoryCheck.available) {
            return {
              orderId: null,
              status: 'failed',
              message: `Insufficient inventory for product ${item.productId}: requested ${item.quantity}, available ${inventoryCheck.availableQuantity}`,
              totalAmount: 0
            };
          }
          
          const product = await tx.run(SELECT.one.from(Products).where({ ID: item.productId }));
          const lineTotal = product.price * item.quantity;
          totalAmount += lineTotal;
          
          orderItems.push({
            productId: item.productId,
            quantity: item.quantity,
            unitPrice: product.price,
            lineTotal
          });
        }
        
        // Create order
        const orderId = cds.utils.uuid();
        const orderNumber = `ORD-${Date.now()}`;
        
        await tx.run(INSERT.into(Orders).entries({
          ID: orderId,
          orderNumber,
          customer_ID: customerId,
          status: 'inventoryChecked',
          totalAmount,
          agentSessionId: sessionId
        }));
        
        // Create order items
        for (const item of orderItems) {
          await tx.run(INSERT.into(OrderItems).entries({
            ID: cds.utils.uuid(),
            order_ID: orderId,
            product_ID: item.productId,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            lineTotal: item.lineTotal
          }));
        }
        
        await this._logAgent(tx, AgentLog, sessionId, 'act', null,
          { action: 'order_created', orderId, totalAmount });
        
        return {
          orderId,
          status: 'inventoryChecked',
          message: 'Order created, pending payment',
          totalAmount
        };
        
      } catch (error) {
        await this._logAgent(tx, AgentLog, sessionId, 'escalate', null,
          { error: error.message });
        
        return {
          orderId: null,
          status: 'failed',
          message: `Order creation failed: ${error.message}`,
          totalAmount: 0
        };
      }
    });
    
    /**
     * Process Payment - Agent orchestrated
     */
    this.on('processPayment', async (req) => {
      const { orderId, paymentMethod } = req.data;
      const tx = cds.tx(req);
      
      try {
        const order = await tx.run(SELECT.one.from(Orders).where({ ID: orderId }));
        if (!order) {
          return { success: false, transactionId: null, message: 'Order not found' };
        }
        
        if (order.status !== 'inventoryChecked') {
          return { success: false, transactionId: null, message: `Cannot process payment: order status is ${order.status}` };
        }
        
        const sessionId = order.agentSessionId;
        
        // Tool call: validate credit
        await this._logAgent(tx, AgentLog, sessionId, 'tool_call', 'validateCustomerCredit',
          { customerId: order.customer_ID, amount: order.totalAmount });
        
        const creditCheck = await this._validateCredit(tx, Customers, order.customer_ID, order.totalAmount);
        
        await this._logAgent(tx, AgentLog, sessionId, 'observe', 'validateCustomerCredit',
          { result: creditCheck });
        
        if (!creditCheck.approved) {
          await tx.run(UPDATE(Orders).where({ ID: orderId }).set({ 
            status: 'failed',
            errorReason: creditCheck.reason
          }));
          
          return { success: false, transactionId: null, message: creditCheck.reason };
        }
        
        // Process payment
        const transactionId = `TXN-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        
        await tx.run(INSERT.into(Payments).entries({
          ID: cds.utils.uuid(),
          order_ID: orderId,
          amount: order.totalAmount,
          method: paymentMethod,
          status: 'captured',
          transactionId,
          processedAt: new Date().toISOString()
        }));
        
        // Update customer balance
        await tx.run(UPDATE(Customers).where({ ID: order.customer_ID }).set({
          currentBalance: { '+=': order.totalAmount }
        }));
        
        // Update order status
        await tx.run(UPDATE(Orders).where({ ID: orderId }).set({
          status: 'paymentProcessed',
          updatedAt: new Date().toISOString()
        }));
        
        await this._logAgent(tx, AgentLog, sessionId, 'act', null,
          { action: 'payment_processed', transactionId });
        
        return {
          success: true,
          transactionId,
          message: 'Payment processed successfully'
        };
        
      } catch (error) {
        return {
          success: false,
          transactionId: null,
          message: `Payment processing failed: ${error.message}`
        };
      }
    });
    
    /**
     * Fulfill Order - Agent orchestrated
     */
    this.on('fulfillOrder', async (req) => {
      const { orderId } = req.data;
      const tx = cds.tx(req);
      
      try {
        const order = await tx.run(SELECT.one.from(Orders).where({ ID: orderId }));
        if (!order) {
          return { success: false, message: 'Order not found', trackingNumber: null };
        }
        
        if (order.status !== 'paymentProcessed') {
          return { 
            success: false, 
            message: `Cannot fulfill order: payment not processed (status: ${order.status})`,
            trackingNumber: null
          };
        }
        
        const sessionId = order.agentSessionId;
        const orderItems = await tx.run(SELECT.from(OrderItems).where({ order_ID: orderId }));
        
        // Reserve inventory for each item
        for (const item of orderItems) {
          await this._logAgent(tx, AgentLog, sessionId, 'tool_call', 'reserveInventory',
            { productId: item.product_ID, quantity: item.quantity });
          
          const reservation = await this._reserveInventory(tx, Products, item.product_ID, item.quantity, orderId);
          
          await this._logAgent(tx, AgentLog, sessionId, 'observe', 'reserveInventory',
            { result: reservation });
          
          if (!reservation.success) {
            await tx.run(UPDATE(Orders).where({ ID: orderId }).set({
              status: 'failed',
              errorReason: `Fulfillment failed: ${reservation.message}`
            }));
            
            return { success: false, message: reservation.message, trackingNumber: null };
          }
        }
        
        // Generate tracking number
        const trackingNumber = `TRK-${Date.now()}-${Math.random().toString(36).substr(2, 9).toUpperCase()}`;
        
        // Update order status
        await tx.run(UPDATE(Orders).where({ ID: orderId }).set({
          status: 'fulfilled',
          updatedAt: new Date().toISOString()
        }));
        
        await this._logAgent(tx, AgentLog, sessionId, 'act', null,
          { action: 'order_fulfilled', trackingNumber });
        
        return {
          success: true,
          message: 'Order fulfilled and ready for shipping',
          trackingNumber
        };
        
      } catch (error) {
        return {
          success: false,
          message: `Fulfillment failed: ${error.message}`,
          trackingNumber: null
        };
      }
    });
    
    /**
     * Cancel Order
     */
    this.on('cancelOrder', async (req) => {
      const { orderId, reason } = req.data;
      const tx = cds.tx(req);
      
      try {
        const order = await tx.run(SELECT.one.from(Orders).where({ ID: orderId }));
        if (!order) {
          return { success: false, message: 'Order not found', refundAmount: 0 };
        }
        
        if (order.status === 'completed' || order.status === 'cancelled') {
          return { 
            success: false, 
            message: `Cannot cancel order in ${order.status} status`,
            refundAmount: 0
          };
        }
        
        let refundAmount = 0;
        
        // If payment was processed, issue refund
        if (order.status === 'paymentProcessed' || order.status === 'fulfilled') {
          const payment = await tx.run(
            SELECT.one.from(Payments).where({ order_ID: orderId, status: 'captured' })
          );
          
          if (payment) {
            await tx.run(UPDATE(Payments).where({ ID: payment.ID }).set({ status: 'refunded' }));
            await tx.run(UPDATE(Customers).where({ ID: order.customer_ID }).set({
              currentBalance: { '-=': payment.amount }
            }));
            refundAmount = payment.amount;
          }
        }
        
        // Release reserved inventory
        const orderItems = await tx.run(SELECT.from(OrderItems).where({ order_ID: orderId }));
        for (const item of orderItems) {
          await tx.run(UPDATE(Products).where({ ID: item.product_ID }).set({
            reservedQuantity: { '-=': item.quantity }
          }));
        }
        
        // Update order status
        await tx.run(UPDATE(Orders).where({ ID: orderId }).set({
          status: 'cancelled',
          errorReason: reason || 'Cancelled by user',
          updatedAt: new Date().toISOString()
        }));
        
        return {
          success: true,
          message: 'Order cancelled successfully',
          refundAmount
        };
        
      } catch (error) {
        return {
          success: false,
          message: `Cancellation failed: ${error.message}`,
          refundAmount: 0
        };
      }
    });
    
    /**
     * Check Inventory - Tool
     */
    this.on('checkInventory', async (req) => {
      const { productId, quantity } = req.data;
      const tx = cds.tx(req);
      return this._checkInventory(tx, Products, productId, quantity);
    });
    
    /**
     * Validate Customer Credit - Tool
     */
    this.on('validateCustomerCredit', async (req) => {
      const { customerId, amount } = req.data;
      const tx = cds.tx(req);
      return this._validateCredit(tx, Customers, customerId, amount);
    });
    
    /**
     * Reserve Inventory - Tool
     */
    this.on('reserveInventory', async (req) => {
      const { productId, quantity, orderId } = req.data;
      const tx = cds.tx(req);
      return this._reserveInventory(tx, Products, productId, quantity, orderId);
    });
    
    /**
     * Get Agent Status
     */
    this.on('getAgentStatus', async (req) => {
      const { sessionId } = req.data;
      const tx = cds.tx(req);
      
      const logs = await tx.run(
        SELECT.from(AgentLog).where({ sessionId }).orderBy('timestamp desc')
      );
      
      const toolCalls = logs.filter(l => l.action === 'tool_call').length;
      const lastLog = logs[0];
      
      return {
        phase: lastLog?.action || 'unknown',
        llmCallsUsed: logs.filter(l => l.action === 'think').length,
        toolCallsMade: toolCalls,
        lastAction: lastLog?.toolName || lastLog?.action || 'none',
        isComplete: lastLog?.action === 'act' || lastLog?.action === 'escalate'
      };
    });
  }
  
  /**
   * Internal: Check inventory availability
   */
  async _checkInventory(tx, Products, productId, quantity) {
    const product = await tx.run(SELECT.one.from(Products).where({ ID: productId }));
    
    if (!product) {
      return {
        available: false,
        currentStock: 0,
        reservedStock: 0,
        availableQuantity: 0
      };
    }
    
    const availableQuantity = product.stockQuantity - product.reservedQuantity;
    
    return {
      available: availableQuantity >= quantity,
      currentStock: product.stockQuantity,
      reservedStock: product.reservedQuantity,
      availableQuantity
    };
  }
  
  /**
   * Internal: Validate customer credit
   */
  async _validateCredit(tx, Customers, customerId, amount) {
    const customer = await tx.run(SELECT.one.from(Customers).where({ ID: customerId }));
    
    if (!customer) {
      return {
        approved: false,
        creditLimit: 0,
        currentBalance: 0,
        availableCredit: 0,
        reason: 'Customer not found'
      };
    }
    
    const availableCredit = customer.creditLimit - customer.currentBalance;
    const approved = availableCredit >= amount;
    
    return {
      approved,
      creditLimit: customer.creditLimit,
      currentBalance: customer.currentBalance,
      availableCredit,
      reason: approved ? null : `Insufficient credit: available ${availableCredit}, required ${amount}`
    };
  }
  
  /**
   * Internal: Reserve inventory
   */
  async _reserveInventory(tx, Products, productId, quantity, orderId) {
    const product = await tx.run(SELECT.one.from(Products).where({ ID: productId }));
    
    if (!product) {
      return { success: false, reservationId: null, message: 'Product not found' };
    }
    
    const availableQuantity = product.stockQuantity - product.reservedQuantity;
    
    if (availableQuantity < quantity) {
      return {
        success: false,
        reservationId: null,
        message: `Insufficient stock: available ${availableQuantity}, requested ${quantity}`
      };
    }
    
    await tx.run(UPDATE(Products).where({ ID: productId }).set({
      reservedQuantity: { '+=': quantity }
    }));
    
    return {
      success: true,
      reservationId: `RES-${orderId}-${productId}`,
      message: `Reserved ${quantity} units`
    };
  }
  
  /**
   * Internal: Log agent activity
   */
  async _logAgent(tx, AgentLog, sessionId, action, toolName, data) {
    await tx.run(INSERT.into(AgentLog).entries({
      ID: cds.utils.uuid(),
      sessionId,
      action,
      toolName,
      input: JSON.stringify(data),
      llmTokensUsed: action === 'think' ? 100 : 0 // Simulated
    }));
  }
}

module.exports = OrderService;
