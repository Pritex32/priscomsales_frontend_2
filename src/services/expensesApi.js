import api from './api';

export const expensesApi = {
  // Fetch all expenses with pagination
  getExpenses: (skip = 0, limit = 100) => {
    return api.get('/expenses', { params: { skip, limit } });
  },

  // Get pending expenses (partial/credit status)
  getPendingExpenses: () => {
    return api.get('/expenses/pending');
  },

  // Get expenses in date range
  getExpensesInRange: (startDate, endDate) => {
    return api.get('/expenses/range', {
      params: { start_date: startDate, end_date: endDate }
    });
  },

  // Upload invoice file
  uploadInvoice: (formData) => {
    return api.post('/expenses/upload-invoice', formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    });
  },

  // Upload invoice from base64
  uploadInvoiceBase64: (payload) => {
    return api.post('/expenses/upload-invoice-base64', payload);
  },

  // Create expense (form-data)
  createExpense: (formData) => {
    return api.post('/expenses', formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    });
  },

  // Create expense (JSON)
  createExpenseJson: (payload) => {
    return api.post('/expenses/json', payload);
  },

  // Update expense
  updateExpense: (expenseId, formData) => {
    return api.put(`/expenses/${expenseId}`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    });
  },

  // Add payment to expense
  addPayment: (payload) => {
    return api.post('/expenses/payments', payload);
  },

  // Delete expense
  deleteExpense: (expenseId) => {
    return api.delete(`/expenses/${expenseId}`);
  }
};