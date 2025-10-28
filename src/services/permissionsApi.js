import api from './api';

/**
 * Fetch all global permissions available for assignment
 */
export const fetchPermissions = async () => {
  const response = await api.get('/settings/permissions');
  return response.data;
};

/**
 * Fetch all employees for the current tenant (MD)
 */
export const fetchEmployees = async () => {
  const response = await api.get('/settings/employees');
  return response.data;
};

/**
 * Fetch current permissions for a specific employee
 */
export const fetchEmployeePermissions = async (employeeId) => {
  const response = await api.get(`/settings/employee-permissions/${employeeId}`);
  return response.data;
};

/**
 * Update permissions for a specific employee
 * @param {number} employeeId - Employee ID
 * @param {Array} grants - Array of {resource_key, can_access}
 */
export const updateEmployeePermissions = async (employeeId, grants) => {
  const response = await api.post(`/settings/employee-permissions/${employeeId}`, {
    grants
  });
  return response.data;
};
