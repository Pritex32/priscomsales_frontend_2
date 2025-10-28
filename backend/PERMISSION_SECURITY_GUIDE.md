# Permission-Based Security Guide

## Overview
This guide explains how to secure your backend endpoints using the permission system. The system automatically checks user permissions against the `permissions` and `employee_permission` tables before allowing access to protected routes.

## Architecture

### Database Tables
1. **`permissions`**: Master list of all permission resource keys
   - `id`: Permission ID
   - `resource_key`: Unique permission identifier (e.g., `sales.delete_button.access`)
   - `user_id`: NULL for global permissions

2. **`employee_permission`**: Maps employees to their granted permissions
   - `employee_id`: Reference to employee
   - `permission_id`: Reference to permission
   - `can_access`: Boolean flag

### Permission Flow
1. User logs in → Backend returns JWT + list of permissions
2. Frontend stores permissions (Redux/Context/LocalStorage)
3. Frontend conditionally renders UI elements based on permissions
4. Backend validates permissions on every protected route call
5. MD users automatically bypass all permission checks

## Backend Implementation

### 1. Protecting Individual Routes

Use `require_permission()` dependency to protect a single endpoint:

```python
from fastapi import APIRouter, Depends
from backend.core.permission_check import require_permission

router = APIRouter()

@router.delete(
    "/sales/{sale_id}",
    dependencies=[Depends(require_permission("sales.delete_button.access"))]
)
async def delete_sale(sale_id: int):
    # Only users with "sales.delete_button.access" can reach here
    # MD users automatically pass
    ...
```

### 2. Protecting Routes with Multiple Permission Options

Use `require_any_permission()` when user needs ANY of several permissions:

```python
from backend.core.permission_check import require_any_permission

@router.get(
    "/reports",
    dependencies=[Depends(require_any_permission([
        "sales.report_tab.access",
        "reports.view",
        "reports.admin"
    ]))]
)
async def view_reports():
    # User needs at least ONE of the listed permissions
    ...
```

### 3. Protecting Routes Requiring Multiple Permissions

Use `require_all_permissions()` when user needs ALL permissions:

```python
from backend.core.permission_check import require_all_permissions

@router.post(
    "/admin/action",
    dependencies=[Depends(require_all_permissions([
        "admin_review.page.access",
        "settings.page.access"
    ]))]
)
async def admin_action():
    # User needs ALL listed permissions
    ...
```

### 4. Manual Permission Checks Inside Route Handlers

Use `ensure_permission()` for dynamic permission checks:

```python
from backend.core.permission_check import ensure_permission
from backend.core.auth_deps import get_current_user

@router.post("/complex-action")
async def complex_action(
    action_type: str,
    current_user: dict = Depends(get_current_user)
):
    # Dynamic permission check based on action_type
    if action_type == "delete":
        await ensure_permission(current_user, "sales.delete_button.access")
    elif action_type == "edit":
        await ensure_permission(current_user, "sales.edit_button.access")
    
    # Rest of logic
    ...
```

### 5. Checking Permissions Without Raising Exceptions

Use `check_permission()` for conditional logic:

```python
from backend.core.permission_check import check_permission
from backend.core.auth_deps import get_current_user

@router.get("/dashboard")
async def get_dashboard(current_user: dict = Depends(get_current_user)):
    user_id = current_user.get("employee_id") or current_user.get("user_id")
    user_role = current_user.get("role")
    
    # Build response based on permissions
    response = {"basic_data": get_basic_data()}
    
    if check_permission(user_id, "sales.report_tab.access", user_role):
        response["reports"] = get_reports()
    
    if check_permission(user_id, "admin_review.page.access", user_role):
        response["admin_data"] = get_admin_data()
    
    return response
```

## Permission Key Naming Convention

Use a consistent naming pattern for permission resource keys:

```
<module>.<resource>.<action>
```

### Examples:
- `sales.page.access` - Access to sales page
- `sales.delete_button.access` - Can delete sales records
- `sales.edit_button.access` - Can edit sales records
- `sales.report_tab.access` - Can view sales reports
- `admin_review.page.access` - Access to admin review page
- `settings.page.access` - Access to settings page
- `employees.create.access` - Can create employees
- `inventory.update.access` - Can update inventory

## Frontend Integration

### 1. Store Permissions on Login

