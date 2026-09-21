namespace TaskManagement.DTOs
{
    public static class PaginationConstants
    {
        public const int DefaultPageSize = 25;
        public const int DashboardCardPageSize = 10;
        public const int MaxPageSize = 100;
        public const int MinPageSize = 1;
    }

    public class PaginationRequest
    {
        public int Page { get; set; } = 1;
        public int PageSize { get; set; } = PaginationConstants.DefaultPageSize;

        public void Normalize()
        {
            if (Page < 1) Page = 1;
            if (PageSize < PaginationConstants.MinPageSize) PageSize = PaginationConstants.MinPageSize;
            if (PageSize > PaginationConstants.MaxPageSize) PageSize = PaginationConstants.MaxPageSize;
        }
    }

    public class PaginatedResponse<T>
    {
        public List<T> Data { get; set; } = new();
        public int TotalCount { get; set; }
        public int Page { get; set; }
        public int PageSize { get; set; }
        public int TotalPages => PageSize > 0 ? (int)Math.Ceiling((double)TotalCount / PageSize) : 1;
    }
}