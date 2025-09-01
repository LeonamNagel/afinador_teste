import React from 'react';

interface AverageFrequencyDisplayProps {
  averageFrequency: number;
}

const AverageFrequencyDisplay: React.FC<AverageFrequencyDisplayProps> = ({ averageFrequency }) => {
  return (
    <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-gray-800/70 backdrop-blur-sm px-4 py-2 rounded-lg shadow-lg border border-gray-700 z-30">
      <span className="text-sm text-gray-400">Média (3s): </span>
      <span className="text-lg font-semibold text-gray-100 w-24 inline-block text-center">
        {averageFrequency > 0 ? averageFrequency.toFixed(1) + ' Hz' : '-- Hz'}
      </span>
    </div>
  );
};

export default AverageFrequencyDisplay;