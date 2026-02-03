import { gql } from "@apollo/client";

export const ASK_GEMINI = gql`
  query AskGemini($question: String!, $contextPackages: [ID!]!) {
    askGemini(question: $question, contextPackages: $contextPackages)
  }
`;

export const EXPLAIN_DEPENDENCY_GRAPH = gql`
  query ExplainDependencyGraph($packageId: ID!) {
    explainDependencyGraph(packageId: $packageId)
  }
`;


// ═══════════════════════════════════════════════════════════════
// FRAGMENTS
// ═══════════════════════════════════════════════════════════════

export const PACKAGE_FRAGMENT = gql`
  fragment PackageFields on Package {
    id
    name
    ecosystem
  }
`;

export const PACKAGE_EDGE_FRAGMENT = gql`
  fragment PackageEdgeFields on PackageEdge {
    node {
      ...PackageFields
    }
    cursor
    depth
  }
  ${PACKAGE_FRAGMENT}
`;

// ═══════════════════════════════════════════════════════════════
// QUERIES
// ═══════════════════════════════════════════════════════════════

export const GET_PACKAGE = gql`
  query GetPackage($id: ID!) {
    package(id: $id) {
      ...PackageFields
    }
  }
  ${PACKAGE_FRAGMENT}
`;

export const GET_REVERSE_DEPENDENTS = gql`
  query GetReverseDependents(
    $packageId: ID!
    $maxDepth: Int = 2
    $first: Int = 50
    $after: String
  ) {
    reverseDependents(
      packageId: $packageId
      maxDepth: $maxDepth
      first: $first
      after: $after
    ) {
      edges {
        ...PackageEdgeFields
      }
      pageInfo {
        hasNextPage
        hasPreviousPage
        startCursor
        endCursor
      }
      totalCount
    }
  }
  ${PACKAGE_EDGE_FRAGMENT}
`;

export const GET_DEPENDENCY_PATH = gql`
  query GetDependencyPath(
    $fromPackageId: ID!
    $toPackageId: ID!
    $maxHops: Int = 6
  ) {
    dependencyPath(
      fromPackageId: $fromPackageId
      toPackageId: $toPackageId
      maxHops: $maxHops
    ) {
      found
      hops
      packages {
        ...PackageFields
      }
    }
  }
  ${PACKAGE_FRAGMENT}
`;

export const GET_IMPACT_RADIUS = gql`
  query GetImpactRadius(
    $packageId: ID!
    $vulnerableVersionRange: String
    $maxDepth: Int = 3
    $limit: Int = 100
  ) {
    impactRadius(
      packageId: $packageId
      vulnerableVersionRange: $vulnerableVersionRange
      maxDepth: $maxDepth
      limit: $limit
    ) {
      packageId
      vulnerableVersionRange
      maxDepth
      impactedPackages
      impactedVersions
      topImpacted {
        package {
          ...PackageFields
        }
        depth
        estimatedAffectedVersions
      }
    }
  }
  ${PACKAGE_FRAGMENT}
`;

export const GET_GRAPH_STATS = gql`
  query GetGraphStats {
    graphStats {
      totalPackages
      totalVersions
      totalDependencies
      totalPackageDependencies
      ecosystemBreakdown {
        ecosystem
        count
      }
    }
  }
`;

// ═══════════════════════════════════════════════════════════════
// VULNERABILITY & REACHABILITY QUERIES (P0 Features)
// ═══════════════════════════════════════════════════════════════

export const VULNERABILITY_FINDING_FRAGMENT = gql`
  fragment VulnerabilityFindingFields on VulnerabilityFinding {
    id
    cveId
    ghsaId
    title
    description
    severity
    cvssScore
    epssScore
    inKev
    hasPublicExploit
    affectedPackage {
      ...PackageFields
    }
    affectedVersionRange
    fixedVersion
    reachability {
      status
      confidence
      ruleId
      callPath {
        file
        line
        function
        snippet
      }
      conditions
      analyzedAt
    }
    riskScore {
      total
      breakdown {
        reachability
        exploitSignal
        environment
        cvss
      }
      calculatedAt
    }
    relationship
    introducedBy {
      ...PackageFields
    }
    publishedAt
    updatedAt
  }
  ${PACKAGE_FRAGMENT}
`;

