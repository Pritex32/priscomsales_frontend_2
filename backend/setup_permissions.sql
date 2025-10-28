-- ===================================================================
-- Permission System Setup Script
-- ===================================================================
-- This script sets up the initial permissions for the application
-- Run this after creating the permissions and employee_permission tables
-- ===================================================================

-- 1. Create Global Permissions (user_id = NULL for global permissions)
-- These are available system-wide and can be assigned to any employee

-- Sales Module Permissions
INSERT INTO permissions (resource_key, user_id) VALUES
  ('sales.page.access', NULL),
  ('sales.create.access', NULL),
  ('sales.edit_button.access', NULL),
  ('sales.delete_button.access', NULL),
  ('sales.report_tab.access', NULL),
  ('sales.export.access', NULL);

-- Admin Module Permissions
INSERT INTO permissions (resource_key, user_id) VALUES
  ('admin_review.page.access', NULL),
  ('admin.full_access', NULL);

-- Settings Module Permissions
INSERT INTO permissions (resource_key, user_id) VALUES
  ('settings.page.access', NULL),
  ('settings.edit.access', NULL),
  ('settings.delete.access', NULL);

-- Employee Management Permissions
INSERT INTO permissions (resource_key, user_id) VALUES
  ('employees.page.access', NULL),
  ('employees.create.access', NULL),
  ('employees.edit.access', NULL),
  ('employees.delete.access', NULL),
  ('employees.view_permissions.access', NULL),
  ('employees.manage_permissions.access', NULL);

-- Inventory Module Permissions
INSERT INTO permissions (resource_key, user_id) VALUES
  ('inventory.page.access', NULL),
  ('inventory.create.access', NULL),
  ('inventory.update.access', NULL),
  ('inventory.delete.access', NULL),
  ('inventory.export.access', NULL);

-- Customer Module Permissions
INSERT INTO permissions (resource_key, user_id) VALUES
  ('customers.page.access', NULL),
  ('customers.create.access', NULL),
  ('customers.edit.access', NULL),
  ('customers.delete.access', NULL),
  ('customers.export.access', NULL);

-- Reports Module Permissions
INSERT INTO permissions (resource_key, user_id) VALUES
  ('reports.page.access', NULL),
  ('reports.sales.access', NULL),
  ('reports.inventory.access', NULL),
  ('reports.financial.access', NULL),
  ('reports.export.access', NULL);

-- Dashboard Permissions
INSERT INTO permissions (resource_key, user_id) VALUES
  ('dashboard.page.access', NULL),
  ('dashboard.analytics.access', NULL),
  ('dashboard.kpi.access', NULL);

-- ===================================================================
-- 2. Example: Grant Permissions to a Specific Employee
-- ===================================================================
-- Replace employee_id = 1 with actual employee ID
-- This example gives an employee basic sales permissions

-- Basic Sales Employee (Read + Edit, No Delete)
INSERT INTO employee_permission (employee_id, permission_id, can_access) 
SELECT 1, id, true 
FROM permissions 
WHERE resource_key IN (
  'sales.page.access',
  'sales.edit_button.access',
  'sales.report_tab.access',
  'customers.page.access',
  'customers.edit.access',
  'dashboard.page.access'
);

-- ===================================================================
-- 3. Example: Grant Full Sales Access to Employee
-- ===================================================================
-- Replace employee_id = 2 with actual employee ID

INSERT INTO employee_permission (employee_id, permission_id, can_access) 
SELECT 2, id, true 
FROM permissions 
WHERE resource_key LIKE 'sales.%';

-- ===================================================================
-- 4. Example: Grant Manager-Level Permissions
-- ===================================================================
-- Replace employee_id = 3 with actual employee ID
-- Managers typically need access to most features except system settings

INSERT INTO employee_permission (employee_id, permission_id, can_access) 
SELECT 3, id, true 
FROM permissions 
WHERE resource_key IN (
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
  'inventory.export.access',
  'customers.page.access',
  'customers.create.access',
  'customers.edit.access',
  'customers.delete.access',
  'employees.page.access',
  'employees.view_permissions.access',
  'reports.page.access',
  'reports.sales.access',
  'reports.inventory.access',
  'reports.financial.access',
  'dashboard.page.access',
  'dashboard.analytics.access',
  'dashboard.kpi.access'
);

-- ===================================================================
-- 5. Example: Grant Read-Only Access to Employee
-- ===================================================================
-- Replace employee_id = 4 with actual employee ID
-- Read-only users can view but not modify

INSERT INTO employee_permission (employee_id, permission_id, can_access) 
SELECT 4, id, true 
FROM permissions 
WHERE resource_key IN (
  'sales.page.access',
  'inventory.page.access',
  'customers.page.access',
  'reports.page.access',
  'reports.sales.access',
  'dashboard.page.access'
);

-- ===================================================================
-- Utility Queries
-- ===================================================================

-- View all permissions for a specific employee
-- Replace employee_id = 1 with actual employee ID
SELECT 
  e.name as employee_name,
  e.email,
  p.resource_key,
  ep.can_access
FROM employees e
LEFT JOIN employee_permission ep ON e.id = ep.employee_id
LEFT JOIN permissions p ON ep.permission_id = p.id
WHERE e.id = 1
ORDER BY p.resource_key;

-- View all employees with a specific permission
-- Replace 'sales.delete_button.access' with the permission you want to check
SELECT 
  e.id,
  e.name,
  e.email,
  ep.can_access
FROM employees e
JOIN employee_permission ep ON e.id = ep.employee_id
JOIN permissions p ON ep.permission_id = p.id
WHERE p.resource_key = 'sales.delete_button.access'
  AND ep.can_access = true;

-- Revoke a specific permission from an employee
-- Replace employee_id = 1 and permission key as needed
UPDATE employee_permission 
SET can_access = false 
WHERE employee_id = 1 
  AND permission_id = (
    SELECT id FROM permissions 
    WHERE resource_key = 'sales.delete_button.access'
  );

-- Grant a specific permission to an employee
-- Replace employee_id = 1 and permission key as needed
INSERT INTO employee_permission (employee_id, permission_id, can_access)
SELECT 1, id, true
FROM permissions
WHERE resource_key = 'sales.delete_button.access'
ON CONFLICT (employee_id, permission_id) 
DO UPDATE SET can_access = true;

-- Remove all permissions for an employee
-- Replace employee_id = 1 with actual employee ID
DELETE FROM employee_permission WHERE employee_id = 1;

-- List all available permissions
SELECT 
  id,
  resource_key,
  user_id
FROM permissions
WHERE user_id IS NULL
ORDER BY resource_key;

-- Count permissions per employee
SELECT 
  e.id,
  e.name,
  e.email,
  COUNT(ep.permission_id) as total_permissions,
  SUM(CASE WHEN ep.can_access THEN 1 ELSE 0 END) as active_permissions
FROM employees e
LEFT JOIN employee_permission ep ON e.id = ep.employee_id
GROUP BY e.id, e.name, e.email
ORDER BY e.name;

-- ===================================================================
-- Cleanup (Use with caution!)
-- ===================================================================

-- Remove all global permissions (careful - this will affect all employees)
-- DELETE FROM permissions WHERE user_id IS NULL;

-- Remove all employee permission mappings
-- DELETE FROM employee_permission;
