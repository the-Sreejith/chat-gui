import { prisma } from './prisma';

export interface ModelWithProvider {
  id: string;
  modelName: string;
  modelIdentifier: string;
  inputPricePer1kTokens: number;
  outputPricePer1kTokens: number;
  contextLength: number;
  provider: {
    id: string;
    name: string;
    displayName: string;
  };
}

export async function getActiveModels(): Promise<ModelWithProvider[]> {
  const models = await prisma.model.findMany({
    where: {
      isActive: true,
      provider: {
        isActive: true,
      },
    },
    include: {
      provider: true,
    },
    orderBy: [
      { provider: { name: 'asc' } },
      { modelName: 'asc' },
    ],
  });

  return models.map(model => ({
    id: model.id,
    modelName: model.modelName,
    modelIdentifier: model.modelIdentifier,
    inputPricePer1kTokens: Number(model.inputPricePer1kTokens),
    outputPricePer1kTokens: Number(model.outputPricePer1kTokens),
    contextLength: model.contextLength,
    provider: {
      id: model.provider.id,
      name: model.provider.name,
      displayName: model.provider.displayName,
    },
  }));
}

export async function getModelById(modelId: string): Promise<ModelWithProvider | null> {
  const model = await prisma.model.findUnique({
    where: { id: modelId },
    include: {
      provider: true,
    },
  });

  if (!model) return null;

  return {
    id: model.id,
    modelName: model.modelName,
    modelIdentifier: model.modelIdentifier,
    inputPricePer1kTokens: Number(model.inputPricePer1kTokens),
    outputPricePer1kTokens: Number(model.outputPricePer1kTokens),
    contextLength: model.contextLength,
    provider: {
      id: model.provider.id,
      name: model.provider.name,
      displayName: model.provider.displayName,
    },
  };
}

export async function seedModels() {
  // Create providers
  const openrouterProvider = await prisma.provider.upsert({
    where: { name: 'openrouter' },
    update: {},
    create: {
      name: 'openrouter',
      displayName: 'OpenRouter',
      isActive: true,
    },
  });

  const geminiProvider = await prisma.provider.upsert({
    where: { name: 'gemini' },
    update: {},
    create: {
      name: 'gemini',
      displayName: 'Google Gemini',
      isActive: true,
    },
  });

  // OpenRouter models
  const openrouterModels = [
    {
      modelName: 'Claude 3.5 Sonnet',
      modelIdentifier: 'anthropic/claude-3.5-sonnet',
      inputPricePer1kTokens: 0.003,
      outputPricePer1kTokens: 0.015,
      contextLength: 200000,
    },
    {
      modelName: 'Claude 3.5 Haiku',
      modelIdentifier: 'anthropic/claude-3.5-haiku',
      inputPricePer1kTokens: 0.0008,
      outputPricePer1kTokens: 0.004,
      contextLength: 200000,
    },
    {
      modelName: 'GPT-4o',
      modelIdentifier: 'openai/gpt-4o',
      inputPricePer1kTokens: 0.005,
      outputPricePer1kTokens: 0.015,
      contextLength: 128000,
    },
    {
      modelName: 'GPT-4o Mini',
      modelIdentifier: 'openai/gpt-4o-mini',
      inputPricePer1kTokens: 0.00015,
      outputPricePer1kTokens: 0.0006,
      contextLength: 128000,
    },
    {
      modelName: 'DeepSeek V3',
      modelIdentifier: 'deepseek/deepseek-chat',
      inputPricePer1kTokens: 0.00014,
      outputPricePer1kTokens: 0.00028,
      contextLength: 64000,
    },
  ];

  for (const model of openrouterModels) {
    await prisma.model.upsert({
      where: { modelIdentifier: model.modelIdentifier },
      update: {},
      create: {
        ...model,
        providerId: openrouterProvider.id,
        isActive: true,
      },
    });
  }

  // Gemini models
  const geminiModels = [
    {
      modelName: 'Gemini 1.5 Pro',
      modelIdentifier: 'gemini-1.5-pro',
      inputPricePer1kTokens: 0.00125,
      outputPricePer1kTokens: 0.005,
      contextLength: 2000000,
    },
    {
      modelName: 'Gemini 1.5 Flash',
      modelIdentifier: 'gemini-1.5-flash',
      inputPricePer1kTokens: 0.000075,
      outputPricePer1kTokens: 0.0003,
      contextLength: 1000000,
    },
  ];

  for (const model of geminiModels) {
    await prisma.model.upsert({
      where: { modelIdentifier: model.modelIdentifier },
      update: {},
      create: {
        ...model,
        providerId: geminiProvider.id,
        isActive: true,
      },
    });
  }
}