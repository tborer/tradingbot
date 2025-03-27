import React, { useState } from 'react';
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { InfoCircledIcon } from "@radix-ui/react-icons";
import { useToast } from "@/components/ui/use-toast";

interface AlphaVantageSettingsProps {
  apiKey?: string;
  onApiKeyChange: (apiKey: string) => void;
}

const AlphaVantageSettings: React.FC<AlphaVantageSettingsProps> = ({
  apiKey = '',
  onApiKeyChange
}) => {
  const [inputApiKey, setInputApiKey] = useState(apiKey);
  const { toast } = useToast();

  const handleSave = () => {
    onApiKeyChange(inputApiKey);
    toast({
      title: "API Key Saved",
      description: "Your AlphaVantage API key has been saved successfully.",
    });
  };

  return (
    <div className="border-t pt-4 mt-4">
      <h3 className="text-lg font-medium mb-2">AlphaVantage API Settings</h3>
      <div className="space-y-4">
        <div>
          <div className="space-y-2">
            <Label htmlFor="alphaVantageApiKey">AlphaVantage API Key</Label>
            <p className="text-sm text-muted-foreground">
              Required for historical data on cryptocurrencies and stocks
            </p>
            <div className="flex gap-2">
              <Input
                id="alphaVantageApiKey"
                type="password"
                value={inputApiKey}
                onChange={(e) => setInputApiKey(e.target.value)}
                placeholder="Enter your AlphaVantage API key"
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
              You can obtain an AlphaVantage API key by signing up at{" "}
              <a 
                href="https://www.alphavantage.co/support/#api-key" 
                target="_blank" 
                rel="noopener noreferrer"
                className="text-blue-500 hover:underline"
              >
                alphavantage.co
              </a>
              . The free tier allows up to 25 API requests per day.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AlphaVantageSettings;