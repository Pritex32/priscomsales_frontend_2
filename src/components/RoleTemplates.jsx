import React from 'react';

// Define role templates with recommended permissions
const ROLE_TEMPLATES = {
  sales: {
    name: 'Sales',
    description: 'Can manage sales, customers, and view basic reports',
    permissions: [
      'sales.page.access',
      'sales.create.access',
      'sales.edit_button.access',
      'sales.report_tab.access',
      'customers.page.access',
      'customers.create.access',
      'customers.edit.access',
      'dashboard.page.access'
    ],
    color: 'blue'
  },
  inventory: {
    name: 'Inventory',
    description: 'Can manage inventory, stock, and restock operations',
    permissions: [
      'inventory.page.access',
      'inventory.create.access',
      'inventory.update.access',
      'sales.page.access',
      'dashboard.page.access'
    ],
    color: 'green'
  },
  accountant: {
    name: 'Accountant',
    description: 'Can access financial reports and admin review',
    permissions: [
      'admin_review.page.access',
      'reports.page.access',
      'reports.sales.access',
      'reports.financial.access',
      'dashboard.page.access',
      'dashboard.analytics.access',
      'sales.page.access',
      'sales.report_tab.access'
    ],
    color: 'purple'
  },
  manager: {
    name: 'Manager',
    description: 'Full access to most features except system settings',
    permissions: [
      'sales.page.access',
      'sales.create.access',
      'sales.edit_button.access',
      'sales.delete_button.access',
      'sales.report_tab.access',
      'sales.export.access',
      'inventory.page.access',
      'inventory.create.access',
      'inventory.update.access',
      'inventory.delete.access',
      'customers.page.access',
      'customers.create.access',
      'customers.edit.access',
      'customers.delete.access',
      'employees.page.access',
      'reports.page.access',
      'reports.sales.access',
      'reports.inventory.access',
      'reports.financial.access',
      'dashboard.page.access',
      'dashboard.analytics.access',
      'dashboard.kpi.access'
    ],
    color: 'red'
  },
  readOnly: {
    name: 'Read Only',
    description: 'View-only access to sales, inventory, and reports',
    permissions: [
      'sales.page.access',
      'inventory.page.access',
      'customers.page.access',
      'reports.page.access',
      'reports.sales.access',
      'dashboard.page.access'
    ],
    color: 'gray'
  }
};

const RoleTemplates = ({ onApplyTemplate, disabled }) => {
  const colorClasses = {
    blue: 'bg-blue-50 border-blue-200 hover:bg-blue-100',
    green: 'bg-green-50 border-green-200 hover:bg-green-100',
    purple: 'bg-purple-50 border-purple-200 hover:bg-purple-100',
    red: 'bg-red-50 border-red-200 hover:bg-red-100',
    gray: 'bg-gray-50 border-gray-200 hover:bg-gray-100'
  };

  const textColorClasses = {
    blue: 'text-blue-900',
    green: 'text-green-900',
    purple: 'text-purple-900',
    red: 'text-red-900',
    gray: 'text-gray-900'
  };

  return (
    <div>
      <h3 className="text-lg font-semibold text-gray-900 mb-3">Quick Apply Role Templates</h3>
      <p className="text-sm text-gray-600 mb-4">
        Apply a pre-configured set of permissions based on common roles. You can customize after applying.
      </p>
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {Object.entries(ROLE_TEMPLATES).map(([key, template]) => (
          <button
            key={key}
            onClick={() => onApplyTemplate(template.permissions)}
            disabled={disabled}
            className={`p-4 border-2 rounded-lg text-left transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${colorClasses[template.color]}`}
          >
            <div className={`font-semibold mb-1 ${textColorClasses[template.color]}`}>
              {template.name}
            </div>
            <div className="text-xs text-gray-600">
              {template.description}
            </div>
            <div className="text-xs text-gray-500 mt-2">
              {template.permissions.length} permissions
            </div>
          </button>
        ))}
      </div>
    </div>
  );
};

export default RoleTemplates;
