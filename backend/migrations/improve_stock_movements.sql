-- Migration: Improve stock_movements table schema
-- Removes duplicates and normalizes the structure

-- 1. Create the improved table structure
CREATE TABLE stock_movements_improved (
  id SERIAL PRIMARY KEY,
  user_id INT NOT NULL,
  transfer_type VARCHAR(50) NOT NULL CHECK (transfer_type IN ('warehouse_transfer', 'customer_sale', 'stockout')),
  
  -- Item & Warehouse Info
  item_id INT NOT NULL,
  item_name VARCHAR(255) NOT NULL,
  source_warehouse VARCHAR(255) NOT NULL,
  destination_warehouse VARCHAR(255), -- NULL for customer_sale/stockout
  
  -- Quantity (single field instead of quantity/quantity_out/quantity_in)
  quantity INT NOT NULL CHECK (quantity > 0),
  
  -- Tracking
  issued_by VARCHAR(255),
  received_by VARCHAR(255), -- NULL for stockout
  status VARCHAR(50) DEFAULT 'completed' CHECK (status IN ('pending', 'completed', 'cancelled')),
  
  -- Metadata
  notes TEXT,
  movement_date TIMESTAMP NOT NULL DEFAULT NOW(),
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- 2. Create indexes for performance
CREATE INDEX idx_stock_movements_user ON stock_movements_improved(user_id);
CREATE INDEX idx_stock_movements_type ON stock_movements_improved(transfer_type);
CREATE INDEX idx_stock_movements_date ON stock_movements_improved(movement_date);
CREATE INDEX idx_stock_movements_item ON stock_movements_improved(item_id);
CREATE INDEX idx_stock_movements_source ON stock_movements_improved(source_warehouse);

-- 3. Migrate existing data from old stock_movements table
INSERT INTO stock_movements_improved (
  user_id,
  transfer_type,
  item_id,
  item_name,
  source_warehouse,
  destination_warehouse,
  quantity,
  issued_by,
  received_by,
  status,
  notes,
  movement_date,
  created_at
)
SELECT 
  user_id,
  COALESCE(transfer_type, 'warehouse_transfer') as transfer_type,
  COALESCE(item_id, inventory_id) as item_id,
  COALESCE(item_name_from, item_name_to) as item_name,
  from_store as source_warehouse,
  to_store as destination_warehouse,
  COALESCE(quantity, quantity_out, quantity_in) as quantity,
  issued_by,
  received_by,
  COALESCE(status, 'completed') as status,
  details as notes,
  COALESCE(movement_date, date, created_at, NOW()) as movement_date,
  COALESCE(created_at, NOW()) as created_at
FROM stock_movements
WHERE user_id IS NOT NULL 
  AND (item_id IS NOT NULL OR inventory_id IS NOT NULL)
  AND from_store IS NOT NULL;

-- 4. After verification, rename tables
-- BACKUP: pg_dump your database first!
-- DROP TABLE stock_movements;
-- ALTER TABLE stock_movements_improved RENAME TO stock_movements;

-- 5. Add documentation
COMMENT ON TABLE stock_movements_improved IS 'Tracks all stock movements: warehouse transfers, customer sales, and stockouts';
COMMENT ON COLUMN stock_movements_improved.transfer_type IS 'Type: warehouse_transfer, customer_sale, or stockout';
COMMENT ON COLUMN stock_movements_improved.source_warehouse IS 'Warehouse where stock is leaving from';
COMMENT ON COLUMN stock_movements_improved.destination_warehouse IS 'Destination warehouse (NULL for customer_sale/stockout)';
COMMENT ON COLUMN stock_movements_improved.notes IS 'Additional details, REQUIRED for stockout to explain write-off reason';