When user logs in, store the permissions list:

```typescript
// On successful login
const loginResponse = await api.post('/auth/token', credentials);
const { access_token, permissions, role } = loginResponse.data;

// Store in Redux
dispatch(setPermissions(permissions));
dispatch(setUserRole(role));

// Or LocalStorage
localStorage.setItem('permissions', JSON.stringify(permissions));
localStorage.setItem('userRole', role);
```

### 2. Create Permission Hook

```typescript
// hooks/usePermission.ts
import { useSelector } from 'react-redux';

export const usePermission = (permissionKey: string): boolean => {
  const permissions = useSelector((state) => state.auth.permissions);
  const role = useSelector((state) => state.auth.role);
  
  // MD users have all permissions
  if (role?.toLowerCase() === 'md') {
    return true;
  }
  
  return permissions?.includes(permissionKey) || false;
};

export const useAnyPermission = (permissionKeys: string[]): boolean => {
  const permissions = useSelector((state) => state.auth.permissions);
  const role = useSelector((state) => state.auth.role);
  
  if (role?.toLowerCase() === 'md') {
    return true;
  }
  
  return permissionKeys.some(key => permissions?.includes(key));
};

export const useAllPermissions = (permissionKeys: string[]): boolean => {
  const permissions = useSelector((state) => state.auth.permissions);
  const role = useSelector((state) => state.auth.role);
  
  if (role?.toLowerCase() === 'md') {
    return true;
  }
  
  return permissionKeys.every(key => permissions?.includes(key));
};
```

### 3. Conditionally Render UI Elements

```typescript
import { usePermission } from '@/hooks/usePermission';

const SalesPage = () => {
  const canDelete = usePermission('sales.delete_button.access');
  const canEdit = usePermission('sales.edit_button.access');
  const canViewReports = usePermission('sales.report_tab.access');
  
  return (
    <div>
      <SalesList />
      
      {canEdit && <EditButton />}
      {canDelete && <DeleteButton />}
      {canViewReports && <ReportsTab />}
    </div>
  );
};
```

### 4. Permission-Based Component Wrapper

```typescript
// components/PermissionGate.tsx
import { usePermission } from '@/hooks/usePermission';

interface PermissionGateProps {
  permission: string;
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

export const PermissionGate: React.FC<PermissionGateProps> = ({
  permission,
  children,
  fallback = null
}) => {
  const hasPermission = usePermission(permission);
  
  return hasPermission ? <>{children}</> : <>{fallback}</>;
};

// Usage
<PermissionGate permission="sales.delete_button.access">
  <DeleteButton />
</PermissionGate>
```

## Examples: Securing Common Endpoints

### Sales Module

```python
from fastapi import APIRouter, Depends
from backend.core.permission_check import require_permission

router = APIRouter(prefix="/sales", tags=["sales"])

@router.get("/")
async def list_sales(current_user = Depends(get_current_user)):
    # No permission check - all authenticated users can list sales
    ...

@router.get(
    "/reports",
    dependencies=[Depends(require_permission("sales.report_tab.access"))]
)
async def get_sales_reports():
    ...

@router.put(
    "/{sale_id}",
    dependencies=[Depends(require_permission("sales.edit_button.access"))]
)
async def update_sale(sale_id: int, data: dict):
    ...

@router.delete(
    "/{sale_id}",
    dependencies=[Depends(require_permission("sales.delete_button.access"))]
)
async def delete_sale(sale_id: int):
    ...
```

### Admin Module

```python
from fastapi import APIRouter, Depends
from backend.core.permission_check import require_permission

router = APIRouter(prefix="/admin", tags=["admin"])

@router.get(
    "/review",
    dependencies=[Depends(require_permission("admin_review.page.access"))]
)
async def admin_review():
    ...

@router.get(
    "/settings",
    dependencies=[Depends(require_permission("settings.page.access"))]
)
async def get_settings():
    ...
```

### Employee Module

```python
from fastapi import APIRouter, Depends
from backend.core.permission_check import require_permission

router = APIRouter(prefix="/employees", tags=["employees"])

@router.get("/")
async def list_employees(current_user = Depends(get_current_user)):
    # All authenticated users can list employees
    ...

@router.post(
    "/",
    dependencies=[Depends(require_permission("employees.create.access"))]
)
async def create_employee(data: dict):
    ...

@router.delete(
    "/{employee_id}",
    dependencies=[Depends(require_permission("employees.delete.access"))]
)
async def delete_employee(employee_id: int):
    ...
```

