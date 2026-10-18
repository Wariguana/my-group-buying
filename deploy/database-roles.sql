-- Run only by the isolated environment database owner. No passwords in this file.
-- Provision LOGIN secrets separately via the platform secret manager.
CREATE ROLE qbuy_migrator NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE;
CREATE ROLE qbuy_app NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE;
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
-- Revoke PUBLIC database CONNECT/TEMP privileges and grant CONNECT to the exact
-- login roles separately using the selected database name (provider-specific).
GRANT USAGE, CREATE ON SCHEMA public TO qbuy_migrator;
GRANT USAGE ON SCHEMA public TO qbuy_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO qbuy_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO qbuy_app;
ALTER DEFAULT PRIVILEGES FOR ROLE qbuy_migrator IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO qbuy_app;
ALTER DEFAULT PRIVILEGES FOR ROLE qbuy_migrator IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO qbuy_app;
-- Apply after migrate deploy; repeat after any new audit tables are introduced.
REVOKE ALL ON "_prisma_migrations" FROM qbuy_app;
REVOKE UPDATE, DELETE, TRUNCATE ON "CheckoutAudit", "InventoryMovement", "QbShipmentEvent", "FulfillmentAdjustment", "GroupBuyDeadlineHistory", "BankReceipt", "ConfigurationAudit" FROM qbuy_app;
-- The migrator must own all app objects; runtime must never inherit its role.
