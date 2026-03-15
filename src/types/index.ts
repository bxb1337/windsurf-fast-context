export interface WindsurfProviderOptions {
  apiKey?: string;
  baseURL?: string;
  headers?: Record<string, string>;
  fetch?: FetchFn;
  generateId?: () => string;
}

/**
 * Windsurf provider interface extending AI SDK V2 ProviderV2 pattern.
 * The provider is callable as a function and has a languageModel method.
 */
export interface WindsurfProvider {
  (modelId?: string): DevstralLanguageModel;
  languageModel(modelId?: string): DevstralLanguageModel;
}

import type { DevstralLanguageModel } from '../model/devstral-language-model.js'

export type FetchFn = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

export interface Tool<Input = unknown, Output = unknown> {
  id: string;
  name?: string;
  run?: (input: Input) => Promise<Output> | Output;
}

export interface Model {
  id: string;
  name?: string;
  metadata?: Record<string, unknown>;
}

export interface Protocol {
  send(request: string): Promise<string>;
}

// Plan-required Devstral types
export type DevstralRole = 1 | 2 | 4 | 5;

export interface DevstralMetadata {
  [key: string]: unknown;
}

export interface DevstralMessage {
  id?: string;
  role: DevstralRole;
  content: string;
  metadata?: DevstralMetadata;
}

export interface DevstralToolDefinition {
  id: string;
  name?: string;
  description?: string;
}

export type WindsurfModelId = 'MODEL_SWE_1_6_FAST' | 'MODEL_SWE_1_6' | string;
