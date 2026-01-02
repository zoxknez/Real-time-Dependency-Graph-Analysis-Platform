{{/*
═══════════════════════════════════════════════════════════════
INVERSE DEPENDENCY PLATFORM - HELM TEMPLATE HELPERS
═══════════════════════════════════════════════════════════════
*/}}

{{/*
Expand the name of the chart.
*/}}
{{- define "idp.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Create a default fully qualified app name.
We truncate at 63 chars because some Kubernetes name fields are limited to this.
*/}}
{{- define "idp.fullname" -}}
{{- if .Values.fullnameOverride }}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- $name := default .Chart.Name .Values.nameOverride }}
{{- if contains $name .Release.Name }}
{{- .Release.Name | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- printf "%s-%s" .Release.Name $name | trunc 63 | trimSuffix "-" }}
{{- end }}
{{- end }}
{{- end }}

{{/*
Create chart name and version as used by the chart label.
*/}}
{{- define "idp.chart" -}}
{{- printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Common labels
*/}}
{{- define "idp.labels" -}}
helm.sh/chart: {{ include "idp.chart" . }}
{{ include "idp.selectorLabels" . }}
{{- if .Chart.AppVersion }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
{{- end }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
app.kubernetes.io/part-of: inverse-dependency-platform
{{- end }}

{{/*
Selector labels
*/}}
{{- define "idp.selectorLabels" -}}
app.kubernetes.io/name: {{ include "idp.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end }}

{{/*
Component labels - adds component to base labels
*/}}
{{- define "idp.componentLabels" -}}
{{ include "idp.labels" . }}
app.kubernetes.io/component: {{ .component }}
{{- end }}

{{/*
Component selector labels
*/}}
{{- define "idp.componentSelectorLabels" -}}
{{ include "idp.selectorLabels" . }}
app.kubernetes.io/component: {{ .component }}
{{- end }}

{{/*
Create the name of the service account to use
*/}}
{{- define "idp.serviceAccountName" -}}
{{- if .Values.serviceAccount.create }}
{{- default (include "idp.fullname" .) .Values.serviceAccount.name }}
{{- else }}
{{- default "default" .Values.serviceAccount.name }}
{{- end }}
{{- end }}

{{/*
Get image for a service
*/}}
{{- define "idp.image" -}}
{{- $registry := .global.image.registry -}}
{{- $repository := .service.image.repository -}}
{{- $tag := default .global.image.tag .service.image.tag -}}
{{- printf "%s/%s:%s" $registry $repository $tag }}
{{- end }}

{{/*
Environment variables for connecting to Redis
*/}}
{{- define "idp.redisEnv" -}}
- name: REDIS_HOST
  {{- if .Values.redis.enabled }}
  value: {{ include "idp.fullname" . }}-redis-master
  {{- else }}
  value: {{ .Values.redis.external.host }}
  {{- end }}
- name: REDIS_PORT
  value: "6379"
- name: REDIS_PASSWORD
  valueFrom:
    secretKeyRef:
      name: {{ .Values.redis.auth.existingSecret | default (printf "%s-redis" (include "idp.fullname" .)) }}
      key: {{ .Values.redis.auth.existingSecretPasswordKey | default "password" }}
{{- end }}

{{/*
Environment variables for connecting to Memgraph
*/}}
{{- define "idp.memgraphEnv" -}}
- name: MEMGRAPH_HOST
  {{- if .Values.memgraph.enabled }}
  value: {{ include "idp.fullname" . }}-memgraph
  {{- else }}
  value: {{ .Values.memgraph.external.host }}
  {{- end }}
- name: MEMGRAPH_PORT
  value: "7687"
- name: MEMGRAPH_USERNAME
  valueFrom:
    secretKeyRef:
      name: {{ .Values.memgraph.external.existingSecret | default (printf "%s-memgraph" (include "idp.fullname" .)) }}
      key: username
- name: MEMGRAPH_PASSWORD
  valueFrom:
    secretKeyRef:
      name: {{ .Values.memgraph.external.existingSecret | default (printf "%s-memgraph" (include "idp.fullname" .)) }}
      key: password
{{- end }}

{{/*
Environment variables for connecting to Qdrant
*/}}
{{- define "idp.qdrantEnv" -}}
- name: QDRANT_HOST
  value: {{ .Values.qdrant.external.host }}
- name: QDRANT_PORT
  value: "{{ .Values.qdrant.external.port | default 6334 }}"
{{- if .Values.qdrant.external.existingSecret }}
- name: QDRANT_API_KEY
  valueFrom:
    secretKeyRef:
      name: {{ .Values.qdrant.external.existingSecret }}
      key: api-key
{{- end }}
{{- end }}

{{/*
Environment variables for connecting to Kafka
*/}}
{{- define "idp.kafkaEnv" -}}
- name: KAFKA_BROKERS
  value: {{ .Values.kafka.external.brokers }}
{{- if .Values.kafka.external.existingSecret }}
- name: KAFKA_SASL_USERNAME
  valueFrom:
    secretKeyRef:
      name: {{ .Values.kafka.external.existingSecret }}
      key: username
- name: KAFKA_SASL_PASSWORD
  valueFrom:
    secretKeyRef:
      name: {{ .Values.kafka.external.existingSecret }}
      key: password
{{- end }}
{{- end }}

{{/*
Environment variables for connecting to RisingWave
*/}}
{{- define "idp.risingwaveEnv" -}}
- name: RISINGWAVE_HOST
  value: {{ .Values.risingwave.external.host }}
- name: RISINGWAVE_PORT
  value: "{{ .Values.risingwave.external.port | default 4566 }}"
{{- if .Values.risingwave.external.existingSecret }}
- name: RISINGWAVE_PASSWORD
  valueFrom:
    secretKeyRef:
      name: {{ .Values.risingwave.external.existingSecret }}
      key: password
{{- end }}
{{- end }}

{{/*
Pod security context (non-root)
*/}}
{{- define "idp.podSecurityContext" -}}
runAsNonRoot: true
runAsUser: 1000
runAsGroup: 1000
fsGroup: 1000
seccompProfile:
  type: RuntimeDefault
{{- end }}

{{/*
Container security context (restricted)
*/}}
{{- define "idp.containerSecurityContext" -}}
allowPrivilegeEscalation: false
readOnlyRootFilesystem: true
capabilities:
  drop:
    - ALL
{{- end }}
