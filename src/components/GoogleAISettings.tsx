import React, { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { toast } from '@/components/ui/use-toast';

const GoogleAISettings: React.FC = () => {
  const { user } = useAuth();
  const [googleApiKey, setGoogleApiKey] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const fetchSettings = async () => {
      if (!user) return;
      
      try {
        const response = await fetch('/api/settings');
        const data = await response.json();
        
        if (data.googleApiKey) {
          setGoogleApiKey('••••••••••••••••••••••••••••••');
        }
      } catch (error) {
        console.error('Error fetching settings:', error);
      }
    };

    fetchSettings();
  }, [user]);

  const saveGoogleApiKey = async () => {
    if (!user) return;
    
    setLoading(true);
    try {
      const response = await fetch('/api/settings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          googleApiKey,
        }),
      });

      if (response.ok) {
        toast({
          title: 'Success',
          description: 'Google API key saved successfully',
        });
        setGoogleApiKey('••••••••••••••••••••••••••••••');
      } else {
        toast({
          title: 'Error',
          description: 'Failed to save Google API key',
          variant: 'destructive',
        });
      }
    } catch (error) {
      console.error('Error saving Google API key:', error);
      toast({
        title: 'Error',
        description: 'An unexpected error occurred',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle>Google AI Settings</CardTitle>
        <CardDescription>
          Configure your Google Gemini API key for AI agent functionality
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="googleApiKey">Google Gemini API Key</Label>
            <Input
              id="googleApiKey"
              type="password"
              placeholder="Enter your Google Gemini API key"
              value={googleApiKey}
              onChange={(e) => setGoogleApiKey(e.target.value)}
            />
            <p className="text-sm text-muted-foreground">
              Get your API key from the{' '}
              <a 
                href="https://ai.google.dev/" 
                target="_blank" 
                rel="noopener noreferrer"
                className="text-primary hover:underline"
              >
                Google AI Studio
              </a>
            </p>
          </div>
          <Button onClick={saveGoogleApiKey} disabled={loading || !googleApiKey}>
            {loading ? 'Saving...' : 'Save Google API Key'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};

export default GoogleAISettings;