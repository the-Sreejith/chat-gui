'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { 
  ArrowLeft, 
  Key, 
  Palette, 
  BarChart3, 
  Bell,
  DollarSign,
  Zap,
  Save,
  Eye,
  EyeOff
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { ModelWithProvider } from '@/lib/models';
import Link from 'next/link';

interface UserSettings {
  preferredModelId?: string;
  theme: string;
  openrouterApiKey?: string;
  geminiApiKey?: string;
  monthlyTokenLimit?: number;
  dailyTokenLimit?: number;
  billingAlertThreshold?: number;
  billingAlertsEnabled: boolean;
}

interface UsageStats {
  totalTokensThisMonth: number;
  totalCostThisMonth: number;
  totalTokensToday: number;
  totalCostToday: number;
  monthlyLimit?: number;
  dailyLimit?: number;
}

export default function SettingsPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const { toast } = useToast();
  
  const [settings, setSettings] = useState<UserSettings>({
    theme: 'light',
    billingAlertsEnabled: true,
  });
  const [models, setModels] = useState<ModelWithProvider[]>([]);
  const [usageStats, setUsageStats] = useState<UsageStats>({
    totalTokensThisMonth: 0,
    totalCostThisMonth: 0,
    totalTokensToday: 0,
    totalCostToday: 0,
  });
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [showApiKeys, setShowApiKeys] = useState({
    openrouter: false,
    gemini: false,
  });

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/auth/signin');
    }
  }, [status, router]);

  useEffect(() => {
    if (session) {
      fetchSettings();
      fetchModels();
      fetchUsageStats();
    }
  }, [session]);

  const fetchSettings = async () => {
    try {
      const response = await fetch('/api/user/settings');
      if (response.ok) {
        const data = await response.json();
        setSettings(data);
      }
    } catch (error) {
      console.error('Failed to fetch settings:', error);
    }
  };

  const fetchModels = async () => {
    try {
      const response = await fetch('/api/models');
      if (response.ok) {
        const data = await response.json();
        setModels(data);
      }
    } catch (error) {
      console.error('Failed to fetch models:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchUsageStats = async () => {
    try {
      const response = await fetch('/api/user/usage');
      if (response.ok) {
        const data = await response.json();
        setUsageStats(data);
      }
    } catch (error) {
      console.error('Failed to fetch usage stats:', error);
    }
  };

  const handleSaveSettings = async () => {
    setIsSaving(true);
    try {
      const response = await fetch('/api/user/settings', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(settings),
      });

      if (response.ok) {
        toast({
          title: 'Success',
          description: 'Settings saved successfully!',
        });
      } else {
        throw new Error('Failed to save settings');
      }
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to save settings',
        variant: 'destructive',
      });
    } finally {
      setIsSaving(false);
    }
  };

  const getUsagePercentage = (used: number, limit?: number) => {
    if (!limit) return 0;
    return Math.min((used / limit) * 100, 100);
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 4,
    }).format(amount);
  };

  if (status === 'loading' || isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-lg">Loading...</div>
      </div>
    );
  }

  if (!session) {
    return null;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 via-white to-pink-50">
      <div className="container mx-auto px-4 py-8 max-w-4xl">
        {/* Header */}
        <div className="flex items-center gap-4 mb-8">
          <Link href="/chat">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Chat
            </Button>
          </Link>
          <div>
            <h1 className="text-3xl font-bold bg-gradient-to-r from-purple-600 to-pink-600 bg-clip-text text-transparent">
              Settings
            </h1>
            <p className="text-gray-600">Manage your preferences and API configuration</p>
          </div>
        </div>

        <Tabs defaultValue="preferences" className="space-y-6">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="preferences" className="flex items-center gap-2">
              <Palette className="h-4 w-4" />
              Preferences
            </TabsTrigger>
            <TabsTrigger value="api" className="flex items-center gap-2">
              <Key className="h-4 w-4" />
              API Keys
            </TabsTrigger>
            <TabsTrigger value="usage" className="flex items-center gap-2">
              <BarChart3 className="h-4 w-4" />
              Usage
            </TabsTrigger>
            <TabsTrigger value="billing" className="flex items-center gap-2">
              <Bell className="h-4 w-4" />
              Alerts
            </TabsTrigger>
          </TabsList>

          {/* Preferences Tab */}
          <TabsContent value="preferences">
            <Card>
              <CardHeader>
                <CardTitle>User Preferences</CardTitle>
                <CardDescription>
                  Customize your chat experience and default settings
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-2">
                  <Label htmlFor="defaultModel">Default AI Model</Label>
                  <Select
                    value={settings.preferredModelId || ''}
                    onValueChange={(value) => setSettings(prev => ({ ...prev, preferredModelId: value }))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select default model" />
                    </SelectTrigger>
                    <SelectContent>
                      {models.map((model) => (
                        <SelectItem key={model.id} value={model.id}>
                          <div className="flex items-center gap-2">
                            <Badge variant="secondary" className="text-xs">
                              {model.provider.displayName}
                            </Badge>
                            {model.modelName}
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="theme">Interface Theme</Label>
                  <Select
                    value={settings.theme}
                    onValueChange={(value) => setSettings(prev => ({ ...prev, theme: value }))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="light">Light</SelectItem>
                      <SelectItem value="dark">Dark</SelectItem>
                      <SelectItem value="system">System</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <Button onClick={handleSaveSettings} disabled={isSaving} className="w-full">
                  {isSaving ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                      Saving...
                    </>
                  ) : (
                    <>
                      <Save className="h-4 w-4 mr-2" />
                      Save Preferences
                    </>
                  )}
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          {/* API Keys Tab */}
          <TabsContent value="api">
            <Card>
              <CardHeader>
                <CardTitle>API Configuration</CardTitle>
                <CardDescription>
                  Configure your API keys for different AI providers
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="openrouterKey">OpenRouter API Key</Label>
                    <div className="relative">
                      <Input
                        id="openrouterKey"
                        type={showApiKeys.openrouter ? 'text' : 'password'}
                        value={settings.openrouterApiKey || ''}
                        onChange={(e) => setSettings(prev => ({ ...prev, openrouterApiKey: e.target.value }))}
                        placeholder="sk-or-..."
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="absolute right-2 top-1/2 -translate-y-1/2 h-6 w-6 p-0"
                        onClick={() => setShowApiKeys(prev => ({ ...prev, openrouter: !prev.openrouter }))}
                      >
                        {showApiKeys.openrouter ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                      </Button>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="geminiKey">Google Gemini API Key</Label>
                    <div className="relative">
                      <Input
                        id="geminiKey"
                        type={showApiKeys.gemini ? 'text' : 'password'}
                        value={settings.geminiApiKey || ''}
                        onChange={(e) => setSettings(prev => ({ ...prev, geminiApiKey: e.target.value }))}
                        placeholder="AIza..."
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="absolute right-2 top-1/2 -translate-y-1/2 h-6 w-6 p-0"
                        onClick={() => setShowApiKeys(prev => ({ ...prev, gemini: !prev.gemini }))}
                      >
                        {showApiKeys.gemini ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                      </Button>
                    </div>
                  </div>
                </div>

                <Separator />

                <div className="space-y-4">
                  <h3 className="text-lg font-semibold">Usage Limits</h3>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="dailyLimit">Daily Token Limit</Label>
                      <Input
                        id="dailyLimit"
                        type="number"
                        value={settings.dailyTokenLimit || ''}
                        onChange={(e) => setSettings(prev => ({ ...prev, dailyTokenLimit: parseInt(e.target.value) || undefined }))}
                        placeholder="10000"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="monthlyLimit">Monthly Token Limit</Label>
                      <Input
                        id="monthlyLimit"
                        type="number"
                        value={settings.monthlyTokenLimit || ''}
                        onChange={(e) => setSettings(prev => ({ ...prev, monthlyTokenLimit: parseInt(e.target.value) || undefined }))}
                        placeholder="100000"
                      />
                    </div>
                  </div>
                </div>

                <Button onClick={handleSaveSettings} disabled={isSaving} className="w-full">
                  {isSaving ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                      Saving...
                    </>
                  ) : (
                    <>
                      <Save className="h-4 w-4 mr-2" />
                      Save API Configuration
                    </>
                  )}
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Usage Tab */}
          <TabsContent value="usage">
            <div className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>Usage Statistics</CardTitle>
                  <CardDescription>
                    Monitor your API usage and costs
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-4">
                      <h3 className="text-lg font-semibold flex items-center gap-2">
                        <Zap className="h-5 w-5" />
                        Today's Usage
                      </h3>
                      
                      <div className="space-y-3">
                        <div className="flex justify-between items-center">
                          <span className="text-sm text-gray-600">Tokens Used</span>
                          <span className="font-medium">{usageStats.totalTokensToday.toLocaleString()}</span>
                        </div>
                        {settings.dailyTokenLimit && (
                          <Progress 
                            value={getUsagePercentage(usageStats.totalTokensToday, settings.dailyTokenLimit)} 
                            className="h-2"
                          />
                        )}
                        
                        <div className="flex justify-between items-center">
                          <span className="text-sm text-gray-600">Cost</span>
                          <span className="font-medium">{formatCurrency(usageStats.totalCostToday)}</span>
                        </div>
                      </div>
                    </div>

                    <div className="space-y-4">
                      <h3 className="text-lg font-semibold flex items-center gap-2">
                        <DollarSign className="h-5 w-5" />
                        This Month
                      </h3>
                      
                      <div className="space-y-3">
                        <div className="flex justify-between items-center">
                          <span className="text-sm text-gray-600">Tokens Used</span>
                          <span className="font-medium">{usageStats.totalTokensThisMonth.toLocaleString()}</span>
                        </div>
                        {settings.monthlyTokenLimit && (
                          <Progress 
                            value={getUsagePercentage(usageStats.totalTokensThisMonth, settings.monthlyTokenLimit)} 
                            className="h-2"
                          />
                        )}
                        
                        <div className="flex justify-between items-center">
                          <span className="text-sm text-gray-600">Cost</span>
                          <span className="font-medium">{formatCurrency(usageStats.totalCostThisMonth)}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* Billing Alerts Tab */}
          <TabsContent value="billing">
            <Card>
              <CardHeader>
                <CardTitle>Billing Alerts</CardTitle>
                <CardDescription>
                  Configure alerts for usage and spending limits
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <Label htmlFor="billingAlerts">Enable Billing Alerts</Label>
                    <p className="text-sm text-gray-600">
                      Receive notifications when you approach spending limits
                    </p>
                  </div>
                  <Switch
                    id="billingAlerts"
                    checked={settings.billingAlertsEnabled}
                    onCheckedChange={(checked) => setSettings(prev => ({ ...prev, billingAlertsEnabled: checked }))}
                  />
                </div>

                {settings.billingAlertsEnabled && (
                  <div className="space-y-2">
                    <Label htmlFor="alertThreshold">Alert Threshold (USD)</Label>
                    <Input
                      id="alertThreshold"
                      type="number"
                      step="0.01"
                      value={settings.billingAlertThreshold || ''}
                      onChange={(e) => setSettings(prev => ({ ...prev, billingAlertThreshold: parseFloat(e.target.value) || undefined }))}
                      placeholder="10.00"
                    />
                    <p className="text-sm text-gray-600">
                      You'll receive an alert when your monthly spending reaches this amount
                    </p>
                  </div>
                )}

                <Button onClick={handleSaveSettings} disabled={isSaving} className="w-full">
                  {isSaving ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                      Saving...
                    </>
                  ) : (
                    <>
                      <Save className="h-4 w-4 mr-2" />
                      Save Alert Settings
                    </>
                  )}
                </Button>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}