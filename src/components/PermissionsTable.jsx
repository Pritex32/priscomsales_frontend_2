import React, { useMemo } from 'react';

// Map permissions to recommended roles and descriptions
const PERMISSION_METADATA = {
  // Sales permissions
  'sales.page.access': { role: 'Sales, Manager', description: 'View sales page' },
  'sales.create.access': { role: 'Sales, Manager', description: 'Create new sales records' },
  'sales.edit_button.access': { role: 'Sales, Manager', description: 'Edit existing sales records' },
  'sales.delete_button.access': { role: 'Manager', description: 'Delete sales records' },
  'sales.report_tab.access': { role: 'Sales, Accountant, Manager', description: 'View sales reports' },
  'sales.export.access': { role: 'Manager', description: 'Export sales data' },
  
  // Inventory permissions
  'inventory.page.access': { role: 'Inventory, Manager', description: 'View inventory page' },
  'inventory.create.access': { role: 'Inventory, Manager', description: 'Add new inventory items' },
  'inventory.update.access': { role: 'Inventory, Manager', description: 'Update inventory records' },
  'inventory.delete.access': { role: 'Manager', description: 'Delete inventory items' },
  'inventory.export.access': { role: 'Manager', description: 'Export inventory data' },
  
  // Customer permissions
  'customers.page.access': { role: 'Sales, Manager', description: 'View customers page' },
  'customers.create.access': { role: 'Sales, Manager', description: 'Add new customers' },
  'customers.edit.access': { role: 'Sales, Manager', description: 'Edit customer information' },
  'customers.delete.access': { role: 'Manager', description: 'Delete customer records' },
  'customers.export.access': { role: 'Manager', description: 'Export customer data' },
  
  // Reports permissions
  'reports.page.access': { role: 'Accountant, Manager', description: 'View reports page' },
  'reports.sales.access': { role: 'Accountant, Manager', description: 'View sales reports' },
  'reports.inventory.access': { role: 'Manager', description: 'View inventory reports' },
  'reports.financial.access': { role: 'Accountant, Manager', description: 'View financial reports' },
  'reports.export.access': { role: 'Manager', description: 'Export reports' },
  
  // Admin permissions
  'admin_review.page.access': { role: 'Accountant', description: 'Access admin review page' },
  'admin.full_access': { role: 'None (MD only)', description: 'Full administrative access' },
  
  // Settings permissions
  'settings.page.access': { role: 'None (MD only)', description: 'Access settings page' },
  'settings.edit.access': { role: 'None (MD only)', description: 'Edit settings' },
  'settings.delete.access': { role: 'None (MD only)', description: 'Delete settings' },
  
  // Employee permissions
  'employees.page.access': { role: 'Manager', description: 'View employees page' },
  'employees.create.access': { role: 'None (MD only)', description: 'Add new employees' },
  'employees.edit.access': { role: 'None (MD only)', description: 'Edit employee information' },
  'employees.delete.access': { role: 'None (MD only)', description: 'Delete employees' },
  'employees.view_permissions.access': { role: 'Manager', description: 'View employee permissions' },
  'employees.manage_permissions.access': { role: 'None (MD only)', description: 'Manage employee permissions' },
  
  // Dashboard permissions
  'dashboard.page.access': { role: 'All', description: 'View dashboard' },
  'dashboard.analytics.access': { role: 'Accountant, Manager', description: 'View analytics' },
  'dashboard.kpi.access': { role: 'Manager', description: 'View key performance indicators' }
};

const PermissionsTable = ({ permissions, employeePermissions, onPermissionToggle, disabled }) => {
  // Group permissions by module
  const groupedPermissions = useMemo(() => {
    const groups = {};
    permissions.forEach(perm => {
      const module = perm.resource_key.split('.')[0];
      const moduleName = module.charAt(0).toUpperCase() + module.slice(1);
      if (!groups[moduleName]) {
        groups[moduleName] = [];
      }
      groups[moduleName].push(perm);
    });
    return groups;
  }, [permissions]);

  const getMetadata = (resourceKey) => {
    return PERMISSION_METADATA[resourceKey] || { 
      role: 'Custom', 
      description: resourceKey 
    };
  };

  const formatPermissionName = (resourceKey) => {
    const parts = resourceKey.split('.');
    const action = parts[parts.length - 2] || parts[parts.length - 1];
    return action
      .replace(/_/g, ' ')
      .split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  };

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-gray-200">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Permission
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Description
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Recommended Role
            </th>
            <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
              Access
            </th>
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-200">
          {Object.entries(groupedPermissions).map(([module, perms]) => (
            <React.Fragment key={module}>
              {/* Module Header */}
              <tr className="bg-gray-100">
                <td colSpan="4" className="px-6 py-2 text-sm font-semibold text-gray-900">
                  {module}
                </td>
              </tr>
              {/* Permissions in Module */}
              {perms.map(perm => {
                const metadata = getMetadata(perm.resource_key);
                const isEnabled = !!employeePermissions[perm.resource_key];
                
                return (
                  <tr key={perm.resource_key} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                      {formatPermissionName(perm.resource_key)}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600">
                      {metadata.description}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                        {metadata.role}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-center">
                      <button
                        onClick={() => onPermissionToggle(perm.resource_key)}
                        disabled={disabled}
                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed ${
                          isEnabled ? 'bg-blue-600' : 'bg-gray-200'
                        }`}
                      >
                        <span
                          className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                            isEnabled ? 'translate-x-6' : 'translate-x-1'
                          }`}
                        />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </React.Fragment>
          ))}
        </tbody>
      </table>
      
      {permissions.length === 0 && (
        <div className="text-center py-8 text-gray-500">
          No permissions available. Please set up permissions in the database first.
        </div>
      )}
    </div>
  );
};

export default PermissionsTable;
