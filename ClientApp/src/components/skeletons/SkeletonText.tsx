import { useEffect, useState } from 'react';

export const SkeletonText = ({
  width = 'full',
  height = '16',
  className = ''
}: {
  width?: string | number;
  height?: string | number;
  className?: string;
}) => {
  const [visible, setVisible] = useState(true);
  
  useEffect(() => {
    const interval = setInterval(() => {
      setVisible(prev => !prev);
    }, 1500);
    
    return () => clearInterval(interval);
  }, []);
  
  const widthClass = typeof width === 'number' 
    ? `w-${width}` 
    : width === 'full' 
      ? 'w-full' 
      : `w-${width}`;
      
  const heightClass = typeof height === 'number' 
    ? `h-${height}` 
    : `h-${height}`;
  
  return (
    <div className={`${className} ${widthClass} ${heightClass} rounded bg-gray-200 dark:bg-gray-700 ${visible ? 'animate-pulse' : ''}`} />
  );
};