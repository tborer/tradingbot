import React from 'react';

interface SupportResistanceLevel {
  price: number;
  strength: number;
  touches: number;
  isOptimal: boolean;
  scores?: {
    cleanTouches: number;
    touchPrecision: number;
    approachSpeed: number;
    candleBehavior: number;
    nearbyPriceHistory: number;
    potentialRR: number;
    marketContext: number;
    totalScore: number;
    probability: 'HIGH' | 'MEDIUM' | 'LOW';
  };
}

interface SupportResistanceLevelCardProps {
  level: SupportResistanceLevel;
}

const SupportResistanceLevelCard: React.FC<SupportResistanceLevelCardProps> = ({ level }) => {
  return (
    <div className="border rounded-md p-3">
      <div className="flex justify-between items-center">
        <span className="font-medium">${level.price.toFixed(2)}</span>
        <span className={`px-2 py-1 rounded text-xs ${level.isOptimal ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200' : 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200'}`}>
          {level.isOptimal ? 'Optimal' : 'Standard'}
        </span>
      </div>
      <div className="grid grid-cols-2 gap-2 mt-2 text-sm">
        <div>
          <span className="text-muted-foreground">Strength:</span>
          <span className="ml-1">{level.strength.toFixed(1)}</span>
        </div>
        <div>
          <span className="text-muted-foreground">Touches:</span>
          <span className="ml-1">{level.touches}</span>
        </div>
      </div>
      
      {level.scores && (
        <div className="mt-3 border-t pt-3">
          <div className="flex justify-between items-center mb-2">
            <span className="font-medium text-sm">Scoring Analysis</span>
            <span className={`px-2 py-1 rounded text-xs 
              ${level.scores.probability === 'HIGH' ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200' : 
                level.scores.probability === 'MEDIUM' ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200' : 
                'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'}`}>
              {level.scores.probability} Probability
            </span>
          </div>
          
          <div className="text-xs grid grid-cols-2 gap-x-4 gap-y-1">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Clean Touches:</span>
              <span>{level.scores.cleanTouches}/2</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Touch Precision:</span>
              <span>{level.scores.touchPrecision.toFixed(1)}/1</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Approach Speed:</span>
              <span>{level.scores.approachSpeed.toFixed(1)}/2</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Candle Behavior:</span>
              <span>{level.scores.candleBehavior.toFixed(1)}/2</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Nearby Price History:</span>
              <span>{level.scores.nearbyPriceHistory.toFixed(1)}/1</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Potential RR:</span>
              <span>{level.scores.potentialRR.toFixed(1)}/2</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Market Context:</span>
              <span>{level.scores.marketContext.toFixed(1)}/1</span>
            </div>
            <div className="flex justify-between font-medium col-span-2 border-t mt-1 pt-1">
              <span>Total Score:</span>
              <span>{level.scores.totalScore.toFixed(1)}/10</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SupportResistanceLevelCard;