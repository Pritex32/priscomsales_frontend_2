# B2B Stock Movement System - Implementation Guide

## Overview
This system handles three types of stock movements in a multi-warehouse ERP environment:
1. **Warehouse to Warehouse** - Internal transfers between warehouses
2. **Warehouse to Customer** - Sales/deliveries to customers
3. **Stockout (Write-off)** - Damaged, expired, or lost inventory

---

## Schema Improvements

### Problems with Original Schema
The original `stock_movements` table had several issues:

**Duplicate Fields:**
- `quantity`, `quantity_out`, `quantity_in` (3 fields for same data)
- `movement_date`, `date`, `created_at` (confusing timestamps)
- `stock_id`, `inventory_id`, `item_id` (overlapping identifiers)
- `item_name_from`, `item_name_to` (rarely different)

**Unclear Purpose:**
- Fields like `to_store` populated for stockouts (should be NULL)
- No clear transfer type differentiation

### Improved Schema

```sql
CREATE TABLE stock_movements_improved (
  id SERIAL PRIMARY KEY,
  user_id INT NOT NULL,
  transfer_type VARCHAR(50) CHECK (transfer_type IN 
    ('warehouse_transfer', 'customer_sale', 'stockout')),
  
  -- Item & Warehouse
  item_id INT NOT NULL,
  item_name VARCHAR(255) NOT NULL,
  source_warehouse VARCHAR(255) NOT NULL,
  destination_warehouse VARCHAR(255), -- NULL for customer_sale/stockout
  
  -- Quantity (single unified field)
  quantity INT NOT NULL CHECK (quantity > 0),
  
  -- Tracking
  issued_by VARCHAR(255),
  received_by VARCHAR(255), -- NULL for stockout
  status VARCHAR(50) DEFAULT 'completed',
  
  -- Metadata
  notes TEXT, -- REQUIRED for stockout
  movement_date TIMESTAMP NOT NULL DEFAULT NOW(),
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
```

**Key Changes:**
- Single `quantity` field (removed quantity_out/quantity_in)
- Renamed `from_store` → `source_warehouse`, `to_store` → `destination_warehouse`
- Renamed `details` → `notes` (clearer purpose)
- Removed `date` field (use movement_date)
- Added CHECK constraints for data integrity
- Removed redundant `stock_id` and `inventory_id`

---

## Transfer Type Logic

### 1. Warehouse to Warehouse Transfer

**Use Case:** Moving stock between warehouses (e.g., rebalancing inventory)

**Inventory Updates:**
- **Source Warehouse:** `stock_out` += quantity
- **Destination Warehouse:** `supplied_quantity` += quantity

**Required Fields:**
- `source_warehouse` ✓
- `destination_warehouse` ✓ (must be different from source)
- `issued_by` ✓
- `received_by` ✓
- `quantity` > 0

**Validations:**
- Source ≠ Destination
- Source has sufficient stock (closing_balance ≥ quantity)
- Employee has access to both warehouses

**API Endpoint:**
```
POST /b2b/transfer/warehouse
```

**Example Request:**
```json
{
  "transfer_type": "warehouse_transfer",
  "source_warehouse": "Main Warehouse",
  "destination_warehouse": "Branch Store",
  "item_id": 123,
  "item_name": "Product A",
  "quantity": 50,
  "issued_by": "John Doe",
  "received_by": "Jane Smith",
  "notes": "Restocking branch store",
  "movement_date": "2025-10-24"
}
```

---

### 2. Warehouse to Customer (Sale)

**Use Case:** Selling/delivering products to customers

**Inventory Updates:**
- **Source Warehouse:** `stock_out` += quantity
- **Destination:** None (external customer)

**Required Fields:**
- `source_warehouse` ✓
- `destination_warehouse` = NULL
- `issued_by` ✓
- `received_by` = NULL
- `quantity` > 0

**Validations:**
- Source has sufficient stock
- Employee has access to source warehouse

**API Endpoint:**
```
POST /b2b/transfer/customer
```

**Example Request:**
```json
{
  "transfer_type": "customer_sale",
  "source_warehouse": "Main Warehouse",
  "item_id": 123,
  "item_name": "Product A",
  "quantity": 10,
  "issued_by": "Sales Rep",
  "customer_name": "ABC Corp",
  "notes": "Invoice #12345",
  "movement_date": "2025-10-24"
}
```

---

### 3. Stockout (Write-off)

**Use Case:** Recording damaged, expired, lost, or stolen inventory

**Inventory Updates:**
- **Source Warehouse:** `stock_out` += quantity
- **Destination:** None (written off)

**Required Fields:**
- `source_warehouse` ✓
- `destination_warehouse` = NULL
- `issued_by` ✓
- `received_by` = NULL
- `notes` ✓ (MANDATORY - explain write-off reason, min 5 chars)
- `quantity` > 0

**Validations:**
- Source has sufficient stock
- Notes field is REQUIRED (reason for write-off)
- Employee has access to source warehouse

**API Endpoint:**
```
POST /b2b/transfer/stockout
```

**Example Request:**
```json
{
  "transfer_type": "stockout",
  "source_warehouse": "Main Warehouse",
  "item_id": 123,
  "item_name": "Product A",
  "quantity": 5,
  "issued_by": "Warehouse Manager",
  "notes": "Water damage during storage - items unsellable",
  "movement_date": "2025-10-24"
}
```

