import React, { createContext, useContext, useState, useCallback, useEffect, ReactNode } from 'react';

interface AnalysisItem {
  id: string;
  symbol: string;
  currentPrice?: number;
  purchasePrice: number;
  type: 'stock' | 'crypto';
  historicalData: any;
}

interface AnalysisContextType {
  items: AnalysisItem[];
  addItem: (item: Omit<AnalysisItem, 'id'>) => void;
  removeItem: (id: string) => void;
  updateItem: (id: string, updates: Partial<AnalysisItem>) => void;
  getItem: (symbol: string) => AnalysisItem | undefined;
}

const AnalysisContext = createContext<AnalysisContextType | undefined>(undefined);

export const useAnalysis = () => {
  const context = useContext(AnalysisContext);
  if (!context) {
    throw new Error('useAnalysis must be used within an AnalysisProvider');
  }
  return context;
};

interface AnalysisProviderProps {
  children: ReactNode;
}

export const AnalysisProvider: React.FC<AnalysisProviderProps> = ({ children }) => {
  const [items, setItems] = useState<AnalysisItem[]>([]);
  
  // Load saved items from localStorage on initial render
  useEffect(() => {
    const loadSavedItems = () => {
      try {
        const savedItems = localStorage.getItem('analysisItems');
        if (savedItems) {
          setItems(JSON.parse(savedItems));
        }
      } catch (error) {
        console.error('Failed to load saved analysis items:', error);
      }
    };
    
    loadSavedItems();
  }, []);

  // Save items to localStorage whenever they change
  useEffect(() => {
    try {
      localStorage.setItem('analysisItems', JSON.stringify(items));
    } catch (error) {
      console.error('Failed to save analysis items:', error);
    }
  }, [items]);

  const addItem = useCallback((newItem: Omit<AnalysisItem, 'id'>) => {
    // Check if item with this symbol already exists
    const existingItem = items.find(item => 
      item.symbol.toLowerCase() === newItem.symbol.toLowerCase() && 
      item.type === newItem.type
    );

    if (existingItem) {
      // Update existing item
      setItems(prevItems => 
        prevItems.map(item => 
          item.id === existingItem.id 
            ? { ...item, ...newItem, id: existingItem.id } 
            : item
        )
      );
    } else {
      // Add new item with generated ID
      const id = crypto.randomUUID();
      setItems(prevItems => [...prevItems, { ...newItem, id }]);
    }
  }, [items]);

  const removeItem = useCallback((id: string) => {
    setItems(prevItems => prevItems.filter(item => item.id !== id));
  }, []);

  const updateItem = useCallback((id: string, updates: Partial<AnalysisItem>) => {
    setItems(prevItems => 
      prevItems.map(item => 
        item.id === id ? { ...item, ...updates } : item
      )
    );
  }, []);

  const getItem = useCallback((symbol: string) => {
    return items.find(item => item.symbol.toLowerCase() === symbol.toLowerCase());
  }, [items]);

  return (
    <AnalysisContext.Provider value={{ 
      items, 
      addItem, 
      removeItem, 
      updateItem,
      getItem
    }}>
      {children}
    </AnalysisContext.Provider>
  );
};