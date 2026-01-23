-- Migration: Audit Log System with Partitioning and Retention Policy
--
-- This implements a complete audit logging system with:
-- - Monthly partitions for efficient data management
-- - Configurable retention per tenant (default: 90 days)
-- - Indexes optimized for common query patterns
-- - Automatic partition creation for 12 months ahead

-- ============================================================================
-- Tenant Settings Table (if not exists)
-- ============================================================================

CREATE TABLE IF NOT EXISTS tenant_settings (
    tenant_id UUID PRIMARY KEY,
    audit_retention_days INT DEFAULT 90,
    rate_limit_tier VARCHAR(20) DEFAULT 'standard',
    max_packages INT DEFAULT 10000,
    max_versions_per_package INT DEFAULT 100,
    features JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE tenant_settings IS 'Per-tenant configuration settings including audit retention';

-- ============================================================================
-- Audit Log Table (Partitioned by Month)
-- ============================================================================

CREATE TABLE IF NOT EXISTS audit_log (
    id UUID DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    user_id UUID,
    action VARCHAR(100) NOT NULL,
    resource_type VARCHAR(50) NOT NULL,
    resource_id VARCHAR(255),
    old_value JSONB,
    new_value JSONB,
    metadata JSONB DEFAULT '{}',
    ip_address INET,
    user_agent TEXT,
    request_id UUID,
    duration_ms INT,
    status_code SMALLINT,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    
    PRIMARY KEY (id, created_at)
) PARTITION BY RANGE (created_at);

COMMENT ON TABLE audit_log IS 'Audit trail for all significant operations, partitioned by month';

-- ============================================================================
-- Create Partitions for Current and Next 12 Months
-- ============================================================================

DO $$
DECLARE
    start_date DATE := date_trunc('month', CURRENT_DATE);
    end_date DATE;
    partition_name TEXT;
BEGIN
    FOR i IN 0..12 LOOP
        end_date := start_date + INTERVAL '1 month';
        partition_name := 'audit_log_' || to_char(start_date, 'YYYY_MM');
        
        -- Check if partition already exists
        IF NOT EXISTS (
            SELECT 1 FROM pg_tables 
            WHERE tablename = partition_name 
            AND schemaname = 'public'
        ) THEN
            EXECUTE format(
                'CREATE TABLE %I PARTITION OF audit_log
                 FOR VALUES FROM (%L) TO (%L)',
                partition_name, start_date, end_date
            );
            RAISE NOTICE 'Created partition: %', partition_name;
        END IF;
        
        start_date := end_date;
    END LOOP;
END $$;

-- ============================================================================
-- Indexes for Common Query Patterns
-- ============================================================================

-- Tenant + time range (most common query)
CREATE INDEX IF NOT EXISTS idx_audit_tenant_created 
    ON audit_log (tenant_id, created_at DESC);

-- Resource lookup (find all changes to specific resource)
CREATE INDEX IF NOT EXISTS idx_audit_resource 
    ON audit_log (resource_type, resource_id, created_at DESC);

-- User activity (compliance/investigation)
CREATE INDEX IF NOT EXISTS idx_audit_user 
    ON audit_log (user_id, created_at DESC) 
    WHERE user_id IS NOT NULL;

-- Request correlation
CREATE INDEX IF NOT EXISTS idx_audit_request 
    ON audit_log (request_id) 
    WHERE request_id IS NOT NULL;

-- Action type filtering
CREATE INDEX IF NOT EXISTS idx_audit_action 
    ON audit_log (action, created_at DESC);

-- ============================================================================
-- Retention Policy Function
-- ============================================================================

CREATE OR REPLACE FUNCTION cleanup_old_audit_logs()
RETURNS TABLE (tenant_id UUID, deleted_count BIGINT) AS $$
DECLARE
    tenant_record RECORD;
    total_deleted BIGINT := 0;
    tenant_deleted BIGINT;
BEGIN
    -- Loop through each tenant with custom retention
    FOR tenant_record IN 
        SELECT 
            ts.tenant_id,
            COALESCE(ts.audit_retention_days, 90) AS retention_days
        FROM tenant_settings ts
    LOOP
        -- Delete old audit logs for this tenant
        WITH deleted AS (
            DELETE FROM audit_log al
            WHERE al.tenant_id = tenant_record.tenant_id
              AND al.created_at < NOW() - (tenant_record.retention_days || ' days')::INTERVAL
            RETURNING 1
        )
        SELECT COUNT(*) INTO tenant_deleted FROM deleted;
        
        IF tenant_deleted > 0 THEN
            total_deleted := total_deleted + tenant_deleted;
            RETURN QUERY SELECT tenant_record.tenant_id, tenant_deleted;
        END IF;
    END LOOP;
    
    -- Also clean up orphaned logs (tenant_id not in tenant_settings) older than 90 days
    WITH deleted AS (
        DELETE FROM audit_log al
        WHERE al.created_at < NOW() - INTERVAL '90 days'
          AND NOT EXISTS (
              SELECT 1 FROM tenant_settings ts WHERE ts.tenant_id = al.tenant_id
          )
        RETURNING 1
    )
    SELECT COUNT(*) INTO tenant_deleted FROM deleted;
    
    IF tenant_deleted > 0 THEN
        total_deleted := total_deleted + tenant_deleted;
        RETURN QUERY SELECT NULL::UUID, tenant_deleted;
    END IF;
    
    RAISE NOTICE 'Audit log cleanup complete. Total deleted: %', total_deleted;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION cleanup_old_audit_logs() IS 
    'Removes audit logs older than retention period (per tenant). Run daily via scheduler.';

-- ============================================================================
-- Function to Create Future Partitions (run monthly)
-- ============================================================================

CREATE OR REPLACE FUNCTION create_future_audit_partitions(months_ahead INT DEFAULT 3)
RETURNS void AS $$
DECLARE
    start_date DATE;
    end_date DATE;
    partition_name TEXT;
BEGIN
    start_date := date_trunc('month', CURRENT_DATE + (INTERVAL '1 month' * months_ahead));
    
    FOR i IN 0..months_ahead LOOP
        end_date := start_date + INTERVAL '1 month';
        partition_name := 'audit_log_' || to_char(start_date, 'YYYY_MM');
        
        IF NOT EXISTS (
            SELECT 1 FROM pg_tables 
            WHERE tablename = partition_name AND schemaname = 'public'
        ) THEN
            EXECUTE format(
                'CREATE TABLE %I PARTITION OF audit_log
                 FOR VALUES FROM (%L) TO (%L)',
                partition_name, start_date, end_date
            );
            RAISE NOTICE 'Created future partition: %', partition_name;
        END IF;
        
        start_date := start_date - INTERVAL '1 month';
    END LOOP;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- Function to Drop Old Empty Partitions
-- ============================================================================

CREATE OR REPLACE FUNCTION drop_empty_old_partitions()
RETURNS void AS $$
DECLARE
    partition_record RECORD;
    oldest_date DATE := CURRENT_DATE - INTERVAL '6 months';
BEGIN
    -- Find partitions older than 6 months that are empty
    FOR partition_record IN
        SELECT 
            child.relname AS partition_name,
            pg_relation_size(child.oid) AS size_bytes
        FROM pg_inherits
        JOIN pg_class parent ON pg_inherits.inhparent = parent.oid
        JOIN pg_class child ON pg_inherits.inhrelid = child.oid
        WHERE parent.relname = 'audit_log'
          AND child.relname LIKE 'audit_log_%'
    LOOP
        -- Only drop if empty and older than retention
        IF partition_record.size_bytes = 0 THEN
            -- Check if it's an old partition by parsing name
            DECLARE
                partition_date DATE;
            BEGIN
                partition_date := to_date(
                    substring(partition_record.partition_name from 'audit_log_(.*)'),
                    'YYYY_MM'
                );
                
                IF partition_date < oldest_date THEN
                    EXECUTE format('DROP TABLE IF EXISTS %I', partition_record.partition_name);
                    RAISE NOTICE 'Dropped empty partition: %', partition_record.partition_name;
                END IF;
            EXCEPTION WHEN OTHERS THEN
                -- Skip if can't parse name
                NULL;
            END;
        END IF;
    END LOOP;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- Verification
-- ============================================================================

DO $$
DECLARE
    partition_count INT;
BEGIN
    SELECT COUNT(*) INTO partition_count
    FROM pg_inherits
    JOIN pg_class parent ON pg_inherits.inhparent = parent.oid
    JOIN pg_class child ON pg_inherits.inhrelid = child.oid
    WHERE parent.relname = 'audit_log';
    
    RAISE NOTICE 'Audit log system created with % partitions', partition_count;
END;
$$;
