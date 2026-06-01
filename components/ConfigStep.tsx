'use client';

import { useEffect, useMemo, useState } from 'react';
import { apiFetch } from '@/lib/api-client';
import type { ContentTypeSummary, ContentTypeField, SampleEntry } from '@/lib/contentful';
import type { ConfigFieldDef, BrokenTransform } from '@/lib/transforms';
import { groupContentTypes } from '@/lib/group-content-types';
import ContentTypeInspector from './ContentTypeInspector';

interface TransformMeta {
  id: string;
  label: string;
  description: string;
  configSchema: ConfigFieldDef[];
  /** Contentful field types this transform may write to. Undefined = all types. */
  targetFieldTypes?: string[];
}

interface BootstrapData {
  contentTypes: ContentTypeSummary[];
  transforms?: TransformMeta[];
  brokenTransforms?: BrokenTransform[];
  spaceId: string;
  environment: string;
  anthropicEnabled?: boolean;
}

export interface ConfigValues {
  contentType: string;
  contentTypeName: string;
  targetField: string;
  transformId: string;
  transformConfig: Record<string, unknown>;
  locale: string;
  skipExisting: boolean;
  /** JavaScript function body used when transformId === 'ai-inline' */
  inlineCode?: string;
  targetFieldRequired: boolean;
}

interface Props {
  onSubmit: (values: ConfigValues) => void;
}

