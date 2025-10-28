-- ===================================================================
-- Add Missing RBAC Permissions
-- ===================================================================
-- Run this SQL script in your Supabase SQL editor to add the required
-- permissions that are currently missing
-- ===================================================================

-- Add Restock Page Permission
INSERT INTO permissions (resource_key, description, user_id, created_at) 
VALUES ('restock.page.access', 'Access to restock page and all restock operations', NULL, NOW())
ON CONFLICT DO NOTHING;

-- Add Stock Movement Page Permission  
INSERT INTO permissions (resource_key, description, user_id, created_at)
VALUES ('stock_movement.page.access', 'Access to B2B stock movement page', NULL, NOW())
ON CONFLICT DO NOTHING;

-- Add Settings Page Permission
INSERT INTO permissions (resource_key, description, user_id, created_at)
VALUES ('settings.page.access', 'Access to settings page (MD only)', NULL, NOW())
ON CONFLICT DO NOTHING;

-- Add Admin Review Page Permission
INSERT INTO permissions (resource_key, description, user_id, created_at)
VALUES ('admin_review.page.access', 'Access to admin review page for approvals', NULL, NOW())
ON CONFLICT DO NOTHING;

-- Add Employee Management Permission
INSERT INTO permissions (resource_key, description, user_id, created_at)
VALUES ('employees.manage.access', 'Permission to create and manage employee accounts', NULL, NOW())
ON CONFLICT DO NOTHING;

-- Add Inventory Edit Button Permission
INSERT INTO permissions (resource_key, description, user_id, created_at)
VALUES ('inventory.edit_button.access', 'Permission to edit inventory items', NULL, NOW())
ON CONFLICT DO NOTHING;

-- Add Inventory Delete Button Permission
INSERT INTO permissions (resource_key, description, user_id, created_at)
VALUES ('inventory.delete_button.access', 'Permission to delete inventory items', NULL, NOW())
ON CONFLICT DO NOTHING;

-- Add Sales Report Tab Permission (if not exists)
INSERT INTO permissions (resource_key, description, user_id, created_at)
VALUES ('sales.report_tab.access', 'Access to sales report tab', NULL, NOW())
ON CONFLICT DO NOTHING;

-- Add Sales Backdate Permission
INSERT INTO permissions (resource_key, description, user_id, created_at)
VALUES ('sales.backdate.access', 'Permission to backdate sales to previous dates', NULL, NOW())
ON CONFLICT DO NOTHING;

-- Add Sales Delete Button Permission
INSERT INTO permissions (resource_key, description, user_id, created_at)
VALUES ('sales.delete_button.access', 'Permission to delete sales records', NULL, NOW())
ON CONFLICT DO NOTHING;

-- Add Sales Delete Proforma Permission
INSERT INTO permissions (resource_key, description, user_id, created_at)
VALUES ('sales.delete_proforma.access', 'Permission to delete proforma invoices', NULL, NOW())
ON CONFLICT DO NOTHING;

-- Add Sales Connect POS Permission
INSERT INTO permissions (resource_key, description, user_id, created_at)
VALUES ('sales.connect_pos.access', 'Permission to connect POS or bank account', NULL, NOW())
ON CONFLICT DO NOTHING;

-- Add Sales Invoice Override Permission
INSERT INTO permissions (resource_key, description, user_id, created_at)
VALUES ('sales.invoice_override.access', 'Permission to override mandatory invoice upload', NULL, NOW())
ON CONFLICT DO NOTHING;

-- Add Requisitions Approve Permission
INSERT INTO permissions (resource_key, description, user_id, created_at)
VALUES ('requisitions.approve', 'Permission to approve requisitions', NULL, NOW())
ON CONFLICT DO NOTHING;

-- Add Requisitions Reject Permission
INSERT INTO permissions (resource_key, description, user_id, created_at)
VALUES ('requisitions.reject', 'Permission to reject requisitions', NULL, NOW())
ON CONFLICT DO NOTHING;

-- Add Requisitions Delete Permission
INSERT INTO permissions (resource_key, description, user_id, created_at)
VALUES ('requisitions.delete', 'Permission to delete requisitions', NULL, NOW())
ON CONFLICT DO NOTHING;

-- Add Requisitions Update Remark Permission
INSERT INTO permissions (resource_key, description, user_id, created_at)
VALUES ('requisitions.update_remark', 'Permission to update requisition remarks', NULL, NOW())
ON CONFLICT DO NOTHING;

-- Add Customers Edit Permission
INSERT INTO permissions (resource_key, description, user_id, created_at)
VALUES ('customers.edit.access', 'Permission to edit customer information', NULL, NOW())
ON CONFLICT DO NOTHING;

-- Add Customers Delete Permission
INSERT INTO permissions (resource_key, description, user_id, created_at)
VALUES ('customers.delete.access', 'Permission to delete customers', NULL, NOW())
ON CONFLICT DO NOTHING;

-- Add Customers Export Permission
INSERT INTO permissions (resource_key, description, user_id, created_at)
VALUES ('customers.export.access', 'Permission to export customer data to CSV', NULL, NOW())
ON CONFLICT DO NOTHING;

-- ===================================================================
-- Verify: Check if all permissions were added
-- ===================================================================
SELECT 
  id,
  resource_key,
  description,
  created_at
FROM permissions
WHERE resource_key IN (
  'restock.page.access',
  'stock_movement.page.access',
  'settings.page.access',
  'admin_review.page.access',
  'inventory.edit_button.access',
  'inventory.delete_button.access',
  'sales.report_tab.access',
  'sales.backdate.access',
  'sales.delete_button.access',
  'sales.delete_proforma.access',
  'sales.connect_pos.access',
  'sales.invoice_override.access',
  'requisitions.approve',
  'requisitions.reject',
  'requisitions.delete',
  'requisitions.update_remark',
  'customers.edit.access',
  'customers.delete.access',
  'customers.export.access',
  'employees.manage.access'
)
AND user_id IS NULL
ORDER BY resource_key;

-- ===================================================================
-- IMPORTANT: After running this, MD users will automatically have
-- these permissions. Employees will need to be granted access
-- through the Settings → Manage Employee Access UI.
-- ===================================================================
