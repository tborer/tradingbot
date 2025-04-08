import React, { useState } from 'react';
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { InfoCircledIcon } from "@radix-ui/react-icons";
import { useToast } from "@/components/ui/use-toast";

interface CoinDeskSettingsProps {
  apiKey?: string;
  onApiKeyChange: (apiKey: string) => void;
}

const CoinDeskSettings: React.FC<CoinDeskSettingsProps> = ({
  apiKey = '',
  onApiKeyChange
}) => {
  const [inputApiKey, setInputApiKey] = useState(apiKey);
  const { toast } = useToast();

  const handleSave = () => {
    onApiKeyChange(inputApiKey);
    toast({
      title: "API Key Saved",
      description: "Your CoinDesk API key has been saved successfully.",
    });
  };

  return (
    <div className="border-t pt-4 mt-4">
      <h3 className="text-lg font-medium mb-2">CoinDesk API Settings</h3>
      <div className="space-y-4">
        <div>
          <div className="space-y-2">
            <Label htmlFor="coinDeskApiKey">CoinDesk API Key</Label>
            <p className="text-sm text-muted-foreground">
              Used as a fallback for historical cryptocurrency data when primary source fails
            </p>
            <div className="flex gap-2">
              <Input
                id="coinDeskApiKey"
                type="password"
                value={inputApiKey}
                onChange={(e) => setInputApiKey(e.target.value)}
                placeholder="Enter your CoinDesk API key"
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
              The CoinDesk API provides historical cryptocurrency data and is used as a fallback
              when the primary data source doesn't have data for a specific cryptocurrency.
              The API key should be included as a query parameter in the URL.
              Example API URL: https://data-api.coindesk.com/index/cc/v1/historical/days?market=cadli&instrument=BTC-USD&api_key=your_api_key
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CoinDeskSettings;