---

## Validation Rules

### Common Validations (All Transfer Types)
1. **Positive Quantity:** `quantity > 0`
2. **Stock Availability:** `closing_balance >= quantity` in source warehouse
3. **Warehouse Access:** Employee must have permission for involved warehouses
4. **Subscription Limits:** Free plan restrictions enforced
5. **Valid Movement Date:** Date must be valid and not too far in future

### Transfer-Specific Validations

| Validation | Warehouse Transfer | Customer Sale | Stockout |
|-----------|-------------------|---------------|----------|
| Different source/dest | ✓ Required | N/A | N/A |
| Destination warehouse | ✓ Required | ✗ Must be NULL | ✗ Must be NULL |
| Received by | ✓ Required | ✗ Must be NULL | ✗ Must be NULL |
| Notes | Optional | Optional | ✓ REQUIRED (min 5 chars) |

---

## Inventory Balance Calculation

The system uses `inventory_master_log` to track daily balances:

```
closing_balance = open_balance + supplied_quantity + return_quantity - stock_out
```

**For each transfer type:**

### Warehouse Transfer
```
Source:      stock_out += quantity
             closing_balance decreases by quantity

Destination: supplied_quantity += quantity
             closing_balance increases by quantity
```

### Customer Sale
```
Source:      stock_out += quantity
             closing_balance decreases by quantity
```

### Stockout
```
Source:      stock_out += quantity
             closing_balance decreases by quantity
             (permanently removed from inventory)
```

---

## API Endpoints Summary

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/b2b/warehouses` | GET | List accessible warehouses |
| `/b2b/inventory/{warehouse}` | GET | Get items in warehouse |
| `/b2b/transfer/warehouse` | POST | Warehouse-to-warehouse transfer |
| `/b2b/transfer/customer` | POST | Warehouse-to-customer sale |
| `/b2b/transfer/stockout` | POST | Write-off/stockout |
| `/b2b/movements` | GET | List all movements (with filters) |
| `/b2b/movements/export` | GET | Export movements as CSV |

---

## Multi-User & Multi-Warehouse Support

### Role-Based Access Control (RBAC)

**MD (Managing Director):**
- Access to ALL warehouses
- Can perform all transfer types
- Can view all movements

**Employee:**
- Access only to assigned warehouses (via `warehouse_access` table)
- Can only transfer between permitted warehouses
- Can only view movements for their warehouses

### Warehouse Access Check Flow
```
1. Check user role
2. If MD → Grant access
3. If Employee:
   a. Query employees table for employee_id
   b. Query warehouse_access for permitted warehouses
   c. Validate requested warehouse in permitted list
```

---

## Migration Guide

### Step 1: Run Migration SQL
```bash
psql -U your_user -d your_database -f backend/migrations/improve_stock_movements.sql
```

### Step 2: Verify Data Migration
```sql
SELECT COUNT(*) FROM stock_movements_improved;
SELECT COUNT(*) FROM stock_movements;
-- Counts should match
```

### Step 3: Update Application Code
Replace imports in `main.py`:
```python
# OLD
from backend.routes import b2b

# NEW
from backend.routes import b2b_enhanced as b2b
```

### Step 4: Rename Tables (After Testing)
```sql
-- Backup first!
DROP TABLE stock_movements;
ALTER TABLE stock_movements_improved RENAME TO stock_movements;
```

---

## Testing Checklist

- [ ] Warehouse transfer reduces source, increases destination
- [ ] Customer sale reduces source only
- [ ] Stockout reduces source only
- [ ] Negative stock prevented
- [ ] Different warehouses enforced for transfers
- [ ] Notes required for stockout
- [ ] Employee access restrictions work
- [ ] MD has unrestricted access
- [ ] Movements logged correctly
- [ ] CSV export works
- [ ] Filters work (type, warehouse, date range)

---

## Error Handling

| Error Code | Scenario | Message |
|-----------|----------|---------|
| 400 | Insufficient stock | "Insufficient stock: X available in 'Warehouse', Y required" |
| 400 | Same warehouse transfer | "Source and destination warehouses must be different" |
| 400 | Negative quantity | Field validation error |
| 403 | No warehouse access | "You do not have access to this warehouse" |
| 403 | Free plan limit | "Free plan limit reached..." |
| 404 | Item not found | "Item not found in warehouse 'X'" |
| 404 | Employee not found | "Employee not found" |

---

## Best Practices

1. **Always validate stock before transfer** - Prevents overselling
2. **Use atomic transactions** - Ensures consistency across tables
3. **Log all movements** - Creates audit trail
4. **Require detailed notes for write-offs** - Accountability and tracking
5. **Enforce warehouse access** - Security and data segregation
6. **Regular inventory reconciliation** - Match physical stock with system
7. **Use movement_date for backdating** - Allows corrections with proper dating

---

## Future Enhancements

- [ ] Batch transfers (multiple items at once)
- [ ] Approval workflow for large transfers
- [ ] Automatic reorder when stock falls below threshold
- [ ] Transfer cost tracking
- [ ] Real-time notifications for low stock
- [ ] Barcode scanning integration
- [ ] Mobile app support
- [ ] Transfer reversal/cancellation feature
- [ ] Advanced reporting and analytics
- [ ] Integration with accounting systems
