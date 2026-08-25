import { SkeletonCard } from './SkeletonCard';
import { SkeletonText } from './SkeletonText';
import { SkeletonTaskItem } from './SkeletonTaskItem';

export const DashboardSkeleton = () => (
  <div className="space-y-6">
    {/* Stats Cards */}
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      <SkeletonCard className="aspect-[3/2]" />
      <SkeletonCard className="aspect-[3/2]" />
      <SkeletonCard className="aspect-[3/2]" />
      <SkeletonCard className="aspect-[3/2]" />
    </div>
    
    {/* Charts Section */}
    <div className="space-y-4">
      <div className="flex items-center space-x-3">
        <SkeletonText width={24} height={24} className="rounded-full" />
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
          <SkeletonText width="1/2" height={5} className="mr-2" />
          <SkeletonText width="1/3" height={4} />
        </h3>
      </div>
      <SkeletonCard className="aspect-[16/9]" />
    </div>
    
    {/* Recent Tasks */}
    <div className="space-y-4">
      <div className="flex items-center space-x-3">
        <SkeletonText width={24} height={24} className="rounded-full" />
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
          <SkeletonText width="1/3" height={5} className="mr-2" />
          <SkeletonText width="1/4" height={4} />
        </h3>
      </div>
      <div className="space-y-3">
        <SkeletonTaskItem />
        <SkeletonTaskItem />
        <SkeletonTaskItem />
        <SkeletonTaskItem />
        <SkeletonTaskItem />
      </div>
    </div>
    
    {/* Project Overview */}
    <div className="space-y-4">
      <div className="flex items-center space-x-3">
        <SkeletonText width={24} height={24} className="rounded-full" />
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
          <SkeletonText width="2/5" height={5} className="mr-2" />
          <SkeletonText width="1/3" height={4} />
        </h3>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <SkeletonCard className="aspect-[4/3]" />
        <SkeletonCard className="aspect-[4/3]" />
      </div>
    </div>
  </div>
);