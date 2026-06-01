'use client';

import { useEffect, useMemo, useState } from 'react';
import { apiFetch } from '@/lib/api-client';
import ConfigStep, { type ConfigValues } from '@/components/ConfigStep';
import PreviewStep from '@/components/PreviewStep';
import ApplyStep from '@/components/ApplyStep';
import AddFieldStep, { type AddFieldValues } from '@/components/AddFieldStep';
import AddFieldPreviewStep from '@/components/AddFieldPreviewStep';
import AddFieldApplyStep from '@/components/AddFieldApplyStep';
import DeleteFieldStep, { type DeleteFieldValues } from '@/components/DeleteFieldStep';
import DeleteFieldPreviewStep from '@/components/DeleteFieldPreviewStep';
import DeleteFieldApplyStep from '@/components/DeleteFieldApplyStep';
import AgentPanel from '@/components/AgentPanel';
import CsvImportFlow from '@/components/CsvImportFlow';
import ContentTypeInspector from '@/components/ContentTypeInspector';
import ContentTypeCheckboxPicker from '@/components/ContentTypeCheckboxPicker';
import { groupContentTypes } from '@/lib/group-content-types';
import type { DryRunResult, ApplyResult, MigrationPlan } from '@/lib/migration';
import type { TransformResult } from '@/lib/transforms';
import type { ContentTypeSummary } from '@/lib/contentful';
import type { CTDryRunOutcome, SchemaApplyResult, CTDeleteOutcome, SchemaDeleteResult } from '@/lib/schema-migration-shared';
import { dryRunSchemaChange, dryRunDeleteField } from '@/lib/schema-migration-shared';
import type { AgentResolution } from '@/lib/agent-types';
import type { SampleEntry } from '@/lib/contentful';

// ── Shared bootstrap data ─────────────────────────────────────────────────────

interface BootstrapData {
  contentTypes: ContentTypeSummary[];
  spaceId: string;
  environment: string;
}

const BOOTSTRAP_CACHE_KEY = 'contentful-admin:bootstrap';

// ── Step / workflow types ─────────────────────────────────────────────────────

type FlowStep = 'config' | 'preview' | 'apply';
type Workflow = 'update-entries' | 'add-field' | 'delete-field' | 'agent' | 'csv-import';

// ── Root page ─────────────────────────────────────────────────────────────────

