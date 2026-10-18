CREATE TABLE "WorkerHeartbeat" (
 "name" VARCHAR(40) PRIMARY KEY,
 "lastSuccessAt" TIMESTAMPTZ(3),
 "lastFailureAt" TIMESTAMPTZ(3),
 "lastError" VARCHAR(40),
 "processed" INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE "RequestRateLimit" (
 "key" VARCHAR(64) PRIMARY KEY,
 "windowStart" TIMESTAMPTZ(3) NOT NULL,
 "count" INTEGER NOT NULL
);
CREATE INDEX "RequestRateLimit_windowStart_idx" ON "RequestRateLimit"("windowStart");

CREATE TABLE "ConfigurationAudit" (
 "id" UUID PRIMARY KEY,
 "actorId" UUID NOT NULL,
 "operation" VARCHAR(40) NOT NULL,
 "target" VARCHAR(120) NOT NULL,
 "fingerprint" VARCHAR(64) NOT NULL,
 "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE FUNCTION qbuy_configuration_audit_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Configuration audit is append-only'; END;
$$;
CREATE TRIGGER configuration_audit_immutable BEFORE UPDATE OR DELETE ON "ConfigurationAudit"
FOR EACH ROW EXECUTE FUNCTION qbuy_configuration_audit_immutable();
