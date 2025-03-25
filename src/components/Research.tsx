import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

const Research: React.FC = () => {
  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle>Research</CardTitle>
        <CardDescription>
          This section will contain research tools and information
        </CardDescription>
      </CardHeader>
      <CardContent>
        {/* Empty content as requested */}
        <div className="flex items-center justify-center h-[400px] text-muted-foreground">
          Research functionality coming soon
        </div>
      </CardContent>
    </Card>
  );
};

export default Research;