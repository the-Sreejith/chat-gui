'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { ChevronDown, Zap, DollarSign, Settings } from 'lucide-react';
import { ModelWithProvider } from '@/lib/models';
import { cn } from '@/lib/utils';
import Link from 'next/link';

interface ModelSelectorProps {
  selectedModelId?: string;
  onModelChange: (modelId: string) => void;
  className?: string;
}

export function ModelSelector({ selectedModelId, onModelChange, className }: ModelSelectorProps) {
  const [models, setModels] = useState<ModelWithProvider[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedModel, setSelectedModel] = useState<ModelWithProvider | null>(null);

  useEffect(() => {
    fetchModels();
  }, []);

  useEffect(() => {
    if (selectedModelId && models.length > 0) {
      const model = models.find(m => m.id === selectedModelId);
      setSelectedModel(model || null);
    }
  }, [selectedModelId, models]);

  const fetchModels = async () => {
    try {
      const response = await fetch('/api/models');
      if (response.ok) {
        const data = await response.json();
        setModels(data);
        
        // Set default model if none selected
        if (!selectedModelId && data.length > 0) {
          const defaultModel = data.find((m: ModelWithProvider) => 
            m.modelIdentifier === 'anthropic/claude-3.5-sonnet'
          ) || data[0];
          onModelChange(defaultModel.id);
        }
      }
    } catch (error) {
      console.error('Failed to fetch models:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const groupedModels = models.reduce((acc, model) => {
    const providerName = model.provider.displayName;
    if (!acc[providerName]) {
      acc[providerName] = [];
    }
    acc[providerName].push(model);
    return acc;
  }, {} as Record<string, ModelWithProvider[]>);

  const formatPrice = (price: number) => {
    return price < 0.001 ? `$${(price * 1000).toFixed(3)}/1M` : `$${price.toFixed(3)}/1K`;
  };

  if (isLoading) {
    return (
      <div className={cn("flex items-center gap-2", className)}>
        <div className="h-9 w-48 bg-gray-200 rounded-md animate-pulse" />
        <div className="h-9 w-9 bg-gray-200 rounded-md animate-pulse" />
      </div>
    );
  }

  return (
    <div className={cn("flex items-center gap-2", className)}>
      <Select value={selectedModelId} onValueChange={onModelChange}>
        <SelectTrigger className="w-64 h-9 bg-white border-gray-200 hover:bg-gray-50 transition-colors">
          <div className="flex items-center gap-2 min-w-0">
            {selectedModel && (
              <>
                <Badge variant="secondary" className="text-xs px-1.5 py-0.5 shrink-0">
                  {selectedModel.provider.displayName}
                </Badge>
                <span className="truncate text-sm font-medium">
                  {selectedModel.modelName}
                </span>
              </>
            )}
            {!selectedModel && <SelectValue placeholder="Select model" />}
          </div>
          <ChevronDown className="h-4 w-4 opacity-50 shrink-0" />
        </SelectTrigger>
        <SelectContent className="w-80">
          {Object.entries(groupedModels).map(([providerName, providerModels], index) => (
            <div key={providerName}>
              {index > 0 && <Separator className="my-2" />}
              <div className="px-2 py-1.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                {providerName}
              </div>
              {providerModels.map((model) => (
                <SelectItem key={model.id} value={model.id} className="py-3">
                  <div className="flex flex-col gap-1 w-full">
                    <div className="flex items-center justify-between">
                      <span className="font-medium">{model.modelName}</span>
                      <div className="flex items-center gap-1 text-xs text-gray-500">
                        <Zap className="h-3 w-3" />
                        {model.contextLength.toLocaleString()}
                      </div>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-gray-500">
                      <div className="flex items-center gap-1">
                        <DollarSign className="h-3 w-3" />
                        <span>In: {formatPrice(model.inputPricePer1kTokens)}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <DollarSign className="h-3 w-3" />
                        <span>Out: {formatPrice(model.outputPricePer1kTokens)}</span>
                      </div>
                    </div>
                  </div>
                </SelectItem>
              ))}
            </div>
          ))}
        </SelectContent>
      </Select>

      {selectedModel && (
        <div className="hidden sm:flex items-center gap-2 text-xs text-gray-500 bg-gray-50 px-2 py-1.5 rounded-md">
          <div className="flex items-center gap-1">
            <DollarSign className="h-3 w-3" />
            <span>{formatPrice(selectedModel.inputPricePer1kTokens)}</span>
          </div>
          <span>/</span>
          <div className="flex items-center gap-1">
            <DollarSign className="h-3 w-3" />
            <span>{formatPrice(selectedModel.outputPricePer1kTokens)}</span>
          </div>
        </div>
      )}

      <Link href="/settings">
        <Button variant="ghost" size="sm" className="h-9 w-9 p-0">
          <Settings className="h-4 w-4" />
        </Button>
      </Link>
    </div>
  );
}