export const GET_TRANSITIVE_PATHS = gql`
  query GetTransitivePaths(
    $packageId: ID!
    $targetPackageId: ID!
    $maxDepth: Int = 6
    $first: Int = 10
  ) {
    transitivePaths(
      packageId: $packageId
      targetPackageId: $targetPackageId
      maxDepth: $maxDepth
      first: $first
    ) {
      target {
        ...PackageFields
      }
      hops
      path {
        ...PackageFields
      }
      introducedBy {
        ...PackageFields
      }
    }
  }
  ${PACKAGE_FRAGMENT}
`;

export const GET_REVERSE_DEPENDENTS_EXTENDED = gql`
  query GetReverseDependentsExtended(
    $packageId: ID!
    $maxDepth: Int = 2
    $relationship: DependencyRelationship
    $first: Int = 50
    $after: String
  ) {
    reverseDependentsExtended(
      packageId: $packageId
      maxDepth: $maxDepth
      relationship: $relationship
      first: $first
      after: $after
    ) {
      edges {
        node {
          ...PackageFields
        }
        cursor
        depth
        relationship
        introducedBy {
          ...PackageFields
        }
      }
      pageInfo {
        hasNextPage
        hasPreviousPage
        startCursor
        endCursor
      }
      totalCount
    }
  }
  ${PACKAGE_FRAGMENT}
`;

export const GET_VULNERABILITY_COUNTS = gql`
  query GetVulnerabilityCounts(
    $packageId: ID!
    $includeTransitive: Boolean = true
  ) {
    vulnerabilityCounts(
      packageId: $packageId
      includeTransitive: $includeTransitive
    ) {
      critical
      high
      medium
      low
    }
  }
`;

export const GET_VULNERABILITIES = gql`
  query GetVulnerabilities(
    $packageId: ID!
    $filter: VulnerabilityFilter
    $first: Int = 20
    $after: String
  ) {
    vulnerabilities(
      packageId: $packageId
      filter: $filter
      first: $first
      after: $after
    ) {
      edges {
        node {
          ...VulnerabilityFindingFields
        }
        cursor
      }
      pageInfo {
        hasNextPage
        endCursor
      }
      totalCount
    }
  }
  ${VULNERABILITY_FINDING_FRAGMENT}
`;

// Search packages by name (fuzzy search)
export const SEARCH_PACKAGES = gql`
  query SearchPackages(
    $query: String!
    $ecosystem: Ecosystem
    $first: Int = 20
    $after: String
  ) {
    searchPackages(
      query: $query
      ecosystem: $ecosystem
      first: $first
      after: $after
    ) {
      edges {
        node {
          ...PackageFields
        }
        cursor
      }
      pageInfo {
        hasNextPage
        endCursor
      }
      totalCount
    }
  }
  ${PACKAGE_FRAGMENT}
`;

// Semantic search packages by meaning (vector search)
export const SEMANTIC_SEARCH_PACKAGES = gql`
  query SemanticSearchPackages(
    $query: String!
    $ecosystem: Ecosystem
    $first: Int = 20
    $after: String
  ) {
    semanticSearchPackages(
      query: $query
      ecosystem: $ecosystem
      first: $first
      after: $after
    ) {
      edges {
        node {
          ...PackageFields
        }
        cursor
        score
      }
      pageInfo {
        hasNextPage
        endCursor
      }
      totalCount
    }
  }
  ${PACKAGE_FRAGMENT}
`;

// Get package with versions and dependencies count
export const GET_PACKAGE_DETAILS = gql`
  query GetPackageDetails($id: ID!) {
    package(id: $id) {
      ...PackageFields
    }
    reverseDependents(packageId: $id, maxDepth: 1, first: 1) {
      totalCount
    }
  }
  ${PACKAGE_FRAGMENT}
`;

export const GET_PACKAGE_METADATA = gql`
  query GetPackageMetadata($packageId: ID!) {
    packageMetadata(packageId: $packageId) {
      latestVersion
      license
      repositoryUrl
      scorecardTarget
    }
  }
`;


// ═══════════════════════════════════════════════════════════════
// SUBSCRIPTIONS (if WebSocket available)
// ═══════════════════════════════════════════════════════════════

export const VERSION_EVENTS_SUBSCRIPTION = gql`
  subscription OnVersionEvent($ecosystems: [Ecosystem!]) {
    versionEvents(ecosystems: $ecosystems) {
      meta {
        eventId
        occurredAt
        source
      }
      package {
        ...PackageFields
      }
      version {
        id
        packageId
        version
        publishedAt
        yanked
      }
    }
  }
  ${PACKAGE_FRAGMENT}
`;

