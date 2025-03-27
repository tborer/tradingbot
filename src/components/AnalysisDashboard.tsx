import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import AnalysisCard from './AnalysisCard';
import { useToast } from '@/components/ui/use-toast';

interface AnalysisItem {
  id: string;
  symbol: string;
  currentPrice?: number;
  purchasePrice: number;
  type: 'stock' | 'crypto';
  historicalData: any;
}

interface AnalysisDashboardProps {
  items: AnalysisItem[];
}

const AnalysisDashboard: React.FC<AnalysisDashboardProps> = ({ items }) => {
  const [stocks, setStocks] = useState<AnalysisItem[]>([]);
  const [cryptos, setCryptos] = useState<AnalysisItem[]>([]);
  const { toast } = useToast();

  useEffect(() => {
    // Separate items into stocks and cryptos
    const stockItems = items.filter(item => item.type === 'stock');
    const cryptoItems = items.filter(item => item.type === 'crypto');
    
    setStocks(stockItems);
    setCryptos(cryptoItems);
  }, [items]);

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle>Analysis Dashboard</CardTitle>
        <CardDescription>
          Insights and analysis for your portfolio items
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="all" className="w-full">
          <TabsList className="mb-4">
            <TabsTrigger value="all">All</TabsTrigger>
            <TabsTrigger value="stocks">Stocks</TabsTrigger>
            <TabsTrigger value="cryptos">Cryptocurrencies</TabsTrigger>
          </TabsList>
          
          <TabsContent value="all">
            {items.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {items.map(item => (
                  <AnalysisCard
                    key={item.id}
                    symbol={item.symbol}
                    currentPrice={item.currentPrice}
                    purchasePrice={item.purchasePrice}
                    historicalData={item.historicalData}
                    type={item.type}
                  />
                ))}
              </div>
            ) : (
              <p className="text-center text-muted-foreground py-8">
                No items to analyze. Add stocks or cryptocurrencies from the Research tab.
              </p>
            )}
          </TabsContent>
          
          <TabsContent value="stocks">
            {stocks.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {stocks.map(item => (
                  <AnalysisCard
                    key={item.id}
                    symbol={item.symbol}
                    currentPrice={item.currentPrice}
                    purchasePrice={item.purchasePrice}
                    historicalData={item.historicalData}
                    type={item.type}
                  />
                ))}
              </div>
            ) : (
              <p className="text-center text-muted-foreground py-8">
                No stocks to analyze. Add stocks from the Research tab.
              </p>
            )}
          </TabsContent>
          
          <TabsContent value="cryptos">
            {cryptos.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {cryptos.map(item => (
                  <AnalysisCard
                    key={item.id}
                    symbol={item.symbol}
                    currentPrice={item.currentPrice}
                    purchasePrice={item.purchasePrice}
                    historicalData={item.historicalData}
                    type={item.type}
                  />
                ))}
              </div>
            ) : (
              <p className="text-center text-muted-foreground py-8">
                No cryptocurrencies to analyze. Add cryptocurrencies from the Research tab.
              </p>
            )}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
};

export default AnalysisDashboard;