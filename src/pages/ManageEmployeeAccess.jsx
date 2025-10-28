import React, { useState, useEffect } from 'react';
import { 
  fetchPermissions, 
  fetchEmployees, 
  fetchEmployeePermissions, 
  updateEmployeePermissions 
} from '../services/permissionsApi';
import EmployeeSelector from '../components/EmployeeSelector';
import PermissionsTable from '../components/PermissionsTable';
import RoleTemplates from '../components/RoleTemplates';

const ManageEmployeeAccess = () => {
  const [employees, setEmployees] = useState([]);
  const [permissions, setPermissions] = useState([]);
  const [selectedEmployee, setSelectedEmployee] = useState(null);
  const [employeePermissions, setEmployeePermissions] = useState({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [successMessage, setSuccessMessage] = useState(null);

  // Check if user is MD
  useEffect(() => {
    const role = localStorage.getItem('role');
    if (role?.toLowerCase() !== 'md') {
      window.location.href = '/dashboard';
    }
  }, []);

  // Load employees and permissions on mount
  useEffect(() => {
    loadInitialData();
  }, []);

  const loadInitialData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [employeesData, permissionsData] = await Promise.all([
        fetchEmployees(),
        fetchPermissions()
      ]);
      setEmployees(employeesData);
      setPermissions(permissionsData);
    } catch (err) {
      setError('Failed to load data: ' + (err.response?.data?.detail || err.message));
    } finally {
      setLoading(false);
    }
  };

  const handleEmployeeSelect = async (employee) => {
    if (!employee) {
      setSelectedEmployee(null);
      setEmployeePermissions({});
      return;
    }

    setSelectedEmployee(employee);
    setLoading(true);
    setError(null);
    try {
      const data = await fetchEmployeePermissions(employee.employee_id);
      const permsMap = {};
      data.grants.forEach(grant => {
        permsMap[grant.resource_key] = grant.can_access;
      });
      setEmployeePermissions(permsMap);
    } catch (err) {
      setError('Failed to load employee permissions: ' + (err.response?.data?.detail || err.message));
    } finally {
      setLoading(false);
    }
  };

  const handlePermissionToggle = (resourceKey) => {
    setEmployeePermissions(prev => ({
      ...prev,
      [resourceKey]: !prev[resourceKey]
    }));
  };

  const handleSavePermissions = async () => {
    if (!selectedEmployee) return;

    setSaving(true);
    setError(null);
    setSuccessMessage(null);
    try {
      const grants = permissions.map(perm => ({
        resource_key: perm.resource_key,
        can_access: !!employeePermissions[perm.resource_key]
      }));

      await updateEmployeePermissions(selectedEmployee.employee_id, grants);
      setSuccessMessage(`Permissions saved successfully for ${selectedEmployee.name}`);
      
      // Auto-hide success message after 3 seconds
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (err) {
      setError('Failed to save permissions: ' + (err.response?.data?.detail || err.message));
    } finally {
      setSaving(false);
    }
  };

  const handleApplyRoleTemplate = (templatePermissions) => {
    const newPerms = {};
    permissions.forEach(perm => {
      newPerms[perm.resource_key] = templatePermissions.includes(perm.resource_key);
    });
    setEmployeePermissions(newPerms);
  };

  return (
    <div className="min-h-screen bg-gray-50 py-6">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-gray-900">Manage Employee Access</h1>
          <p className="mt-2 text-sm text-gray-600">
            Control which features and actions employees can access in the system.
          </p>
        </div>

        {/* Error Alert */}
        {error && (
          <div className="mb-4 bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded-lg">
            <div className="flex items-center">
              <svg className="w-5 h-5 mr-2" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
              </svg>
              {error}
            </div>
          </div>
        )}

        {/* Success Alert */}
        {successMessage && (
          <div className="mb-4 bg-green-50 border border-green-200 text-green-800 px-4 py-3 rounded-lg">
            <div className="flex items-center">
              <svg className="w-5 h-5 mr-2" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
              {successMessage}
            </div>
          </div>
        )}

        {loading && !selectedEmployee ? (
          <div className="flex justify-center items-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
          </div>
        ) : (
          <>
            {/* Employee Selector */}
            <div className="bg-white shadow rounded-lg p-6 mb-6">
              <EmployeeSelector
                employees={employees}
                selectedEmployee={selectedEmployee}
                onEmployeeSelect={handleEmployeeSelect}
              />
            </div>

            {selectedEmployee && (
              <>
                {/* Role Templates */}
                <div className="bg-white shadow rounded-lg p-6 mb-6">
                  <RoleTemplates
                    onApplyTemplate={handleApplyRoleTemplate}
                    disabled={saving}
                  />
                </div>

                {/* Permissions Table */}
                <div className="bg-white shadow rounded-lg p-6">
                  <div className="flex justify-between items-center mb-4">
                    <h2 className="text-xl font-semibold text-gray-900">
                      Permissions for {selectedEmployee.name}
                    </h2>
                    <button
                      onClick={handleSavePermissions}
                      disabled={saving}
                      className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
                    >
                      {saving ? 'Saving...' : 'Save Changes'}
                    </button>
                  </div>

                  {loading ? (
                    <div className="flex justify-center py-8">
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                    </div>
                  ) : (
                    <PermissionsTable
                      permissions={permissions}
                      employeePermissions={employeePermissions}
                      onPermissionToggle={handlePermissionToggle}
                      disabled={saving}
                    />
                  )}
                </div>
              </>
            )}

            {!selectedEmployee && !loading && (
              <div className="bg-white shadow rounded-lg p-12 text-center">
                <svg
                  className="mx-auto h-12 w-12 text-gray-400 mb-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
                  />
                </svg>
                <h3 className="text-lg font-medium text-gray-900 mb-2">
                  Select an Employee
                </h3>
                <p className="text-gray-600">
                  Choose an employee from the dropdown above to manage their access permissions.
                </p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default ManageEmployeeAccess;
