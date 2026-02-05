-- Seed data for audit_log table
INSERT INTO audit_log (tenant_id, action, resource_type, resource_id, metadata, status_code) VALUES 
('00000000-0000-0000-0000-000000000001', 'SECURITY_SCAN', 'PACKAGE', 'lodash@4.17.21', '{"severity": "high", "findings": 3}', 200),
('00000000-0000-0000-0000-000000000001', 'POLICY_EVALUATION', 'POLICY', 'security-policy-v1', '{"passed": true}', 200),
('00000000-0000-0000-0000-000000000001', 'VULNERABILITY_DETECTED', 'PACKAGE', 'axios@0.21.0', '{"cve": "CVE-2021-3749", "severity": "critical"}', 200),
('00000000-0000-0000-0000-000000000001', 'DEPENDENCY_UPDATE', 'PACKAGE', 'react@18.2.0', '{"from": "17.0.2", "to": "18.2.0"}', 200),
('00000000-0000-0000-0000-000000000001', 'COMPLIANCE_CHECK', 'REPORT', 'monthly-audit-jan-2026', '{"status": "compliant", "score": 98}', 200),
('00000000-0000-0000-0000-000000000001', 'LICENSE_SCAN', 'PACKAGE', 'express@4.18.2', '{"license": "MIT", "compatible": true}', 200),
('00000000-0000-0000-0000-000000000001', 'SBOM_GENERATED', 'REPORT', 'sbom-cyclonedx-v1', '{"format": "CycloneDX", "components": 156}', 200),
('00000000-0000-0000-0000-000000000001', 'ACCESS_GRANTED', 'USER', 'admin@example.com', '{"role": "admin", "scope": "all"}', 200),
('00000000-0000-0000-0000-000000000001', 'BREAKING_CHANGE_DETECTED', 'PACKAGE', 'typescript@5.0.0', '{"from": "4.9.5", "breaking": ["enum changes"]}', 200),
('00000000-0000-0000-0000-000000000001', 'SLSA_VERIFICATION', 'PACKAGE', 'openssl@3.0.0', '{"slsa_level": 3, "verified": true}', 200);
