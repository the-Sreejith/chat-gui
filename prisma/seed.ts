// import { PrismaClient } from '@prisma/client';
const { PrismaClient } = require('@prisma/client');


const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting database seeding...');

  // Create providers first
  console.log('📦 Creating providers...');
  
  const openrouterProvider = await prisma.provider.upsert({
    where: { name: 'openrouter' },
    update: {
      displayName: 'OpenRouter',
      isActive: true,
    },
    create: {
      name: 'openrouter',
      displayName: 'OpenRouter',
      isActive: true,
    },
  });

  const geminiProvider = await prisma.provider.upsert({
    where: { name: 'gemini' },
    update: {
      displayName: 'Google Gemini',
      isActive: true,
    },
    create: {
      name: 'gemini',
      displayName: 'Google Gemini',
      isActive: true,
    },
  });

  console.log(`✅ Created providers: ${openrouterProvider.displayName}, ${geminiProvider.displayName}`);

  // Seed OpenRouter models with the specified data
  console.log('🤖 Seeding OpenRouter models...');
  
  const openrouterModels = [
    {
      modelName: 'Claude 3.5 Sonnet',
      modelIdentifier: 'claude-sonnet-4',
      inputPricePer1kTokens: 0.003,
      outputPricePer1kTokens: 0.015,
      basePricePer1kTokens: null,
      contextLength: 200000,
      isActive: true,
    },
    {
      modelName: 'Claude 3.7 Sonnet',
      modelIdentifier: 'claude-3.7-sonnet',
      inputPricePer1kTokens: 0.006,
      outputPricePer1kTokens: 0.018,
      basePricePer1kTokens: null,
      contextLength: 200000,
      isActive: true,
    },
    {
      modelName: 'Mistral Small 3.2 24B Instruct',
      modelIdentifier: 'mistral-small-3.2-24b-instruct',
      inputPricePer1kTokens: 0.0004,
      outputPricePer1kTokens: 0.0004,
      basePricePer1kTokens: null,
      contextLength: 32000,
      isActive: true,
    },
    {
      modelName: 'Kimi Dev 72B',
      modelIdentifier: 'kimi-dev-72b',
      inputPricePer1kTokens: 0.002,
      outputPricePer1kTokens: 0.002,
      basePricePer1kTokens: null,
      contextLength: 32000,
      isActive: true,
    },
    {
      modelName: 'DeepSeek R1 0528',
      modelIdentifier: 'deepseek-r1-0528',
      inputPricePer1kTokens: 0.0006,
      outputPricePer1kTokens: 0.0006,
      basePricePer1kTokens: null,
      contextLength: 32768,
      isActive: true,
    },
    {
      modelName: 'DeepSeek R1 0528 Qwen3 8B',
      modelIdentifier: 'deepseek-r1-0528-qwen3-8b',
      inputPricePer1kTokens: 0.0005,
      outputPricePer1kTokens: 0.0005,
      basePricePer1kTokens: null,
      contextLength: 32768,
      isActive: true,
    },
  ];

  for (const model of openrouterModels) {
    const createdModel = await prisma.model.upsert({
      where: { modelIdentifier: model.modelIdentifier },
      update: {
        modelName: model.modelName,
        inputPricePer1kTokens: model.inputPricePer1kTokens,
        outputPricePer1kTokens: model.outputPricePer1kTokens,
        basePricePer1kTokens: model.basePricePer1kTokens,
        contextLength: model.contextLength,
        isActive: model.isActive,
        providerId: openrouterProvider.id,
      },
      create: {
        modelName: model.modelName,
        modelIdentifier: model.modelIdentifier,
        inputPricePer1kTokens: model.inputPricePer1kTokens,
        outputPricePer1kTokens: model.outputPricePer1kTokens,
        basePricePer1kTokens: model.basePricePer1kTokens,
        contextLength: model.contextLength,
        isActive: model.isActive,
        providerId: openrouterProvider.id,
      },
    });
    console.log(`  ✅ ${createdModel.modelName}`);
  }

  // Seed some additional popular Gemini models for comparison
  console.log('🧠 Seeding Gemini models...');
  
  const geminiModels = [
    {
      modelName: 'Gemini 1.5 Pro',
      modelIdentifier: 'gemini-1.5-pro',
      inputPricePer1kTokens: 0.00125,
      outputPricePer1kTokens: 0.005,
      basePricePer1kTokens: null,
      contextLength: 2000000,
      isActive: true,
    },
    {
      modelName: 'Gemini 1.5 Flash',
      modelIdentifier: 'gemini-1.5-flash',
      inputPricePer1kTokens: 0.000075,
      outputPricePer1kTokens: 0.0003,
      basePricePer1kTokens: null,
      contextLength: 1000000,
      isActive: true,
    },
    {
      modelName: 'Gemini 1.5 Flash-8B',
      modelIdentifier: 'gemini-1.5-flash-8b',
      inputPricePer1kTokens: 0.0000375,
      outputPricePer1kTokens: 0.00015,
      basePricePer1kTokens: null,
      contextLength: 1000000,
      isActive: true,
    },
  ];

  for (const model of geminiModels) {
    const createdModel = await prisma.model.upsert({
      where: { modelIdentifier: model.modelIdentifier },
      update: {
        modelName: model.modelName,
        inputPricePer1kTokens: model.inputPricePer1kTokens,
        outputPricePer1kTokens: model.outputPricePer1kTokens,
        basePricePer1kTokens: model.basePricePer1kTokens,
        contextLength: model.contextLength,
        isActive: model.isActive,
        providerId: geminiProvider.id,
      },
      create: {
        modelName: model.modelName,
        modelIdentifier: model.modelIdentifier,
        inputPricePer1kTokens: model.inputPricePer1kTokens,
        outputPricePer1kTokens: model.outputPricePer1kTokens,
        basePricePer1kTokens: model.basePricePer1kTokens,
        contextLength: model.contextLength,
        isActive: model.isActive,
        providerId: geminiProvider.id,
      },
    });
    console.log(`  ✅ ${createdModel.modelName}`);
  }

  // Display summary
  const totalModels = await prisma.model.count();
  const totalProviders = await prisma.provider.count();
  
  console.log('\n📊 Seeding Summary:');
  console.log(`  • Providers: ${totalProviders}`);
  console.log(`  • Models: ${totalModels}`);
  console.log(`  • OpenRouter Models: ${openrouterModels.length}`);
  console.log(`  • Gemini Models: ${geminiModels.length}`);
  
  console.log('\n🎉 Database seeding completed successfully!');
}

main()
  .catch((e) => {
    console.error('❌ Error during seeding:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });