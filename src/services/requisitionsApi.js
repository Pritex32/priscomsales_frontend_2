import api from './api';

export const requisitionsApi = {
  // Fetch all requisitions with pagination
  getRequisitions: (params = {}) => {
    return api.get('/requisitions', { params });
  },

  // Create single requisition (form-data)
  createRequisition: (formData) => {
    return api.post('/requisitions', formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    });
  },

  // Create batch requisitions (JSON)
  createRequisitionsBatch: (payload) => {
    return api.post('/requisitions/batch', payload);
  },

  // Update requisition
  updateRequisition: (requisitionId, data) => {
    const formData = new FormData();
    Object.entries(data).forEach(([key, value]) => {
      if (value !== null && value !== undefined) {
        formData.append(key, value);
      }
    });
    return api.put(`/requisitions/${requisitionId}`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    });
  },

  // Delete requisition
  deleteRequisition: (requisitionId) => {
    return api.delete(`/requisitions/${requisitionId}`);
  },

  // Get warehouses for requisitions
  getWarehouses: (role, employeeId = null) => {
    const params = { role };
    if (employeeId) params.employee_id = employeeId;
    return api.get('/requisitions/warehouses', { params });
  },

  // Get inventory items for warehouse
  getInventoryItems: (warehouseName) => {
    return api.get('/requisitions/inventory-items', {
      params: { warehouse_name: warehouseName }
    });
  },

  // Get employees
  getEmployees: () => {
    return api.get('/requisitions/employees');
  },

  // Filter requisitions
  filterRequisitions: (params) => {
    return api.get('/requisitions/filter', { params });
  },

  // Export requisitions
  exportRequisitions: (format = 'csv', params = {}) => {
    return api.get('/requisitions/export', {
      params: { format, ...params }
    });
  },

  // Approve requisition (MD only)
  approveRequisition: (requisitionId) => {
    return api.post(`/requisitions/${requisitionId}/approve`);
  },

  // Reject requisition (MD only)
  rejectRequisition: (requisitionId) => {
    return api.post(`/requisitions/${requisitionId}/reject`);
  },

  // Update remark (MD only)
  updateRemark: (requisitionId, remark) => {
    return api.put(`/requisitions/${requisitionId}/remark`, { remark });
  }
};
