-- ============================================================================
-- Migration 0012: Free-Tier Orders Version Counter + storefront_orders Index Diet
-- ============================================================================
-- 1. `storefronts.orders_version` — a monotonically increasing per-tenant counter
--    bumped (by trigger) on EVERY storefront_orders INSERT / UPDATE / DELETE.
--    POS + Owner Portal notification polls send `?v=<orders_version>` and get an
--    `{ unchanged: true }` answer for 1 PK row read instead of re-scanning orders.
--    Triggers (instead of app-level bumps) guarantee correctness for every write
--    path (public checkout, POS ack, owner portal, customer cancel, future code)
--    inside the same implicit transaction as the order write.
--    Cost: +1 row written per order mutation (orders_version is NOT indexed, so
--    no storefronts index entries are touched).
--
-- 2. storefront_orders had 9 indexes; every INSERT/UPDATE wrote all of them.
--    Hot-query → index map AFTER this migration:
--      PK (id)                                      → ack / PATCH / tracking by id
--      UNIQUE(storefront_id, order_number)          → order tracking + review lookup
--      idx_storefront_orders_idemp (partial)        → checkout idempotency
--      idx_storefront_orders_open_poll (partial)    → notifications + inbox view=active
--      idx_storefront_orders_tenant_cursor          → inbox/portal list ORDER BY created_at DESC,
--                                                     from/to ranges, 30-day summaries
--      idx_storefront_orders_sf_updated (NEW)       → inbox `since=<updated_at>` delta cursor
--    Dropped (redundant / low-selectivity, served by the above + residual filter):
--      idx_storefront_orders_pos_handoff, idx_storefront_orders_status_updated,
--      idx_storefront_orders_payment_status, idx_storefront_orders_active_poll
--    9 → 6 indexes.
-- ============================================================================

ALTER TABLE storefronts ADD COLUMN orders_version INTEGER NOT NULL DEFAULT 0;

DROP INDEX IF EXISTS idx_storefront_orders_pos_handoff;
DROP INDEX IF EXISTS idx_storefront_orders_status_updated;
DROP INDEX IF EXISTS idx_storefront_orders_payment_status;
DROP INDEX IF EXISTS idx_storefront_orders_active_poll;

CREATE INDEX IF NOT EXISTS idx_storefront_orders_sf_updated
  ON storefront_orders(storefront_id, updated_at);

CREATE TRIGGER IF NOT EXISTS trg_storefront_orders_version_ins
AFTER INSERT ON storefront_orders
BEGIN
  UPDATE storefronts SET orders_version = orders_version + 1 WHERE id = NEW.storefront_id;
END;

CREATE TRIGGER IF NOT EXISTS trg_storefront_orders_version_upd
AFTER UPDATE ON storefront_orders
BEGIN
  UPDATE storefronts SET orders_version = orders_version + 1 WHERE id = NEW.storefront_id;
END;

CREATE TRIGGER IF NOT EXISTS trg_storefront_orders_version_del
AFTER DELETE ON storefront_orders
BEGIN
  UPDATE storefronts SET orders_version = orders_version + 1 WHERE id = OLD.storefront_id;
END;
