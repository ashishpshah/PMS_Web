using System;
using System.Collections.Generic;
using Microsoft.Extensions.Configuration;

namespace TaskManagement.Services
{
    /// <summary>
    /// Parses the task status transition graph from appsettings.json's "TaskStatusTransitions"
    /// section once at startup (registered as a singleton — TaskService is Scoped and would
    /// otherwise re-parse this small JSON section on every request). Config shape:
    ///   "TaskStatusTransitions": { "{from}": { "{to}": { "isSpentHours": bool } } }
    /// "isSpentHours": true means Actual Hours is REQUIRED to make that transition.
    /// This is the single source of truth for the status state machine — TaskService's
    /// ValidateStatusTransition consults it both for "is this edge allowed at all" and for
    /// "does this edge require ActualHours"; the /api/tasks/status-transitions endpoint exposes
    /// the same data so the frontend no longer keeps its own separate, driftable copy.
    /// </summary>
    public interface ITaskStatusTransitionProvider
    {
        // from-status -> to-status -> requiresActualHours
        IReadOnlyDictionary<string, IReadOnlyDictionary<string, bool>> Edges { get; }
    }

    public class TaskStatusTransitionProvider : ITaskStatusTransitionProvider
    {
        public IReadOnlyDictionary<string, IReadOnlyDictionary<string, bool>> Edges { get; }

        public TaskStatusTransitionProvider(IConfiguration configuration)
        {
            var graph = new Dictionary<string, IReadOnlyDictionary<string, bool>>(StringComparer.OrdinalIgnoreCase);
            foreach (var fromSection in configuration.GetSection("TaskStatusTransitions").GetChildren())
            {
                var edges = new Dictionary<string, bool>(StringComparer.OrdinalIgnoreCase);
                foreach (var toSection in fromSection.GetChildren())
                    edges[toSection.Key] = toSection.GetValue<bool>("isSpentHours");
                graph[fromSection.Key] = edges;
            }
            Edges = graph;
        }
    }
}
