-- Migration 0008: Partial index for open/active storefront orders
-- SQLite cannot skip completed/cancelled/rejected rows using `status NOT IN (...)` on a standard B-tree index.
-- This partial index keeps active-order polls O(open_orders) regardless of historical completed order volume.
CREATE INDEX IF NOT EXISTS idx_storefront_orders_open_poll
  ON storefront_orders(storefront_id, pharmacy_id, created_at DESC)
  WHERE status NOT IN ('completed', 'cancelled', 'rejected');
