using Microsoft.EntityFrameworkCore;
using TaskManagement.Data;

namespace TaskManagement.Services
{
    /// <summary>
    /// Generates the standardized project/task hierarchy codes:
    ///   Project  -> PRJ-PP            (PP = sequential project number)
    ///   Task     -> TSK-PP-TT         (TT = sequential task number in the project)
    ///   Subtask  -> SUB-PP-TT-SS      (SS = sequential subtask number under the parent task)
    /// Sequence numbers are per-scope counters (independent of DB primary keys) and are
    /// zero-padded to 2 digits, expanding naturally beyond 99.
    /// </summary>
    public static class CodeGenerator
    {
        public static string Pad(int n) => n.ToString("D2");

        // ── Project ─────────────────────────────────────────────────────────
        // Next project sequence = max existing SeqNumber + 1 (falls back to count for legacy rows).
        public static async Task<(int seq, string code)> NextProjectCodeAsync(PMSDbContext ctx)
        {
            var maxSeq = await ctx.Projects.MaxAsync(p => (int?)p.SeqNumber) ?? 0;
            var seq = maxSeq + 1;
            return (seq, $"PRJ-{Pad(seq)}");
        }

        // ── Task (top-level) ────────────────────────────────────────────────
        // PP from the owning project; TT sequential among the project's top-level tasks.
        public static async Task<(int seq, string code)> NextTaskCodeAsync(PMSDbContext ctx, int projectId)
        {
            var project = await ctx.Projects.FindAsync(projectId);
            var pp = project?.SeqNumber ?? 0;

            var maxSeq = await ctx.Tasks
                .Where(t => t.ProjectId == projectId && t.ParentTaskId == null)
                .MaxAsync(t => (int?)t.SeqNumber) ?? 0;
            var tt = maxSeq + 1;

            return (tt, $"TSK-{Pad(pp)}-{Pad(tt)}");
        }

        // ── Subtask (task with a parent) ────────────────────────────────────
        // PP from project, TT from parent task's SeqNumber, SS sequential among the parent's children.
        public static async Task<(int seq, string code)> NextSubtaskCodeAsync(PMSDbContext ctx, TaskManagement.Data.TaskEntity parent)
        {
            var project = await ctx.Projects.FindAsync(parent.ProjectId);
            var pp = project?.SeqNumber ?? 0;
            var tt = parent.SeqNumber;

            var maxSeq = await ctx.Tasks
                .Where(t => t.ParentTaskId == parent.Id)
                .MaxAsync(t => (int?)t.SeqNumber) ?? 0;
            var ss = maxSeq + 1;

            return (ss, $"SUB-{Pad(pp)}-{Pad(tt)}-{Pad(ss)}");
        }
    }
}