export default function Home() {
  const [workflow, setWorkflow] = useState<Workflow>('update-entries');
  const [bootstrapData, setBootstrapData] = useState<BootstrapData | null>(null);

  useEffect(() => {
    try {
      const cached = sessionStorage.getItem(BOOTSTRAP_CACHE_KEY);
      if (cached) {
        const parsed = JSON.parse(cached) as BootstrapData;
        setBootstrapData(parsed);
        return;
      }
    } catch { /* ignore */ }
    apiFetch<BootstrapData & { transforms: unknown[] }>('/api/content-types')
      .then((d) => {
        // Store the full response so ConfigStep (which reads transforms from the same key) doesn't crash
        try { sessionStorage.setItem(BOOTSTRAP_CACHE_KEY, JSON.stringify(d)); } catch { /* ignore */ }
        setBootstrapData({ contentTypes: d.contentTypes, spaceId: d.spaceId, environment: d.environment });
      })
      .catch(() => { /* ConfigStep handles errors for update-entries tab */ });
  }, []);

  const contentTypes = useMemo(() => bootstrapData?.contentTypes ?? [], [bootstrapData]);
  const spaceId = bootstrapData?.spaceId ?? '';
  const environment = bootstrapData?.environment ?? 'master';

  // Patches only the affected CTs in state + sessionStorage — zero extra API calls.
  // Called after schema mutations with the updated CT summaries returned by the mutation API.
  function patchBootstrap(updatedCTs: ContentTypeSummary[]) {
    setBootstrapData((prev) => {
      if (!prev) return prev;
      const updatedMap = new Map(updatedCTs.map((ct) => [ct.id, ct]));
      const patched = prev.contentTypes.map((ct) => updatedMap.get(ct.id) ?? ct);
      const next = { ...prev, contentTypes: patched };
      try {
        const cached = sessionStorage.getItem(BOOTSTRAP_CACHE_KEY);
        if (cached) {
          const parsed = JSON.parse(cached);
          sessionStorage.setItem(BOOTSTRAP_CACHE_KEY, JSON.stringify({ ...parsed, contentTypes: patched }));
        }
      } catch { /* ignore */ }
      return next;
    });
  }

  // Full force-refresh — bypasses server cache. Use for out-of-band Contentful changes.
  const [isRefreshing, setIsRefreshing] = useState(false);
  function forceRefresh() {
    setIsRefreshing(true);
    apiFetch<BootstrapData & { transforms: unknown[] }>('/api/content-types?refresh=1')
      .then((d) => {
        try { sessionStorage.setItem(BOOTSTRAP_CACHE_KEY, JSON.stringify(d)); } catch { /* ignore */ }
        setBootstrapData({ contentTypes: d.contentTypes, spaceId: d.spaceId, environment: d.environment });
      })
      .catch(() => { /* ignore */ })
      .finally(() => setIsRefreshing(false));
  }

  return (
    <div className="space-y-6">
      {/* Workflow tabs + refresh button */}
      <div className="flex items-center gap-3">
        <div className="flex gap-1 rounded-lg border border-gray-200 bg-white p-1 shadow-sm w-fit">
          <WorkflowTab active={workflow === 'update-entries'} onClick={() => setWorkflow('update-entries')} label="Update Entries" />
          <WorkflowTab active={workflow === 'add-field'} onClick={() => setWorkflow('add-field')} label="Add Field" />
          <WorkflowTab active={workflow === 'delete-field'} onClick={() => setWorkflow('delete-field')} label="Delete Field" />
          <WorkflowTab active={workflow === 'agent'} onClick={() => setWorkflow('agent')} label="AI Agent" />
          <WorkflowTab active={workflow === 'csv-import'} onClick={() => setWorkflow('csv-import')} label="CSV Import" />
        </div>
        <button
          type="button"
          onClick={forceRefresh}
          disabled={isRefreshing}
          title="Force-refresh content types from Contentful"
          className="flex items-center gap-1.5 rounded-md border border-gray-200 bg-white px-2.5 py-1.5 text-xs text-gray-500 shadow-sm hover:text-gray-800 disabled:opacity-50 transition-colors"
        >
          <span className={isRefreshing ? 'animate-spin inline-block' : ''}>↻</span>
          {isRefreshing ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>

      {workflow === 'update-entries' && (
        <UpdateEntriesFlow spaceId={spaceId} environment={environment} />
      )}
      {workflow === 'add-field' && (
        <AddFieldFlow
          contentTypes={contentTypes}
          spaceId={spaceId}
          environment={environment}
          onSuccess={patchBootstrap}
        />
      )}
      {workflow === 'delete-field' && (
        <DeleteFieldFlow
          contentTypes={contentTypes}
          spaceId={spaceId}
          environment={environment}
          onSuccess={patchBootstrap}
        />
      )}
      {workflow === 'agent' && (
        <AgentFlow
          contentTypes={contentTypes}
          spaceId={spaceId}
          environment={environment}
        />
      )}
      {workflow === 'csv-import' && (
        <CsvImportFlow
          contentTypes={contentTypes}
          spaceId={spaceId}
          environment={environment}
        />
      )}
    </div>
  );
}

// ── AI Agent workflow ─────────────────────────────────────────────────────────

/**
 * AgentFlow wraps the AI agent chat + the standard Preview/Apply steps.
 *
 * step='chat'    — AgentPanel handles the conversation. Once the agent resolves
 *                  a MigrationPlan, /api/preview is called automatically and the
 *                  user is transitioned to step='preview'.
 * step='preview' — Reuses PreviewStep unchanged (same as UpdateEntriesFlow).
 * step='apply'   — Reuses ApplyStep unchanged.
 *
 * A ConfigValues object is reconstructed from the resolved MigrationPlan so
 * PreviewStep can display the content type name and target field without changes.
 *
 * Note: currently supports a single content type per operation. Multi-type
 * support would require either multiple plans or a redesigned plan shape.
 */
type AgentFlowStep = 'chat' | 'preview' | 'apply';

function AgentFlow({
  contentTypes,
  spaceId,
  environment,
}: {
  contentTypes: ContentTypeSummary[];
  spaceId: string;
  environment: string;
}) {
  const [step, setStep] = useState<AgentFlowStep>('chat');
  const [plan, setPlan] = useState<MigrationPlan | null>(null);
  const [agentConfig, setAgentConfig] = useState<ConfigValues | null>(null);
  const [dryRunResult, setDryRunResult] = useState<DryRunResult | null>(null);
  const [applyResult, setApplyResult] = useState<ApplyResult | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [isApplying, setIsApplying] = useState(false);
  const [applyError, setApplyError] = useState<string | null>(null);

  // Optional CT pre-selection — narrows the agent's focus context.
  const [focusedCTIds, setFocusedCTIds] = useState<Set<string>>(new Set());
  const [ctSearch, setCtSearch] = useState('');

  const filteredCTs = useMemo(() => {
    const q = ctSearch.toLowerCase().trim();
    return q ? contentTypes.filter((c) => c.name.toLowerCase().includes(q) || c.id.toLowerCase().includes(q)) : contentTypes;
  }, [contentTypes, ctSearch]);
  const groupedCTs = useMemo(() => groupContentTypes(filteredCTs), [filteredCTs]);

  function toggleCT(id: string) {
    setFocusedCTIds((prev) => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next; });
  }
  function toggleGroup(ids: string[]) {
    setFocusedCTIds((prev) => {
      const next = new Set(prev);
      const allOn = ids.every((id) => next.has(id));
      ids.forEach((id) => allOn ? next.delete(id) : next.add(id));
      return next;
    });
  }
  function toggleAll() {
    setFocusedCTIds((prev) => prev.size === filteredCTs.length ? new Set() : new Set(filteredCTs.map((c) => c.id)));
  }

  // Resolved CT inspector — persisted across all steps so it stays visible
  // during preview and apply as a collapsible reference panel.
  const [resolvedCT, setResolvedCT] = useState<ContentTypeSummary | null>(null);
  const [sampleEntry, setSampleEntry] = useState<SampleEntry | null | 'loading' | 'error'>('loading');

  useEffect(() => {
    if (!resolvedCT) return;
    const CACHE_KEY = `contentful-admin:sample:${resolvedCT.id}`;
    try {
      const cached = sessionStorage.getItem(CACHE_KEY);
      if (cached) { setSampleEntry(JSON.parse(cached) as SampleEntry | null); return; }
    } catch { /* ignore */ }
    setSampleEntry('loading');
    apiFetch<{ entry: SampleEntry | null }>(`/api/sample-entry?contentType=${encodeURIComponent(resolvedCT.id)}`)
      .then((res) => {
        try { sessionStorage.setItem(CACHE_KEY, JSON.stringify(res.entry)); } catch { /* ignore */ }
        setSampleEntry(res.entry);
      })
      .catch(() => setSampleEntry('error'));
  }, [resolvedCT]);

  async function handleResolution(resolution: AgentResolution) {
    const resolvedPlan = resolution.plan;
    setPlan(resolvedPlan);

    // Build a ConfigValues from the plan so PreviewStep can display correctly.
    const ct = contentTypes.find((c) => c.id === resolvedPlan.contentType);
    const targetFieldDef = ct?.fields.find((f) => f.id === resolvedPlan.targetField);
    setAgentConfig({
      contentType:         resolvedPlan.contentType,
      contentTypeName:     ct?.name ?? resolvedPlan.contentType,
      targetField:         resolvedPlan.targetField,
      transformId:         resolvedPlan.transformId,
      transformConfig:     resolvedPlan.transformConfig,
      locale:              resolvedPlan.locale,
      skipExisting:        resolvedPlan.skipExisting,
      targetFieldRequired: targetFieldDef?.required ?? false,
    });

    setPreviewError(null);
    setPreviewLoading(true);
    try {
      const result = await apiFetch<DryRunResult>('/api/preview', {
        method: 'POST',
        json: resolvedPlan,
      });
      setDryRunResult(result);
      setStep('preview');
    } catch (e) {
      setPreviewError((e as Error).message);
    } finally {
      setPreviewLoading(false);
    }
  }

  async function handleApply(updates: TransformResult[]) {
    if (!plan) return;
    setApplyError(null);
    setIsApplying(true);
    try {
      const result = await apiFetch<ApplyResult>('/api/apply', {
        method: 'POST',
        json: { plan, updates },
      });
      setApplyResult(result);
      setStep('apply');
    } catch (e) {
      setApplyError((e as Error).message);
    } finally {
      setIsApplying(false);
    }
  }

  function reset() {
    setStep('chat');
    setPlan(null);
    setAgentConfig(null);
    setDryRunResult(null);
    setApplyResult(null);
    setPreviewError(null);
    setApplyError(null);
    setResolvedCT(null);
    setSampleEntry('loading');
    // Keep focusedCTIds — user's selection persists across resets within the same session
  }

  const allSucceeded =
    step === 'apply' && !!applyResult && applyResult.failed.length === 0 && applyResult.succeeded.length > 0;

  return (
    <div className="space-y-6">
      <StepIndicator current={step === 'chat' ? 'config' : step === 'preview' ? 'preview' : 'apply'} allSucceeded={allSucceeded} />

      {step === 'chat' && (
        <>
          {/* Optional CT pre-selection — collapses after the agent resolves to reduce noise.
              Selected types are passed as focus context so the agent prioritises them and
              other users querying/browsing before deciding what to migrate. */}
          {contentTypes.length > 0 && (
            <details className="group rounded-lg border border-gray-200 bg-white shadow-sm overflow-hidden">
              <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3 text-sm font-medium text-gray-700 select-none hover:bg-gray-50">
                <span>
                  Focus on specific content types
                  {focusedCTIds.size > 0 && (
                    <span className="ml-2 rounded-full bg-blue-100 px-2 py-0.5 text-xs font-semibold text-blue-700">
                      {focusedCTIds.size} selected
                    </span>
                  )}
                </span>
                <svg className="h-4 w-4 shrink-0 text-gray-400 transition-transform group-open:rotate-180" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
                </svg>
              </summary>
              <div className="border-t border-gray-100 px-4 pb-4 pt-1">
                <p className="mb-3 text-xs text-gray-500">
                  Optional. Select types to narrow the agent&apos;s focus — useful if you already know what you want to work with. The agent can still reference all types.
                </p>
                <ContentTypeCheckboxPicker
                  groupedCTs={groupedCTs}
                  filteredTotal={filteredCTs.length}
                  selectedIds={focusedCTIds}
                  ctSearch={ctSearch}
                  onSearchChange={setCtSearch}
                  onToggle={toggleCT}
                  onGroupToggle={toggleGroup}
                  onToggleAll={toggleAll}
                />
              </div>
            </details>
          )}

          {previewLoading && (
            <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm text-blue-800">
              Fetching entries and generating AI preview… this may take a moment for large content types.
            </div>
          )}
          {previewError && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
              <strong>Preview failed:</strong> {previewError}
            </div>
          )}
          <AgentPanel
            contentTypes={contentTypes}
            focusedCTIds={Array.from(focusedCTIds)}
            onResolution={handleResolution}
            onCTResolved={setResolvedCT}
          />
        </>
      )}

      {/* Resolved CT inspector — persists across all steps as a collapsible reference.
          Expanded by default during chat so users can verify the schema before preview;
          collapsed by default during preview/apply to keep the primary content prominent. */}
      {resolvedCT && (
        <details open={step === 'chat'} className="group rounded-lg border border-gray-200 bg-white shadow-sm overflow-hidden">
          <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3 text-sm font-medium text-gray-700 select-none hover:bg-gray-50">
            <span>
              Content type: <span className="font-semibold">{resolvedCT.name}</span>
              <span className="ml-2 font-mono text-xs text-gray-400">{resolvedCT.id}</span>
            </span>
            <svg className="h-4 w-4 shrink-0 text-gray-400 transition-transform group-open:rotate-180" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
            </svg>
          </summary>
          <div className="border-t border-gray-100">
            <ContentTypeInspector
              ct={resolvedCT}
              locale="en-US"
              spaceId={spaceId}
              environment={environment}
              sample={sampleEntry}
            />
          </div>
        </details>
      )}

      {step === 'preview' && dryRunResult && agentConfig && (
        <>
          {applyError && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
              <strong>Apply failed:</strong> {applyError}
            </div>
          )}
          <PreviewStep
            config={agentConfig}
            result={dryRunResult}
            onApply={handleApply}
            onBack={reset}
            isApplying={isApplying}
            spaceId={spaceId}
            environment={environment}
          />
        </>
      )}

      {step === 'apply' && applyResult && (
        <ApplyStep
          result={applyResult}
          spaceId={spaceId}
          environment={environment}
          onReset={reset}
        />
      )}
    </div>
  );
}