export default function ConfigStep({ onSubmit }: Props) {
  const [data, setData] = useState<BootstrapData | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [ctSearch, setCtSearch] = useState('');
  const [selectedCT, setSelectedCT] = useState('');
  const [sampleEntry, setSampleEntry] = useState<SampleEntry | null | 'loading' | 'error'>('loading');
  const [targetField, setTargetField] = useState('');
  const [selectedTransform, setSelectedTransform] = useState('');
  const [transformConfig, setTransformConfig] = useState<Record<string, unknown>>({});
  const [locale, setLocale] = useState('en-US');
  const [skipExisting, setSkipExisting] = useState(true);

  const [aiOpen, setAiOpen] = useState(false);
  const [aiDescription, setAiDescription] = useState('');
  const [aiGenerating, setAiGenerating] = useState(false);
  const [aiCode, setAiCode] = useState('');
  const [aiLabel, setAiLabel] = useState('');
  const [aiError, setAiError] = useState('');
  const [aiCopied, setAiCopied] = useState(false);
  // true when the currently-shown aiCode has been explicitly activated via "Use this transform"
  const [aiCodeActivated, setAiCodeActivated] = useState(false);

  useEffect(() => {
    const CACHE_KEY = 'contentful-admin:bootstrap';
    try {
      const cached = sessionStorage.getItem(CACHE_KEY);
      if (cached) {
        setData(JSON.parse(cached) as BootstrapData);
        return;
      }
    } catch {
      // sessionStorage unavailable (private browsing restrictions, etc.) — fall through
    }
    apiFetch<BootstrapData>('/api/content-types')
      .then((d) => {
        try { sessionStorage.setItem(CACHE_KEY, JSON.stringify(d)); } catch { /* ignore */ }
        setData(d);
      })
      .catch((e) => setLoadError(e.message));
  }, []);

  // Fetch sample entry once per selected content type — single fetch shared by both inspector instances
  useEffect(() => {
    if (!selectedCT) return;
    let ignore = false;
    const CACHE_KEY = `contentful-admin:sample:${selectedCT}`;
    try {
      const cached = sessionStorage.getItem(CACHE_KEY);
      if (cached) { setSampleEntry(JSON.parse(cached) as SampleEntry | null); return; }
    } catch { /* ignore */ }
    setSampleEntry('loading');
    apiFetch<{ entry: SampleEntry | null }>(`/api/sample-entry?contentType=${encodeURIComponent(selectedCT)}`)
      .then((res) => {
        if (ignore) return;
        try { sessionStorage.setItem(CACHE_KEY, JSON.stringify(res.entry)); } catch { /* ignore */ }
        setSampleEntry(res.entry);
      })
      .catch(() => { if (!ignore) setSampleEntry('error'); });
    return () => { ignore = true; };
  }, [selectedCT]);

  const ct = data?.contentTypes.find((c) => c.id === selectedCT) ?? null;
  const transform = (data?.transforms ?? []).find((t) => t.id === selectedTransform) ?? null;

  const filteredCTs = useMemo(() => {
    if (!data) return [];
    const q = ctSearch.toLowerCase().trim();
    if (!q) return data.contentTypes;
    return data.contentTypes.filter(
      (c) => c.name.toLowerCase().includes(q) || c.id.toLowerCase().includes(q),
    );
  }, [data, ctSearch]);

  const groupedCTs = useMemo(() => groupContentTypes(filteredCTs), [filteredCTs]);

  // Derive the target field's type so we can gate transforms
  const targetFieldType = ct?.fields.find((f) => f.id === targetField)?.type ?? null;

  function transformAllowed(t: TransformMeta) {
    if (!t.targetFieldTypes) return true;
    if (!targetFieldType) return true;
    return t.targetFieldTypes.includes(targetFieldType);
  }

  // Auto-clear selected transform when it becomes incompatible with the new target field
  useEffect(() => {
    if (selectedTransform && data) {
      const t = (data.transforms ?? []).find((x) => x.id === selectedTransform);
      if (t && !transformAllowed(t)) setSelectedTransform('');
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetField]);

  // Auto-populate transform config defaults when transform changes
  useEffect(() => {
    if (!transform) return;
    const defaults: Record<string, unknown> = {};
    for (const field of transform.configSchema) {
      if (field.defaultValue !== undefined) defaults[field.id] = field.defaultValue;
    }
    setTransformConfig(defaults);
  }, [selectedTransform]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleGenerateTransform() {
    if (!ct || !aiDescription.trim()) return;
    setAiGenerating(true);
    setAiCode('');
    setAiLabel('');
    setAiError('');
    setAiCodeActivated(false);
    try {
      const res = await apiFetch<{ code: string; label: string; description: string }>('/api/generate-transform', {
        method: 'POST',
        json: { description: aiDescription, fields: ct.fields.map((f) => f.id) },
      });
      setAiCode(res.code);
      setAiLabel(res.label);
    } catch (e) {
      setAiError(e instanceof Error ? e.message : String(e));
    } finally {
      setAiGenerating(false);
    }
  }

  function handleConfigChange(fieldId: string, value: unknown) {
    setTransformConfig((prev) => ({ ...prev, [fieldId]: value }));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedCT || !targetField || !selectedTransform || !ct) return;
    const targetFieldDef = ct.fields.find((f) => f.id === targetField);
    onSubmit({
      contentType: selectedCT,
      contentTypeName: ct.name,
      targetField,
      transformId: selectedTransform,
      transformConfig,
      locale,
      skipExisting,
      targetFieldRequired: targetFieldDef?.required ?? false,
      ...(selectedTransform === 'ai-inline' ? { inlineCode: aiCode } : {}),
    });
  }

  if (loadError) {
    const missingToken = loadError.includes('CONTENTFUL_MANAGEMENT_TOKEN');
    const missingSpace = loadError.includes('CONTENTFUL_SPACE_ID');

    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-5 text-red-800 space-y-3">
        <p className="font-semibold">Failed to load Contentful data</p>

        {missingToken && (
          <div className="text-sm space-y-1">
            <p>
              <code className="rounded bg-red-100 px-1 py-0.5 font-mono text-xs">CONTENTFUL_MANAGEMENT_TOKEN</code> is not set in your <code className="rounded bg-red-100 px-1 py-0.5 font-mono text-xs">.env</code>.
            </p>
            <p>
              Generate a personal CMA token at{' '}
              <a
                href="https://app.contentful.com/account/api_key_management"
                target="_blank"
                rel="noopener noreferrer"
                className="underline hover:text-red-600"
              >
                app.contentful.com → Account → API key management ↗
              </a>
              , then add it to your <code className="rounded bg-red-100 px-1 py-0.5 font-mono text-xs">.env</code> file:
            </p>
            <pre className="mt-1 rounded bg-red-100 px-3 py-2 font-mono text-xs">CONTENTFUL_MANAGEMENT_TOKEN=your-token-here</pre>
          </div>
        )}

        {missingSpace && (
          <div className="text-sm space-y-1">
            <p>
              <code className="rounded bg-red-100 px-1 py-0.5 font-mono text-xs">CONTENTFUL_SPACE_ID</code> is not set in your <code className="rounded bg-red-100 px-1 py-0.5 font-mono text-xs">.env</code>.
            </p>
            <p>
              Find your Space ID in{' '}
              <a
                href="https://app.contentful.com/"
                target="_blank"
                rel="noopener noreferrer"
                className="underline hover:text-red-600"
              >
                Contentful ↗
              </a>{' '}
              under <strong>Settings → General settings</strong>, or read it from the URL:{' '}
              <code className="rounded bg-red-100 px-1 py-0.5 font-mono text-xs">app.contentful.com/spaces/&lt;SPACE_ID&gt;</code>.
              Then add it to your <code className="rounded bg-red-100 px-1 py-0.5 font-mono text-xs">.env</code>:
            </p>
            <pre className="mt-1 rounded bg-red-100 px-3 py-2 font-mono text-xs">CONTENTFUL_SPACE_ID=your-space-id</pre>
          </div>
        )}

        {!missingToken && !missingSpace && (
          <p className="text-sm">{loadError}</p>
        )}
      </div>
    );
  }

  if (!data) {
    return <div className="text-gray-500">Loading content types…</div>;
  }

  const isReady = !!(
    selectedCT && targetField && selectedTransform &&
    (selectedTransform !== 'ai-inline' || !!aiCode)
  );

  return (
    <div className="flex gap-6 items-start">
      {/* ── Main form column ── */}
      <form onSubmit={handleSubmit} className="flex-1 min-w-0">
        <div className="space-y-6 pb-2">
          {/* 1. Content type */}
          <fieldset className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
            <legend className="px-1 text-sm font-semibold text-gray-700">1. Content type</legend>

            {/* Search */}
            <div className="mt-3 mb-4">
              <input
                type="search"
                placeholder="Search content types…"
                value={ctSearch}
                onChange={(e) => setCtSearch(e.target.value)}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm placeholder:text-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>

            {filteredCTs.length === 0 && (
              <p className="text-sm text-gray-400">No content types match your search.</p>
            )}

            {/* Grouped categories */}
            <div className="space-y-4">
              {Array.from(groupedCTs.groups.entries()).map(([parent, children]) => (
                <div key={parent}>
                  <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-gray-500">{parent}</p>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                    {children.map((c) => {
                      const subLabel = c.name.slice(parent.length + 2);
                      return (
                        <label key={c.id} className="flex cursor-pointer items-center gap-2 rounded-md border p-3 hover:bg-gray-50 has-[:checked]:border-blue-500 has-[:checked]:bg-blue-50">
                          <input
                            type="radio"
                            name="contentType"
                            value={c.id}
                            checked={selectedCT === c.id}
                            onChange={() => { setSelectedCT(c.id); setTargetField(''); setSelectedTransform(''); setSampleEntry('loading'); setAiCode(''); setAiLabel(''); setAiError(''); setAiCodeActivated(false); }}
                            onClick={() => { if (selectedCT === c.id) { setSelectedCT(''); setTargetField(''); setSelectedTransform(''); setSampleEntry('loading'); setAiCode(''); setAiLabel(''); setAiError(''); setAiCodeActivated(false); } }}
                            className="accent-blue-600"
                          />
                          <span className="text-sm">
                            <span className="block font-medium">{subLabel}</span>
                            <span className="text-xs text-gray-400">{c.id}</span>
                          </span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              ))}

              {groupedCTs.ungrouped.length > 0 && (
                <div>
                  {groupedCTs.groups.size > 0 && (
                    <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-gray-500">Other</p>
                  )}
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                    {groupedCTs.ungrouped.map((c) => (
                      <label key={c.id} className="flex cursor-pointer items-center gap-2 rounded-md border p-3 hover:bg-gray-50 has-[:checked]:border-blue-500 has-[:checked]:bg-blue-50">
                        <input
                          type="radio"
                          name="contentType"
                          value={c.id}
                          checked={selectedCT === c.id}
                          onChange={() => { setSelectedCT(c.id); setTargetField(''); setSelectedTransform(''); setSampleEntry('loading'); setAiCode(''); setAiLabel(''); setAiError(''); setAiCodeActivated(false); }}
                            onClick={() => { if (selectedCT === c.id) { setSelectedCT(''); setTargetField(''); setSelectedTransform(''); setSampleEntry('loading'); setAiCode(''); setAiLabel(''); setAiError(''); setAiCodeActivated(false); } }}
                          className="accent-blue-600"
                        />
                        <span className="text-sm">
                          <span className="block font-medium">{c.name}</span>
                          <span className="text-xs text-gray-400">{c.id}</span>
                        </span>
                      </label>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </fieldset>

          {/* Mobile inspector — collapsible, shown only when a CT is selected */}
          {ct && (
            <details className="lg:hidden group rounded-lg border border-gray-200 bg-white shadow-sm overflow-hidden">
              <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3 text-sm font-medium text-gray-700 select-none">
                <span>Schema &amp; sample: <span className="font-semibold">{ct.name}</span></span>
                <svg className="h-4 w-4 shrink-0 text-gray-400 transition-transform group-open:rotate-180" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
                </svg>
              </summary>
              <div className="border-t border-gray-100">
                <ContentTypeInspector ct={ct} locale={locale} spaceId={data.spaceId} environment={data.environment} sample={sampleEntry} />
              </div>
            </details>
          )}

          {/* 2. Target field */}
          {ct && (
            <fieldset className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
              <legend className="px-1 text-sm font-semibold text-gray-700">2. Target field (field to write to)</legend>
              <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
                {ct.fields.map((f) => (
                  <label key={f.id} className="flex cursor-pointer items-center gap-2 rounded-md border p-3 hover:bg-gray-50 has-[:checked]:border-blue-500 has-[:checked]:bg-blue-50">
                    <input
                      type="radio"
                      name="targetField"
                      value={f.id}
                      checked={targetField === f.id}
                      onChange={() => setTargetField(f.id)}
                      onClick={() => { if (targetField === f.id) { setTargetField(''); setSelectedTransform(''); } }}
                      className="accent-blue-600"
                    />
                    <span className="text-sm">
                      <span className="block font-medium">{f.name}</span>
                      <span className="text-xs text-gray-400">{f.type}{f.required ? ' · required' : ''}</span>
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>
          )}

          {/* 3. Transform */}
          {targetField && (
            <fieldset className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
              <legend className="px-1 text-sm font-semibold text-gray-700">3. Transform</legend>
              <div className="mt-3 space-y-2">
                {(data.transforms ?? []).map((t) => {
                  const allowed = transformAllowed(t);
                  return (
                    <label
                      key={t.id}
                      className={`flex items-start gap-3 rounded-md border p-3 ${
                        allowed
                          ? 'cursor-pointer hover:bg-gray-50 has-[:checked]:border-blue-500 has-[:checked]:bg-blue-50'
                          : 'cursor-not-allowed opacity-45'
                      }`}
                    >
                      <input
                        type="radio"
                        name="transform"
                        value={t.id}
                        checked={selectedTransform === t.id}
                        disabled={!allowed}
                        onChange={() => setSelectedTransform(t.id)}
                        onClick={() => { if (selectedTransform === t.id) setSelectedTransform(''); }}
                        className="mt-0.5 accent-blue-600"
                      />
                      <span className="flex-1 min-w-0">
                        <span className="block font-medium text-sm">{t.label}</span>
                        <span className="text-xs text-gray-500">{t.description}</span>
                        {!allowed && t.targetFieldTypes && (
                          <span className="mt-1 block text-xs text-amber-600">
                            Requires: {t.targetFieldTypes.join(' · ')} field
                          </span>
                        )}
                      </span>
                    </label>
                  );
                })}
                {/* Broken transforms — shown as non-selectable with the reason */}
                {(data.brokenTransforms ?? []).map((t, i) => (
                  <div
                    key={t.id ?? `broken-${i}`}
                    className="flex items-start gap-3 rounded-md border border-red-200 bg-red-50 p-3 opacity-80"
                  >
                    <span className="mt-0.5 text-red-400 text-sm font-bold shrink-0">✕</span>
                    <span className="flex-1 min-w-0">
                      <span className="block font-medium text-sm text-red-800">
                        {t.label ?? t.id ?? 'Unknown transform'}
                      </span>
                      <span className="text-xs text-red-600">
                        Failed to load: {t.reason}. Check the transform file and restart the server.
                      </span>
                    </span>
                  </div>
                ))}
              </div>

              {/* AI transform generator — only shown when Anthropic is configured and a CT is selected */}
              {data.anthropicEnabled && ct && (
                <div className={`mt-4 rounded-md border overflow-hidden ${selectedTransform === 'ai-inline' ? 'border-purple-400' : 'border-purple-200'}`}>
                  <button
                    type="button"
                    onClick={() => setAiOpen((v) => !v)}
                    className={`flex w-full items-center justify-between px-4 py-3 text-sm font-medium text-purple-800 transition-colors ${selectedTransform === 'ai-inline' ? 'bg-purple-100 hover:bg-purple-200' : 'bg-purple-50 hover:bg-purple-100'}`}
                  >
                    <span className="flex items-center gap-2">
                      Generate with AI ✨
                      {selectedTransform === 'ai-inline' && (
                        <span className="rounded-full bg-purple-600 px-2 py-0.5 text-xs font-semibold text-white">Selected</span>
                      )}
                    </span>
                    <svg
                      className={`h-4 w-4 shrink-0 text-purple-400 transition-transform ${aiOpen ? 'rotate-180' : ''}`}
                      viewBox="0 0 20 20"
                      fill="currentColor"
                    >
                      <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
                    </svg>
                  </button>
                  {aiOpen && (
                    <div className="border-t border-purple-100 p-4 space-y-3 bg-white">
                      <p className="text-xs text-gray-500">
                        Describe what you want — AI will generate a transform and apply it directly.
                      </p>
                      <textarea
                        value={aiDescription}
                        onChange={(e) => setAiDescription(e.target.value)}
                        placeholder="e.g. copy the title field value to the seoTitle field"
                        rows={3}
                        className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm placeholder:text-gray-400 focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500"
                      />
                      <button
                        type="button"
                        onClick={handleGenerateTransform}
                        disabled={aiGenerating || !aiDescription.trim()}
                        className="rounded-md bg-purple-600 px-4 py-2 text-sm font-semibold text-white hover:bg-purple-700 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        {aiGenerating ? 'Generating…' : 'Generate'}
                      </button>
                      {aiError && (
                        <p className="text-xs text-red-600">{aiError}</p>
                      )}
                      {aiCode && (
                        <div className="space-y-2">
                          {aiLabel && (
                            <p className="text-xs font-medium text-gray-700">{aiLabel}</p>
                          )}
                          <pre className="overflow-x-auto rounded-md bg-gray-900 p-4 text-xs text-gray-100 whitespace-pre-wrap">{
                            `function apply(entry, config, allSnapshots) {\n${
                              aiCode.split('\n').map((l) => `  ${l}`).join('\n')
                            }\n}`
                          }</pre>
                          <div className="flex gap-2">
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedTransform('ai-inline');
                                setTransformConfig({});
                                setAiCodeActivated(true);
                                setAiOpen(false);
                              }}
                              className={`rounded-md px-4 py-2 text-sm font-semibold transition-colors ${
                                selectedTransform === 'ai-inline' && aiCodeActivated
                                  ? 'bg-purple-100 text-purple-800 border border-purple-300'
                                  : 'bg-purple-600 text-white hover:bg-purple-700'
                              }`}
                            >
                              {selectedTransform === 'ai-inline' && aiCodeActivated ? 'Using this transform ✓' : 'Use this transform'}
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                void navigator.clipboard.writeText(aiCode);
                                setAiCopied(true);
                                setTimeout(() => setAiCopied(false), 2000);
                              }}
                              className="rounded-md border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
                            >
                              {aiCopied ? 'Copied!' : 'Copy'}
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </fieldset>
          )}

          {/* 4. Transform config */}
          {transform && ct && (
            <fieldset className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
              <legend className="px-1 text-sm font-semibold text-gray-700">4. Transform options</legend>
              <div className="mt-3 space-y-4">
                {Array.isArray(transform.configSchema) && transform.configSchema.length > 0
                  ? transform.configSchema.map((field) => (
                    <TransformConfigField
                      key={field.id}
                      def={field}
                      value={transformConfig[field.id]}
                      onChange={(v) => handleConfigChange(field.id, v)}
                      ctFields={ct.fields}
                    />
                  ))
                  : <p className="text-sm text-gray-400">No options for this transform.</p>
                }
              </div>
            </fieldset>
          )}

          {/* 5. Options */}
          {selectedTransform && (
            <fieldset className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
              <legend className="px-1 text-sm font-semibold text-gray-700">5. Options</legend>
              <div className="mt-3 space-y-3">
                <label className="block text-sm">
                  <span className="font-medium text-gray-700">Locale</span>
                  <input
                    type="text"
                    value={locale}
                    onChange={(e) => setLocale(e.target.value)}
                    className="mt-1 block w-40 rounded border border-gray-300 px-3 py-1.5 text-sm"
                  />
                </label>
                <label className="flex cursor-pointer items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={skipExisting}
                    onChange={(e) => setSkipExisting(e.target.checked)}
                    className="accent-blue-600"
                  />
                  <span>Skip entries that already have a value in the target field</span>
                </label>
              </div>
            </fieldset>
          )}
        </div>

        {/* Sticky submit footer */}
        <div className="sticky bottom-0 -mx-4 px-4">
          {/* gradient fade */}
          <div
            className="pointer-events-none h-8"
            style={{ background: 'linear-gradient(to bottom, rgba(249,250,251,0), rgb(249,250,251))' }}
          />
          <div className="bg-gray-50 pb-6 pt-1">
            <button
              type="submit"
              disabled={!isReady}
              className="rounded-lg bg-blue-600 px-6 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Generate preview →
            </button>
          </div>
        </div>
      </form>

      {/* ── Inspector sidebar — large screens only ── */}
      {ct && (
        <div className="hidden lg:block w-80 shrink-0 sticky top-4 max-h-[calc(100vh-6rem)] overflow-y-auto rounded-lg">
          <ContentTypeInspector ct={ct} locale={locale} spaceId={data.spaceId} environment={data.environment} sample={sampleEntry} />
        </div>
      )}
    </div>
  );
}

function TransformConfigField({
  def,
  value,
  onChange,
  ctFields,
}: {
  def: ConfigFieldDef;
  value: unknown;
  onChange: (v: unknown) => void;
  ctFields: ContentTypeField[];
}) {
  const base = 'mt-1 block rounded border border-gray-300 px-3 py-1.5 text-sm w-full';

  return (
    <div>
      <label className="block text-sm font-medium text-gray-700">{def.label}</label>
      {def.description && <p className="text-xs text-gray-500">{def.description}</p>}

      {def.type === 'number' && (
        <input
          type="number"
          value={String(value ?? def.defaultValue ?? '')}
          onChange={(e) => onChange(Number(e.target.value))}
          className={`${base} w-24`}
          min={1}
        />
      )}

      {def.type === 'text' && (
        <input
          type="text"
          value={String(value ?? def.defaultValue ?? '')}
          onChange={(e) => onChange(e.target.value)}
          className={base}
        />
      )}

      {def.type === 'select' && (
        <select
          value={String(value ?? def.defaultValue ?? '')}
          onChange={(e) => onChange(e.target.value)}
          className={base}
        >
          {def.options?.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      )}

      {def.type === 'contentful-field' && (
        <select
          value={String(value ?? '')}
          onChange={(e) => onChange(e.target.value)}
          className={base}
        >
          <option value="">— select a field —</option>
          {ctFields
            .filter((f) => !def.fieldTypeFilter || def.fieldTypeFilter.includes(f.type))
            .map((f) => (
              <option key={f.id} value={f.id}>{f.name} ({f.type})</option>
            ))}
        </select>
      )}

      {!['number', 'text', 'select', 'contentful-field'].includes(def.type) && (
        <p className="mt-1 text-xs text-red-500">
          Unknown input type <code className="rounded bg-red-50 px-1">{def.type}</code> — update the transform&apos;s configSchema.
        </p>
      )}
    </div>
  );
}
