-- Quick Fix: Add Missing Permissions
-- Run this in Supabase SQL Editor NOW

-- Add Employee Management Permission
INSERT INTO permissions (resource_key, description, user_id, created_at)
VALUES ('employees.manage.access', 'Permission to create and manage employee accounts', NULL, NOW())
ON CONFLICT (resource_key, COALESCE(user_id, -1)) DO NOTHING;

-- Verify it was added
SELECT id, resource_key, description 
FROM permissions 
WHERE resource_key = 'employees.manage.access' 
AND user_id IS NULL;
