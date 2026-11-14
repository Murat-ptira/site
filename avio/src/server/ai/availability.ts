import "server-only";

import {
  MODELS,
  PROVIDERS,
  PROVIDER_IDS,
  type CatalogModel,
  type ProviderId,
} from "@/config/catalog";
import type { ModelDTO, ModelsDTO, ProviderStatus } from "@/lib/types";
import { unitsPer1kTokens } from "@/server/billing/pricing";
import { prisma } from "@/server/db";
import { HttpError } from "@/server/http/errors";

import { ProviderError } from "./errors";
import { getAdapter } from "./registry";
import type { ProviderAdapter } from "./types";

/**
 * Decides which models users are offered. A model is available only when
 *   - its provider is enabled in the AIProvider table,
 *   - the provider's API key is configured, and
 *   - the provider itself lists the model for that key.
 * Asking the provider means a wrong key or a retired model id simply hides the
 * model instead of failing in the middle of a conversation.
 */

export interface ProviderState {
  id: ProviderId;
  name: string;
  apiKeyEnv: string;
  status: ProviderStatus;
  models: CatalogModel[];
}

type Probe =
  | { status: "ready"; modelIds: Set<string> }
  | { status: "auth_failed" | "unreachable" };

const READY_TTL_MS = 5 * 60 * 1000;
// Recheck failures quickly so a fixed key or a recovered provider shows up soon.
const FAILURE_TTL_MS = 30 * 1000;
const PROBE_TIMEOUT_MS = 6000;

const probes = new Map<ProviderId, { expiresAt: number; probe: Promise<Probe> }>();

async function probe(adapter: ProviderAdapter): Promise<Probe> {
  try {
    const ids = await adapter.listModelIds(AbortSignal.timeout(PROBE_TIMEOUT_MS));
    return { status: "ready", modelIds: new Set(ids) };
  } catch (error) {
    const code = error instanceof ProviderError ? error.code : "internal";
    // Never log the error object itself: SDK errors can echo request headers.
    console.warn(`[ai] ${adapter.id} model listing failed: ${code}`);
    return { status: code === "provider_auth" ? "auth_failed" : "unreachable" };
  }
}

function cachedProbe(adapter: ProviderAdapter): Promise<Probe> {
  const now = Date.now();
  const cached = probes.get(adapter.id);
  if (cached && cached.expiresAt > now) return cached.probe;

  const pending = probe(adapter);
  // Assume the short TTL until the result is known, then extend on success.
  const entry = { expiresAt: now + FAILURE_TTL_MS, probe: pending };
  probes.set(adapter.id, entry);
  void pending.then((result) => {
    if (result.status === "ready") entry.expiresAt = Date.now() + READY_TTL_MS;
  });
  return pending;
}

/** Providers also list dated snapshots, e.g. "claude-x-20260101" for "claude-x". */
function isListed(modelId: string, listed: Set<string>): boolean {
  if (listed.has(modelId)) return true;
  const snapshot = new RegExp(`^${modelId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}-\\d{8}$`);
  for (const id of listed) if (snapshot.test(id)) return true;
  return false;
}

let providersSynced: Promise<void> | undefined;

/** Makes sure every provider in the catalog has its AIProvider row. */
function syncProviders(): Promise<void> {
  providersSynced ??= prisma.aIProvider
    .createMany({
      data: PROVIDER_IDS.map((id) => ({ id, name: PROVIDERS[id].name })),
      skipDuplicates: true,
    })
    .then(() => undefined)
    .catch((error: unknown) => {
      providersSynced = undefined;
      throw error;
    });
  return providersSynced;
}

export async function getProviderStates(): Promise<ProviderState[]> {
  await syncProviders();
  const rows = await prisma.aIProvider.findMany({
    select: { id: true, isEnabled: true },
  });
  const enabled = new Map(rows.map((row) => [row.id, row.isEnabled]));

  return Promise.all(
    PROVIDER_IDS.map(async (id): Promise<ProviderState> => {
      const info = PROVIDERS[id];
      const base = { id, name: info.name, apiKeyEnv: info.apiKeyEnv };
      const adapter = getAdapter(id);

      if (enabled.get(id) === false) return { ...base, status: "disabled", models: [] };
      if (!adapter.isConfigured()) {
        return { ...base, status: "not_configured", models: [] };
      }
      const result = await cachedProbe(adapter);
      if (result.status !== "ready") return { ...base, status: result.status, models: [] };
      return {
        ...base,
        status: "ready",
        models: MODELS.filter(
          (model) => model.provider === id && isListed(model.id, result.modelIds),
        ),
      };
    }),
  );
}

/** Resolves a model id for use in a request, or fails with a clear 422. */
export async function requireAvailableModel(id: string): Promise<CatalogModel> {
  const states = await getProviderStates();
  for (const state of states) {
    const model = state.models.find((candidate) => candidate.id === id);
    if (model) return model;
  }
  throw new HttpError(
    422,
    "model_unavailable",
    "That model is not available right now. Pick another one.",
  );
}

function toModelDTO(model: CatalogModel): ModelDTO {
  return {
    id: model.id,
    provider: model.provider,
    providerName: PROVIDERS[model.provider].name,
    label: model.label,
    tier: model.tier,
    description: model.description,
    inputUnitsPer1k: unitsPer1kTokens(model.pricing.inputUsdPerMTok),
    outputUnitsPer1k: unitsPer1kTokens(model.pricing.outputUsdPerMTok),
  };
}

export async function getModelsDTO(): Promise<ModelsDTO> {
  const states = await getProviderStates();
  return {
    models: states.flatMap((state) => state.models.map(toModelDTO)),
    providers: states.map((state) => ({
      id: state.id,
      name: state.name,
      status: state.status,
      apiKeyEnv: state.apiKeyEnv,
      modelCount: state.models.length,
    })),
  };
}

/** Test hook: forget cached provider probes. */
export function resetAvailabilityCache(): void {
  probes.clear();
  providersSynced = undefined;
}
