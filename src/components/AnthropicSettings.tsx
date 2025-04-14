import React, { useState } from 'react';
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { InfoCircledIcon } from "@radix-ui/react-icons";
import { useToast } from "@/components/ui/use-toast";
import { Switch } from "@/components/ui/switch";

interface AnthropicSettingsProps {
  apiKey?: string;
  apiPreference: string;
  onApiKeyChange: (apiKey: string) => void;
  onApiPreferenceChange: (preference: string) => void;
}

const AnthropicSettings: React.FC<AnthropicSettingsProps> = ({
  apiKey = '',
  apiPreference = 'openai',
  onApiKeyChange,
  onApiPreferenceChange
}) => {
  const [inputApiKey, setInputApiKey] = useState(apiKey);
  const { toast } = useToast();

  const handleSave = () => {
    onApiKeyChange(inputApiKey);
    toast({
      title: "API Key Saved",
      description: "Your Anthropic API key has been saved successfully.",
    });
  };

  const handleToggleChange = (checked: boolean) => {
    const newPreference = checked ? 'anthropic' : 'openai';
    onApiPreferenceChange(newPreference);
    toast({
      title: "API Preference Updated",
      description: `Research plans will now use ${checked ? 'Anthropic' : 'OpenAI'} API.`,
    });
  };

  return (
    <div className="border-t pt-4 mt-4">
      <h3 className="text-lg font-medium mb-2">Anthropic API Settings</h3>
      <div className="space-y-4">
        <div>
          <div className="space-y-2">
            <Label htmlFor="anthropicApiKey">Anthropic API Key</Label>
            <p className="text-sm text-muted-foreground">
              Required for generating trading plans using Anthropic Claude
            </p>
            <div className="flex gap-2">
              <Input
                id="anthropicApiKey"
                type="password"
                value={inputApiKey}
                onChange={(e) => setInputApiKey(e.target.value)}
                placeholder="Enter your Anthropic API key"
              />
              <Button onClick={handleSave}>Save</Button>
            </div>
          </div>
        </div>
        
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="apiPreference" className="text-base">Which API to use for research plans</Label>
            <div className="flex items-center space-x-2">
              <span className={apiPreference === 'openai' ? 'font-medium' : 'text-muted-foreground'}>OpenAI</span>
              <Switch 
                id="apiPreference"
                checked={apiPreference === 'anthropic'}
                onCheckedChange={handleToggleChange}
              />
              <span className={apiPreference === 'anthropic' ? 'font-medium' : 'text-muted-foreground'}>Anthropic</span>
            </div>
          </div>
          <p className="text-sm text-muted-foreground">
            Select which AI service to use when generating trading plans
          </p>
        </div>
        
        <Separator />
        
        <div className="bg-muted p-3 rounded-md flex items-start gap-2 text-sm">
          <InfoCircledIcon className="h-5 w-5 text-muted-foreground mt-0.5" />
          <div>
            <p className="text-muted-foreground">
              You can obtain an Anthropic API key by signing up at{" "}
              <a 
                href="https://console.anthropic.com/" 
                target="_blank" 
                rel="noopener noreferrer"
                className="text-blue-500 hover:underline"
              >
                console.anthropic.com
              </a>
              . The API key is used to generate trading plans based on your selected assets.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AnthropicSettings;