// Real-time package activity subscription (matches backend newVersion)
export const NEW_VERSION_SUBSCRIPTION = gql`
  subscription OnNewVersion(
    $ecosystem: Ecosystem
    $packageId: ID
  ) {
    newVersion(ecosystem: $ecosystem, packageId: $packageId) {
      meta {
        eventId
        occurredAt
        source
      }
      package {
        ...PackageFields
      }
      version {
        id
        packageId
        version
        publishedAt
        yanked
      }
    }
  }
  ${PACKAGE_FRAGMENT}
`;

// Alias for backwards compatibility
export const LIVE_PACKAGE_ACTIVITY = NEW_VERSION_SUBSCRIPTION;

// Breaking change detection subscription
export const BREAKING_CHANGE_DETECTED = gql`
  subscription OnBreakingChangeDetected(
    $ecosystem: Ecosystem
    $packageId: ID
    $minSeverity: BreakingSeverity
  ) {
    breakingChangeDetected(
      ecosystem: $ecosystem
      packageId: $packageId
      minSeverity: $minSeverity
    ) {
      timestamp
      package {
        ...PackageFields
      }
      fromVersion
      toVersion
      severity
      changes {
        changeType
        description
        path
        oldSignature
        newSignature
      }
      affectedDependents
    }
  }
  ${PACKAGE_FRAGMENT}
`;

// Live platform statistics subscription
export const LIVE_STATS = gql`
  subscription OnLiveStats {
    liveStats {
      timestamp
      packagesIndexed
      versionsIndexed
      dependenciesTracked
      eventsPerMinute
      activeConnections
      topEcosystems {
        ecosystem
        count
        change24h
      }
    }
  }
`;

// Dependency impact subscription
export const DEPENDENCY_IMPACT = gql`
  subscription OnDependencyImpact(
    $ecosystem: Ecosystem
    $minImpactScore: Float
  ) {
    dependencyImpact(ecosystem: $ecosystem, minImpactScore: $minImpactScore) {
      timestamp
      package {
        ...PackageFields
      }
      version
      impactScore
      affectedPackages
      affectedVersions
      criticalPath
    }
  }
  ${PACKAGE_FRAGMENT}
`;

// Watch specific packages for updates (alias for newVersion with packageId)
export const WATCH_PACKAGES = gql`
  subscription OnWatchPackages($packageId: ID!) {
    newVersion(packageId: $packageId) {
      meta {
        eventId
        occurredAt
        source
      }
      package {
        ...PackageFields
      }
      version {
        id
        packageId
        version
        publishedAt
        yanked
      }
    }
  }
  ${PACKAGE_FRAGMENT}
`;

// Dependency graph update subscription (for live graph updates)
export const DEPENDENCY_GRAPH_UPDATES = DEPENDENCY_IMPACT;

// ═══════════════════════════════════════════════════════════════
// P1: SBOM GENERATION
// ═══════════════════════════════════════════════════════════════

export const SBOM_COMPONENT_FRAGMENT = gql`
  fragment SbomComponentFields on SbomComponent {
    ref
    name
    version
    purl
    ecosystem
    licenses
    hasVulnerabilities
    vulnerabilityCount
  }
`;

export const GENERATE_SBOM = gql`
  query GenerateSbom(
    $packageId: ID!
    $options: SbomGenerationOptions!
  ) {
    generateSbom(packageId: $packageId, options: $options) {
      format
      encoding
      content
      componentCount
      vulnerabilityCount
      generatedAt
      downloadUrl
    }
  }
`;

// ═══════════════════════════════════════════════════════════════
// P1: OPENSSF SCORECARD
// ═══════════════════════════════════════════════════════════════

export const SCORECARD_CHECK_FRAGMENT = gql`
  fragment ScorecardCheckFields on ScorecardCheck {
    check
    name
    score
    reason
    details
    documentationUrl
    riskCategory
    riskLevel
  }
`;

export const GET_SCORECARD = gql`
  query GetScorecard($target: String!) {
    scorecard(target: $target) {
      target
      targetType
      aggregateScore
      checks {
        ...ScorecardCheckFields
      }
      holisticSecurity {
        ...ScorecardCheckFields
      }
      sourceRisk {
        ...ScorecardCheckFields
      }
      buildRisk {
        ...ScorecardCheckFields
      }
      generatedAt
      scorecardVersion
      commitSha
      failedChecks {
        ...ScorecardCheckFields
      }
      criticalFindingsCount
    }
  }
  ${SCORECARD_CHECK_FRAGMENT}
`;

export const GET_SCORECARD_SUMMARY = gql`
  query GetScorecardSummary($target: String!) {
    scorecardSummary(target: $target) {
      target
      aggregateScore
      riskLevel
      passedChecks
      failedChecks
      criticalIssues
    }
  }
`;

