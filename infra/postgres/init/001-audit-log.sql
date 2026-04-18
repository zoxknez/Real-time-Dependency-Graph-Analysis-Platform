-- ═══════════════════════════════════════════════════════════════
-- Audit Log Schema for IDP Platform
-- Based on OWASP Logging Cheat Sheet: https://cheatsheetseries.owasp.org/cheatsheets/Logging_Cheat_Sheet.html
-- ═══════════════════════════════════════════════════════════════

-- Create audit_log table
CREATE TABLE IF NOT EXISTS audit_log (
    id BIGSERIAL PRIMARY KEY,
    
    -- Identity
    user_id UUID,
    tenant_id UUID,
    org_id UUID,
    
    -- Action details
    action VARCHAR(100) NOT NULL,
    resource VARCHAR(255),
    resource_id VARCHAR(255),
    
    -- Request context
    ip_address INET,
    user_agent TEXT,
    request_id UUID,
    trace_id VARCHAR(64),
    
    -- Additional metadata
    metadata JSONB DEFAULT '{}',
    
    -- Status
    status VARCHAR(20) DEFAULT 'success',
    error_message TEXT,
    
    -- Timing
    created_at TIMESTAMPTZ DEFAULT NOW(),
    duration_ms INTEGER
);

-- Create indexes for common queries
CREATE INDEX idx_audit_log_user_id ON audit_log(user_id) WHERE user_id IS NOT NULL;
CREATE INDEX idx_audit_log_tenant_id ON audit_log(tenant_id) WHERE tenant_id IS NOT NULL;
CREATE INDEX idx_audit_log_created_at ON audit_log(created_at DESC);
CREATE INDEX idx_audit_log_action ON audit_log(action);
CREATE INDEX idx_audit_log_resource ON audit_log(resource) WHERE resource IS NOT NULL;
CREATE INDEX idx_audit_log_status ON audit_log(status);
CREATE INDEX idx_audit_log_trace_id ON audit_log(trace_id) WHERE trace_id IS NOT NULL;

-- Create composite index for tenant + time range queries
CREATE INDEX idx_audit_log_tenant_time ON audit_log(tenant_id, created_at DESC) WHERE tenant_id IS NOT NULL;

-- Create GIN index for JSONB metadata searches
CREATE INDEX idx_audit_log_metadata ON audit_log USING GIN(metadata);

-- Add table comment
COMMENT ON TABLE audit_log IS 'Audit trail for all API operations and security events';

-- Add column comments
COMMENT ON COLUMN audit_log.user_id IS 'User who performed the action';
COMMENT ON COLUMN audit_log.tenant_id IS 'Tenant context for multi-tenancy';
COMMENT ON COLUMN audit_log.action IS 'Action performed (e.g., package.search, user.login)';
COMMENT ON COLUMN audit_log.resource IS 'Resource type affected (e.g., package, user)';
COMMENT ON COLUMN audit_log.resource_id IS 'Specific resource identifier';
COMMENT ON COLUMN audit_log.trace_id IS 'Distributed tracing ID for correlation';
COMMENT ON COLUMN audit_log.metadata IS 'Additional context as JSON';
COMMENT ON COLUMN audit_log.status IS 'Operation status: success, failure, error';
COMMENT ON COLUMN audit_log.duration_ms IS 'Operation duration in milliseconds';

-- Create function for automatic partitioning (optional, for high-volume)
-- Partitions by month for efficient archival
CREATE OR REPLACE FUNCTION create_audit_log_partition()
RETURNS void AS $$
DECLARE
    partition_date DATE;
    partition_name TEXT;
    start_date DATE;
    end_date DATE;
BEGIN
    -- Create partition for next month
    partition_date := DATE_TRUNC('month', NOW() + INTERVAL '1 month');
    partition_name := 'audit_log_' || TO_CHAR(partition_date, 'YYYY_MM');
    start_date := partition_date;
    end_date := partition_date + INTERVAL '1 month';
    
    -- Check if partition already exists
    IF NOT EXISTS (
        SELECT 1 FROM pg_class WHERE relname = partition_name
    ) THEN
        EXECUTE format(
            'CREATE TABLE %I PARTITION OF audit_log FOR VALUES FROM (%L) TO (%L)',
            partition_name, start_date, end_date
        );
        RAISE NOTICE 'Created partition: %', partition_name;
    END IF;
END;
$$ LANGUAGE plpgsql;

-- Grant permissions
GRANT SELECT, INSERT ON audit_log TO idp;
GRANT USAGE, SELECT ON SEQUENCE audit_log_id_seq TO idp;

-- Insert initial audit entry
INSERT INTO audit_log (action, resource, status, metadata) 
VALUES (
    'system.init',
    'audit_log',
    'success',
    '{"message": "Audit log schema initialized", "version": "1.0.0"}'::jsonb
);

-- Made with Bob