## MD User Behavior

MD (Managing Director) users automatically bypass all permission checks:
- `role == "md"` → All permissions granted
- No need to populate `employee_permission` for MD users
- Backend automatically returns all available permissions for MD users on login

## Database Setup

### 1. Create Global Permissions

```sql
-- Insert global permissions (user_id = NULL)
INSERT INTO permissions (resource_key, user_id) VALUES
  ('sales.page.access', NULL),
  ('sales.delete_button.access', NULL),
  ('sales.edit_button.access', NULL),
  ('sales.report_tab.access', NULL),
  ('admin_review.page.access', NULL),
  ('settings.page.access', NULL),
  ('employees.create.access', NULL),
  ('employees.delete.access', NULL),
  ('inventory.create.access', NULL),
  ('inventory.update.access', NULL);
```

### 2. Grant Permissions to Employee

```sql
-- Grant specific permissions to employee_id = 5
INSERT INTO employee_permission (employee_id, permission_id, can_access) 
SELECT 5, id, true 
FROM permissions 
WHERE resource_key IN (
  'sales.page.access',
  'sales.edit_button.access',
  'sales.report_tab.access'
);
```

### 3. Revoke Permission

```sql
-- Revoke delete permission from employee_id = 5
UPDATE employee_permission 
SET can_access = false 
WHERE employee_id = 5 
  AND permission_id = (SELECT id FROM permissions WHERE resource_key = 'sales.delete_button.access');
```

## Error Responses

When a user lacks required permission:

```json
{
  "detail": "Access denied. You do not have permission to perform this action. Required permission: sales.delete_button.access"
}
```

HTTP Status: `403 Forbidden`

## Testing Permissions

### Manual Testing

1. Create test employee
2. Grant specific permissions in `employee_permission`
3. Login as that employee
4. Verify:
   - Frontend hides protected UI elements
   - Backend blocks unauthorized API calls with 403

### Automated Testing

```python
import pytest
from fastapi.testclient import TestClient

def test_delete_without_permission(client: TestClient):
    # Login as employee without delete permission
    login_response = client.post("/auth/employee/token", data={
        "email": "employee@test.com",
        "password": "testpass"
    })
    token = login_response.json()["access_token"]
    
    # Try to delete
    response = client.delete(
        "/sales/123",
        headers={"Authorization": f"Bearer {token}"}
    )
    
    assert response.status_code == 403
    assert "permission" in response.json()["detail"].lower()

def test_delete_with_permission(client: TestClient):
    # Login as employee WITH delete permission
    login_response = client.post("/auth/employee/token", data={
        "email": "admin@test.com",
        "password": "testpass"
    })
    token = login_response.json()["access_token"]
    
    # Delete should succeed
    response = client.delete(
        "/sales/123",
        headers={"Authorization": f"Bearer {token}"}
    )
    
    assert response.status_code == 200
```

## Best Practices

1. **Fail-Safe**: Always check permissions on backend, even if frontend hides buttons
2. **Consistent Keys**: Use the naming convention `<module>.<resource>.<action>`
3. **Granular Permissions**: Create specific permissions (e.g., separate `edit` and `delete`)
4. **Document Permissions**: Keep a master list of all permission keys
5. **Test Thoroughly**: Test both allowed and denied scenarios
6. **MD Bypass**: Remember MD users bypass all checks - don't accidentally restrict them
7. **Frontend Sync**: Keep frontend permission checks in sync with backend dependencies

## Migration Checklist

For each existing route that needs protection:

- [ ] Identify the permission key needed
- [ ] Add permission to `permissions` table if it doesn't exist
- [ ] Add `dependencies=[Depends(require_permission("..."))]` to route decorator
- [ ] Update frontend to conditionally render related UI elements
- [ ] Test with employee account that has permission
- [ ] Test with employee account that lacks permission
- [ ] Test with MD account (should always work)

## Support

For questions or issues with the permission system:
1. Check this guide first
2. Review `backend/core/permission_check.py` implementation
3. Verify database schema for `permissions` and `employee_permission` tables
4. Check login response includes `permissions` array
