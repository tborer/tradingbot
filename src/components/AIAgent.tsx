import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

const AIAgent: React.FC = () => {
  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle>AI Agent</CardTitle>
        <CardDescription>
          AI-powered assistant for cryptocurrency analysis and trading
        </CardDescription>
      </CardHeader>
      <CardContent>
        {/* Content will be added in future implementation */}
        <div className="text-center py-8 text-muted-foreground">
          AI Agent functionality coming soon
        </div>
      </CardContent>
    </Card>
  );
};

export default AIAgent;