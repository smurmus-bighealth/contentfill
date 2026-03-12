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
import type { DryRunResult, ApplyResult } from '@/lib/migration';
import type { TransformResult } from '@/lib/transforms';
import type { ContentTypeSummary } from '@/lib/contentful';
import type { CTDryRunOutcome, SchemaApplyResult, CTDeleteOutcome, SchemaDeleteResult } from '@/lib/schema-migration-shared';
import { dryRunSchemaChange, dryRunDeleteField } from '@/lib/schema-migration-shared';

// ── Shared bootstrap data ─────────────────────────────────────────────────────

interface BootstrapData {
  contentTypes: ContentTypeSummary[];
  spaceId: string;
  environment: string;
}

const BOOTSTRAP_CACHE_KEY = 'contentful-admin:bootstrap';

function clearBootstrapCache() {
  try { sessionStorage.removeItem(BOOTSTRAP_CACHE_KEY); } catch { /* ignore */ }
}

// ── Step / workflow types ─────────────────────────────────────────────────────

type FlowStep = 'config' | 'preview' | 'apply';
type Workflow = 'update-entries' | 'add-field' | 'delete-field';

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
        const data: BootstrapData = { contentTypes: d.contentTypes, spaceId: d.spaceId, environment: d.environment };
        try { sessionStorage.setItem(BOOTSTRAP_CACHE_KEY, JSON.stringify(data)); } catch { /* ignore */ }
        setBootstrapData(data);
      })
      .catch(() => { /* ConfigStep handles errors for update-entries tab */ });
  }, []);

  const contentTypes = useMemo(() => bootstrapData?.contentTypes ?? [], [bootstrapData]);
  const spaceId = bootstrapData?.spaceId ?? '';
  const environment = bootstrapData?.environment ?? 'master';

  // After a schema mutation, bust the bootstrap cache and silently re-fetch.
  // We do NOT clear bootstrapData in state — old data stays visible until fresh data arrives
  // so the results screen never flickers to "Loading…".
  function invalidateBootstrap() {
    clearBootstrapCache();
    apiFetch<BootstrapData & { transforms: unknown[] }>('/api/content-types')
      .then((d) => {
        const data: BootstrapData = { contentTypes: d.contentTypes, spaceId: d.spaceId, environment: d.environment };
        try { sessionStorage.setItem(BOOTSTRAP_CACHE_KEY, JSON.stringify(data)); } catch { /* ignore */ }
        setBootstrapData(data);
      })
      .catch(() => { /* ignore */ });
  }

  return (
    <div className="space-y-6">
      {/* Workflow tabs */}
      <div className="flex gap-1 rounded-lg border border-gray-200 bg-white p-1 shadow-sm w-fit">
        <WorkflowTab active={workflow === 'update-entries'} onClick={() => setWorkflow('update-entries')} label="Update Entries" />
        <WorkflowTab active={workflow === 'add-field'} onClick={() => setWorkflow('add-field')} label="Add Field" />
        <WorkflowTab active={workflow === 'delete-field'} onClick={() => setWorkflow('delete-field')} label="Delete Field" />
      </div>

      {workflow === 'update-entries' && (
        <UpdateEntriesFlow spaceId={spaceId} environment={environment} />
      )}
      {workflow === 'add-field' && (
        <AddFieldFlow
          contentTypes={contentTypes}
          spaceId={spaceId}
          environment={environment}
          onSuccess={invalidateBootstrap}
        />
      )}
      {workflow === 'delete-field' && (
        <DeleteFieldFlow
          contentTypes={contentTypes}
          spaceId={spaceId}
          environment={environment}
          onSuccess={invalidateBootstrap}
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
  onSuccess: () => void;
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
      if (result.succeeded.length > 0) onSuccess();
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
  onSuccess: () => void;
}) {
  const [step, setStep] = useState<FlowStep>('config');
  const [deleteValues, setDeleteValues] = useState<DeleteFieldValues | null>(null);
  const [outcomes, setOutcomes] = useState<CTDeleteOutcome[]>([]);
  // Snapshot the CT list at submit time — the preview shows the pre-delete shape
  const [deleteCtSnapshot, setDeleteCtSnapshot] = useState<ContentTypeSummary[]>([]);
  const [applyResult, setApplyResult] = useState<SchemaDeleteResult | null>(null);
  const [isApplying, setIsApplying] = useState(false);
  const [applyPhaseLabel, setApplyPhaseLabel] = useState<string | null>(null);
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
      setApplyPhaseLabel('Phase 1 of 2: marking field as omitted…');
      const phase1 = await apiFetch<SchemaDeleteResult>('/api/schema-delete', {
        method: 'POST',
        json: { selectedCTs: cts, fieldId: deleteValues.fieldId, phase: 'omit' },
      });

      // Phase 2: remove field from schema — only the CTs that passed phase 1
      setApplyPhaseLabel('Phase 2 of 2: removing field from schema…');
      const phase2 = await apiFetch<SchemaDeleteResult>('/api/schema-delete', {
        method: 'POST',
        json: { selectedCTs: phase1.succeeded, fieldId: deleteValues.fieldId, phase: 'remove' },
      });

      const result: SchemaDeleteResult = {
        succeeded: phase2.succeeded,
        failed: [...phase1.failed, ...phase2.failed],
      };
      setApplyResult(result);
      setStep('apply');
      if (result.succeeded.length > 0) onSuccess();
    } catch (e) {
      setApplyError((e as Error).message);
    } finally {
      setIsApplying(false);
      setApplyPhaseLabel(null);
    }
  }

  function reset() {
    setStep('config');
    setDeleteValues(null);
    setOutcomes([]);
    setDeleteCtSnapshot([]);
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
            applyPhaseLabel={applyPhaseLabel}
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
