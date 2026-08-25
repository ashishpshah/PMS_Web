import { SkeletonText } from './SkeletonText';

export const SkeletonCard = ({ className = '' }: { className?: string }) => (
  <div className={`space-y-4 ${className}`}>
    <div className="flex items-center space-x-3">
      <SkeletonText width={40} height={40} className="rounded-full" />
      <div className="space-y-2">
        <SkeletonText width="3/4" height={10} />
        <SkeletonText width="1/2" height={8} />
      </div>
    </div>
    <SkeletonText width="full" height={16} className="mt-2" />
    <SkeletonText width="2/3" height={12} className="mt-1" />
  </div>
);

export const SkeletonTaskItem = () => (
  <div className="space-y-3">
    <div className="flex items-center space-x-3 p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
      <SkeletonText width={8} height={8} className="rounded-full" />
      <div className="flex-1 space-y-1">
        <SkeletonText width="2/3" height={5} />
        <SkeletonText width="1/2" height={4} className="mt-1" />
      </div>
      <SkeletonText width={20} height={20} className="rounded-full" />
    </div>
    
    <div className="flex items-center space-x-4 p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
      <div className="space-y-2">
        <SkeletonText width="1/2" height={4} />
        <SkeletonText width="3/4" height={4} className="mt-1" />
      </div>
      <div className="space-y-2 text-center">
        <SkeletonText width={12} height={4} />
        <SkeletonText width="8" height={3} className="mt-1" />
      </div>
      <div className="space-y-2 text-center">
        <SkeletonText width={12} height={4} />
        <SkeletonText width="8" height={3} className="mt-1" />
      </div>
    </div>
  </div>
);