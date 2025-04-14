import React, { useState } from 'react';
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { InfoCircledIcon } from "@radix-ui/react-icons";
import { useToast } from "@/components/ui/use-toast";
import AnthropicSettings from './AnthropicSettings';

interface OpenAISettingsProps {
  openAIApiKey?: string;
  anthropicApiKey?: string;
  apiPreference?: string;
  onOpenAIApiKeyChange: (apiKey: string) => void;
  onAnthropicApiKeyChange: (apiKey: string) => void;
  onApiPreferenceChange: (preference: string) => void;
}

const OpenAISettings: React.FC<OpenAISettingsProps> = ({
  openAIApiKey = '',
  anthropicApiKey = '',
  apiPreference = 'openai',
  onOpenAIApiKeyChange,
  onAnthropicApiKeyChange,
  onApiPreferenceChange
}) => {
  const [inputApiKey, setInputApiKey] = useState(openAIApiKey);
  const { toast } = useToast();

  const handleSave = () => {
    onOpenAIApiKeyChange(inputApiKey);
    toast({
      title: "API Key Saved",
      description: "Your OpenAI API key has been saved successfully.",
    });
  };

  return (
    <>
      <div className="border-t pt-4 mt-4">
        <h3 className="text-lg font-medium mb-2">OpenAI API Settings</h3>
        <div className="space-y-4">
          <div>
            <div className="space-y-2">
              <Label htmlFor="openAIApiKey">OpenAI API Key</Label>
              <p className="text-sm text-muted-foreground">
                Required for generating trading plans in the Research section
              </p>
              <div className="flex gap-2">
                <Input
                  id="openAIApiKey"
                  type="password"
                  value={inputApiKey}
                  onChange={(e) => setInputApiKey(e.target.value)}
                  placeholder="Enter your OpenAI API key"
                />
                <Button onClick={handleSave}>Save</Button>
              </div>
            </div>
          </div>
          
          <Separator />
          
          <div className="bg-muted p-3 rounded-md flex items-start gap-2 text-sm">
            <InfoCircledIcon className="h-5 w-5 text-muted-foreground mt-0.5" />
            <div>
              <p className="text-muted-foreground">
                You can obtain an OpenAI API key by signing up at{" "}
                <a 
                  href="https://platform.openai.com/api-keys" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="text-blue-500 hover:underline"
                >
                  platform.openai.com
                </a>
                . The API key is used to generate trading plans based on your selected assets.
              </p>
            </div>
          </div>
        </div>
      </div>
      
      <AnthropicSettings 
        apiKey={anthropicApiKey}
        apiPreference={apiPreference}
        onApiKeyChange={onAnthropicApiKeyChange}
        onApiPreferenceChange={onApiPreferenceChange}
      />
    </>
  );
};

export default OpenAISettings;