// ═══════════════════════════════════════════════════════════════
// P1: LICENSE COMPLIANCE
// ═══════════════════════════════════════════════════════════════

export const LICENSE_INFO_FRAGMENT = gql`
  fragment LicenseInfoFields on LicenseInfo {
    id
    name
    osiApproved
    fsfLibre
    copyleft
    category
    referenceUrl
    deprecated
  }
`;

export const LICENSE_VIOLATION_FRAGMENT = gql`
  fragment LicenseViolationFields on LicenseViolation {
    violationType
    licenseId
    reason
    severity
  }
`;

export const GET_LICENSE_INFO = gql`
  query GetLicenseInfo($licenseId: String!) {
    licenseInfo(licenseId: $licenseId) {
      ...LicenseInfoFields
    }
  }
  ${LICENSE_INFO_FRAGMENT}
`;

export const VALIDATE_LICENSE = gql`
  query ValidateLicense(
    $licenseExpression: String!
    $policy: LicensePolicyPreset
  ) {
    validateLicense(licenseExpression: $licenseExpression, policy: $policy) {
      compliant
      policyName
      detectedLicense
      violations {
        ...LicenseViolationFields
      }
      warnings
    }
  }
  ${LICENSE_VIOLATION_FRAGMENT}
`;

export const SCAN_LICENSES = gql`
  query ScanLicenses(
    $packageId: ID!
    $policy: LicensePolicyPreset
  ) {
    scanLicenses(packageId: $packageId, policy: $policy) {
      totalPackages
      licensesDetected
      copyleftCount
      permissiveCount
      unknownCount
      complianceStatus
      violations {
        ...LicenseViolationFields
      }
    }
  }
  ${LICENSE_VIOLATION_FRAGMENT}
`;

// ═══════════════════════════════════════════════════════════════
// P2: VEX (Vulnerability Exploitability eXchange)
// ═══════════════════════════════════════════════════════════════

export const VEX_PRODUCT_FRAGMENT = gql`
  fragment VexProductFields on VexProduct {
    id
    name
    version
    purl
    cpe
  }
`;

export const VEX_SUPPLIER_FRAGMENT = gql`
  fragment VexSupplierFields on VexSupplier {
    name
    url
    email
  }
`;

export const VEX_STATEMENT_FRAGMENT = gql`
  fragment VexStatementFields on VexStatement {
    id
    vulnerabilityId
    product {
      ...VexProductFields
    }
    status
    justification
    impact {
      summary
      details
      adjustedCvss
      adjustedSeverity
    }
    action {
      actionType
      description
      targetRelease
      workaround
      estimatedFixDate
    }
    timestamp
    supplier {
      ...VexSupplierFields
    }
    notes
  }
  ${VEX_PRODUCT_FRAGMENT}
  ${VEX_SUPPLIER_FRAGMENT}
`;

export const GET_VEX_EXPLOITABILITY = gql`
  query GetVexExploitability($vulnerabilityId: String!, $productId: String!) {
    vexExploitability(vulnerabilityId: $vulnerabilityId, productId: $productId) {
      vulnerabilityId
      productId
      exploitable
      status
      justification
      recommendation
    }
  }
`;

export const GET_VEX_DOCUMENT = gql`
  query GetVexDocument($packageId: ID!) {
    vexDocument(packageId: $packageId) {
      id
      version
      author {
        ...VexSupplierFields
      }
      timestamp
      statements {
        ...VexStatementFields
      }
      statementCount
    }
  }
  ${VEX_SUPPLIER_FRAGMENT}
  ${VEX_STATEMENT_FRAGMENT}
`;

export const GET_VEX_STATISTICS = gql`
  query GetVexStatistics($packageId: ID) {
    vexStatistics(packageId: $packageId) {
      totalStatements
      notAffectedCount
      affectedCount
      fixedCount
      underInvestigationCount
    }
  }
`;

// ═══════════════════════════════════════════════════════════════
// P2: SLSA PROVENANCE
// ═══════════════════════════════════════════════════════════════

export const SLSA_SUBJECT_FRAGMENT = gql`
  fragment SlsaSubjectFields on SlsaSubject {
    name
    sha256
  }
`;

export const SLSA_BUILDER_FRAGMENT = gql`
  fragment SlsaBuilderFields on SlsaBuilder {
    id
    version
  }
`;

export const GET_SLSA_ASSESSMENT = gql`
  query GetSlsaAssessment($packageId: ID!) {
    slsaAssessment(packageId: $packageId) {
      packageId
      level
      hasProvenance
      provenanceSigned
      builder
      sourceRepo
      assessedAt
      recommendations
    }
  }
`;