function WorkflowTab({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-md px-4 py-1.5 text-sm font-medium transition-colors ${
        active ? 'bg-blue-600 text-white shadow-sm' : 'text-gray-600 hover:text-gray-900'
      }`}
    >
      {label}
    </button>
  );
}

// ── Update Entries workflow ───────────────────────────────────────────────────

function UpdateEntriesFlow({ spaceId, environment }: { spaceId: string; environment: string }) {
  const [step, setStep] = useState<FlowStep>('config');
  const [config, setConfig] = useState<ConfigValues | null>(null);
  const [dryRunResult, setDryRunResult] = useState<DryRunResult | null>(null);
  const [applyResult, setApplyResult] = useState<ApplyResult | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [isApplying, setIsApplying] = useState(false);
  const [applyError, setApplyError] = useState<string | null>(null);

  async function handleConfigSubmit(values: ConfigValues) {
    setConfig(values);
    setPreviewError(null);
    setPreviewLoading(true);
    try {
      const result = await apiFetch<DryRunResult>('/api/preview', {
        method: 'POST',
        json: {
          contentType: values.contentType,
          targetField: values.targetField,
          transformId: values.transformId,
          transformConfig: values.transformConfig,
          locale: values.locale,
          skipExisting: values.skipExisting,
          targetFieldRequired: values.targetFieldRequired,
          inlineCode: values.inlineCode,
        },
      });
      setDryRunResult(result);
      setStep('preview');
    } catch (e) {
      setPreviewError((e as Error).message);
    } finally {
      setPreviewLoading(false);
    }
  }

  async function handleApply(updates: TransformResult[]) {
    if (!config || !dryRunResult) return;
    setApplyError(null);
    setIsApplying(true);
    try {
      const result = await apiFetch<ApplyResult>('/api/apply', {
        method: 'POST',
        json: { plan: dryRunResult.plan, updates },
      });
      setApplyResult(result);
      setStep('apply');
    } catch (e) {
      setApplyError((e as Error).message);
    } finally {
      setIsApplying(false);
    }
  }

  function reset() {
    setStep('config');
    setConfig(null);
    setDryRunResult(null);
    setApplyResult(null);
    setPreviewError(null);
    setApplyError(null);
  }

  const allSucceeded = step === 'apply' && !!applyResult && applyResult.failed.length === 0 && applyResult.succeeded.length > 0;

  return (
    <div className="space-y-6">
      <StepIndicator current={step} allSucceeded={allSucceeded} />

      {step === 'config' && (
        <>
          {previewLoading && (
            <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm text-blue-800">
              Fetching entries and generating preview… this may take a moment for large content types.
            </div>
          )}
          {previewError && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
              <strong>Preview failed:</strong> {previewError}
            </div>
          )}
          <ConfigStep onSubmit={handleConfigSubmit} />
        </>
      )}

      {step === 'preview' && dryRunResult && config && (
        <>
          {applyError && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
              <strong>Apply failed:</strong> {applyError}
            </div>
          )}
          <PreviewStep
            config={config}
            result={dryRunResult}
            onApply={handleApply}
            onBack={reset}
            isApplying={isApplying}
            spaceId={spaceId}
            environment={environment}
          />
        </>
      )}

      {step === 'apply' && applyResult && (
        <ApplyStep
          result={applyResult}
          spaceId={spaceId}
          environment={environment}
          onReset={reset}
        />
      )}
    </div>
  );
}

// ── Add Field workflow ────────────────────────────────────────────────────────

function AddFieldFlow({
  contentTypes,
  spaceId,
  environment,
  onSuccess,
}: {
  contentTypes: ContentTypeSummary[];
  spaceId: string;
  environment: string;
  onSuccess: (updatedCTs: ContentTypeSummary[]) => void;
}) {
  const [step, setStep] = useState<FlowStep>('config');
  const [addFieldValues, setAddFieldValues] = useState<AddFieldValues | null>(null);
  const [outcomes, setOutcomes] = useState<CTDryRunOutcome[]>([]);
  // Snapshot taken at submit time — used for the results screen so it always shows
  // the pre-mutation field list (prevents duplicates after the background re-fetch).
  const [ctSnapshot, setCtSnapshot] = useState<ContentTypeSummary[]>([]);
  const [applyResult, setApplyResult] = useState<SchemaApplyResult | null>(null);
  const [isApplying, setIsApplying] = useState(false);
  const [applyError, setApplyError] = useState<string | null>(null);

  function handleAddFieldSubmit(values: AddFieldValues) {
    setCtSnapshot(contentTypes);
    setOutcomes(
      dryRunSchemaChange(
        contentTypes,
        values.selectedCTs.map((ct) => ct.id),
        values.field,
      ),
    );
    setAddFieldValues(values);
    setStep('preview');
  }

  async function handleApply(toAdd: CTDryRunOutcome[]) {
    if (!addFieldValues) return;
    setApplyError(null);
    setIsApplying(true);
    try {
      const result = await apiFetch<SchemaApplyResult>('/api/schema-apply', {
        method: 'POST',
        json: {
          selectedCTs: toAdd.map((o) => ({ id: o.contentTypeId, name: o.contentTypeName })),
          field: addFieldValues.field,
        },
      });
      setApplyResult(result);
      setStep('apply');
      if (result.succeeded.length > 0) {
        const updatedCTs: ContentTypeSummary[] = result.succeeded
          .filter((s) => s.updatedFields)
          .map((s) => ({ id: s.contentTypeId, name: s.contentTypeName, fields: s.updatedFields! }));
        if (updatedCTs.length > 0) onSuccess(updatedCTs);
      }
    } catch (e) {
      setApplyError((e as Error).message);
    } finally {
      setIsApplying(false);
    }
  }

  function reset() {
    setStep('config');
    setAddFieldValues(null);
    setCtSnapshot([]);
    setOutcomes([]);
    setApplyResult(null);
    setApplyError(null);
  }

  const allSucceeded = step === 'apply' && !!applyResult && applyResult.failed.length === 0 && applyResult.succeeded.length > 0;

  if (contentTypes.length === 0) {
    return <div className="text-gray-500 text-sm">Loading content types…</div>;
  }

  return (
    <div className="space-y-6">
      <StepIndicator current={step} allSucceeded={allSucceeded} />

      {step === 'config' && (
        <AddFieldStep contentTypes={contentTypes} onSubmit={handleAddFieldSubmit} />
      )}

      {step === 'preview' && addFieldValues && (
        <>
          {applyError && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
              <strong>Apply failed:</strong> {applyError}
            </div>
          )}
          <AddFieldPreviewStep
            field={addFieldValues.field}
            outcomes={outcomes}
            onApply={handleApply}
            onBack={reset}
            isApplying={isApplying}
          />
        </>
      )}

      {step === 'apply' && applyResult && addFieldValues && (
        <AddFieldApplyStep
          result={applyResult}
          field={addFieldValues.field}
          contentTypes={ctSnapshot}
          spaceId={spaceId}
          environment={environment}
          onReset={reset}
        />
      )}
    </div>
  );
}

// ── Delete Field workflow ─────────────────────────────────────────────────────

function DeleteFieldFlow({
  contentTypes,
  spaceId,
  environment,
  onSuccess,
}: {
  contentTypes: ContentTypeSummary[];
  spaceId: string;
  environment: string;
  onSuccess: (updatedCTs: ContentTypeSummary[]) => void;
}) {
  const [step, setStep] = useState<FlowStep>('config');
  const [deleteValues, setDeleteValues] = useState<DeleteFieldValues | null>(null);
  const [outcomes, setOutcomes] = useState<CTDeleteOutcome[]>([]);
  // Snapshot the CT list at submit time — the preview shows the pre-delete shape
  const [deleteCtSnapshot, setDeleteCtSnapshot] = useState<ContentTypeSummary[]>([]);
  const [applyResult, setApplyResult] = useState<SchemaDeleteResult | null>(null);
  const [isApplying, setIsApplying] = useState(false);
  const [applyPhase, setApplyPhase] = useState<1 | 2 | null>(null);
  const [applyError, setApplyError] = useState<string | null>(null);

  function handleDeleteSubmit(values: DeleteFieldValues) {
    setDeleteCtSnapshot(contentTypes);
    setOutcomes(
      dryRunDeleteField(
        contentTypes,
        values.selectedCTs.map((ct) => ct.id),
        values.fieldId,
      ),
    );
    setDeleteValues(values);
    setStep('preview');
  }

  async function handleApply(toDelete: CTDeleteOutcome[]) {
    if (!deleteValues) return;
    setApplyError(null);
    setIsApplying(true);
    try {
      const cts = toDelete.map((o) => ({ id: o.contentTypeId, name: o.contentTypeName }));

      // Phase 1: mark field as omitted and publish
      setApplyPhase(1);
      const phase1 = await apiFetch<SchemaDeleteResult>('/api/schema-delete', {
        method: 'POST',
        json: { selectedCTs: cts, fieldId: deleteValues.fieldId, phase: 'omit' },
      });

      // Phase 2: remove field from schema — only the CTs that passed phase 1
      // Map back to { id, name } shape that the route expects
      setApplyPhase(2);
      const phase2 = await apiFetch<SchemaDeleteResult>('/api/schema-delete', {
        method: 'POST',
        json: {
          selectedCTs: phase1.succeeded.map((s) => ({ id: s.contentTypeId, name: s.contentTypeName })),
          fieldId: deleteValues.fieldId,
          phase: 'remove',
        },
      });

      const result: SchemaDeleteResult = {
        succeeded: phase2.succeeded,
        failed: [...phase1.failed, ...phase2.failed],
      };
      setApplyResult(result);
      setStep('apply');
      if (result.succeeded.length > 0) {
        // phase2 succeeded items carry updatedFields from the final remove publish
        const updatedCTs: ContentTypeSummary[] = result.succeeded
          .filter((s) => s.updatedFields)
          .map((s) => ({ id: s.contentTypeId, name: s.contentTypeName, fields: s.updatedFields! }));
        if (updatedCTs.length > 0) onSuccess(updatedCTs);
      }
    } catch (e) {
      setApplyError((e as Error).message);
    } finally {
      setIsApplying(false);
      setApplyPhase(null);
    }
  }

  function reset() {
    setStep('config');
    setDeleteValues(null);
    setOutcomes([]);
    setDeleteCtSnapshot([]);
    setApplyResult(null);
    setApplyPhase(null);
    setApplyError(null);
  }

  const allSucceeded = step === 'apply' && !!applyResult && applyResult.failed.length === 0 && applyResult.succeeded.length > 0;

  if (contentTypes.length === 0) {
    return <div className="text-gray-500 text-sm">Loading content types…</div>;
  }

  return (
    <div className="space-y-6">
      <StepIndicator current={step} allSucceeded={allSucceeded} />

      {step === 'config' && (
        <DeleteFieldStep contentTypes={contentTypes} onSubmit={handleDeleteSubmit} />
      )}

      {step === 'preview' && deleteValues && (
        <>
          {applyError && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
              <strong>Apply failed:</strong> {applyError}
            </div>
          )}
          <DeleteFieldPreviewStep
            fieldId={deleteValues.fieldId}
            fieldName={deleteValues.fieldName}
            fieldType={deleteValues.fieldType}
            outcomes={outcomes}
            contentTypes={deleteCtSnapshot}
            onApply={handleApply}
            onBack={reset}
            isApplying={isApplying}
            applyPhase={applyPhase}
          />
        </>
      )}

      {step === 'apply' && applyResult && deleteValues && (
        <DeleteFieldApplyStep
          result={applyResult}
          fieldId={deleteValues.fieldId}
          fieldName={deleteValues.fieldName}
          spaceId={spaceId}
          environment={environment}
          onReset={reset}
        />
      )}
    </div>
  );
}

// ── Step indicator ────────────────────────────────────────────────────────────

const STEPS: { id: FlowStep; label: string }[] = [
  { id: 'config', label: 'Configure' },
  { id: 'preview', label: 'Preview' },
  { id: 'apply', label: 'Results' },
];

function StepIndicator({ current, allSucceeded = false }: { current: FlowStep; allSucceeded?: boolean }) {
  const currentIdx = STEPS.findIndex((s) => s.id === current);
  return (
    <ol className="flex items-center gap-0 text-sm">
      {STEPS.map((s, i) => {
        const done = i < currentIdx || (allSucceeded && i === currentIdx);
        const active = i === currentIdx && !done;
        return (
          <li key={s.id} className="flex items-center">
            <span
              className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold transition-colors
                ${done ? 'bg-green-500 text-white' : active ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-500'}`}
            >
              {done ? '✓' : i + 1}
            </span>
            <span className={`ml-2 font-medium ${done || active ? 'text-gray-900' : 'text-gray-400'}`}>
              {s.label}
            </span>
            {i < STEPS.length - 1 && <span className="mx-4 text-gray-300">—</span>}
          </li>
        );
      })}
    </ol>
  );
}