export const GET_SLSA_PROVENANCE = gql`
  query GetSlsaProvenance($packageId: ID!) {
    slsaProvenance(packageId: $packageId) {
      statementType
      predicateType
      subjects {
        ...SlsaSubjectFields
      }
      builder {
        ...SlsaBuilderFields
      }
      repository
      gitRef
      workflow
      buildMetadata {
        invocationId
        startedOn
        finishedOn
      }
    }
  }
  ${SLSA_SUBJECT_FRAGMENT}
  ${SLSA_BUILDER_FRAGMENT}
`;

export const VERIFY_PROVENANCE = gql`
  query VerifyProvenance($packageId: ID!, $requiredLevel: SlsaBuildLevel) {
    verifyProvenance(packageId: $packageId, requiredLevel: $requiredLevel) {
      valid
      slsaLevel
      checks {
        name
        passed
        message
      }
      errors
      warnings
    }
  }
`;

// ═══════════════════════════════════════════════════════════════
// P2: POLICY ENGINE
// ═══════════════════════════════════════════════════════════════

export const POLICY_RULE_FRAGMENT = gql`
  fragment PolicyRuleFields on PolicyRule {
    id
    name
    description
    category
    severity
    blocking
    remediation
    reference
  }
`;

export const GET_POLICY_SETS = gql`
  query GetPolicySets {
    policySets {
      id
      name
      description
      version
      rules {
        ...PolicyRuleFields
      }
      ruleCount
      blockingRuleCount
      createdAt
      updatedAt
    }
  }
  ${POLICY_RULE_FRAGMENT}
`;

export const EVALUATE_POLICY = gql`
  query EvaluatePolicy($input: PolicyEvaluationInput!) {
    evaluatePolicy(input: $input) {
      policySetId
      packageId
      overallResult
      ruleResults {
        ruleId
        ruleName
        result
        severity
        blocking
        message
        remediation
      }
      passedCount
      failedCount
      warningCount
      blockingFailures
      evaluatedAt
      durationMs
    }
  }
`;

// ═══════════════════════════════════════════════════════════════
// P2: AUDIT TRAIL
// ═══════════════════════════════════════════════════════════════

export const AUDIT_EVENT_FRAGMENT = gql`
  fragment AuditEventFields on AuditEvent {
    id
    sequence
    timestamp
    eventType
    category
    severity
    outcome
    message
    actor {
      actorType
      id
      name
      email
      ipAddress
    }
    target {
      targetType
      id
      name
    }
    tenantId
    correlationId
  }
`;

export const GET_AUDIT_EVENTS = gql`
  query GetAuditEvents(
    $filter: AuditFilterInput
    $first: Int
    $after: String
  ) {
    auditEvents(filter: $filter, first: $first, after: $after) {
      edges {
        node {
          ...AuditEventFields
        }
        cursor
      }
      pageInfo {
        hasNextPage
        hasPreviousPage
        startCursor
        endCursor
      }
      totalCount
    }
  }
  ${AUDIT_EVENT_FRAGMENT}
`;

export const GET_COMPLIANCE_REPORT = gql`
  query GetComplianceReport(
    $startDate: String!
    $endDate: String!
    $tenantId: String
  ) {
    complianceReport(startDate: $startDate, endDate: $endDate, tenantId: $tenantId) {
      periodStart
      periodEnd
      totalEvents
      securityEvents
      policyEvents
      complianceEvents
      totalViolations
      totalPolicyEvaluations
      generatedAt
    }
  }
`;

// ═══════════════════════════════════════════════════════════════
// P2: UPDATE RECOMMENDATIONS
// ═══════════════════════════════════════════════════════════════

export const UPDATE_RECOMMENDATION_FRAGMENT = gql`
  fragment UpdateRecommendationFields on UpdateRecommendation {
    packageId
    packageName
    currentVersion
    recommendedVersion
    latestVersion
    urgency
    reasons
    breakingChanges
    changelogUrl
    vulnerabilitiesFixed
    recommendationText
  }
`;

export const GET_UPDATE_RECOMMENDATIONS = gql`
  query GetUpdateRecommendations($packageId: ID) {
    updateRecommendations(packageId: $packageId) {
      totalPackages
      updatesAvailable
      criticalUpdates
      securityUpdates
      recommendations {
        ...UpdateRecommendationFields
      }
    }
  }
  ${UPDATE_RECOMMENDATION_FRAGMENT}
`;
