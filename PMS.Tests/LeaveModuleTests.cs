using System;
using System.Linq;
using System.Threading.Tasks;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Diagnostics;
using TaskManagement.Data;
using TaskManagement.DTOs;
using TaskManagement.Services;
using Xunit;

namespace PMS.Tests
{
    /// <summary>
    /// Tests the Leave and Holidays module (WorkweekRulesService's Nth-Saturday math + manual
    /// overrides, and LeaveService's request/approve/reject/cancel/balance flow) against an
    /// EF Core in-memory database — mirrors StatusTransitionTests' setup style.
    ///
    /// Dates used throughout are October 2026 (deliberately in the future relative to any
    /// realistic "today" so LeaveService's backdating guard never trips): Oct 1, 2026 is a
    /// Thursday, so October's Saturdays fall on the 3rd/10th/17th/24th/31st (occurrences 1..5).
    ///
    /// Default Saturday rule: 1st/3rd/5th = Off (Holiday), 2nd/4th = a full working day. Only
    /// two DayTypes exist — "Holiday" and "WorkingDay" — either can be set as a manual
    /// per-date override regardless of what the default pattern would otherwise produce.
    /// </summary>
    public class LeaveModuleTests : IDisposable
    {
        private readonly PMSDbContext _ctx;
        private readonly WorkweekRulesService _rules;
        private readonly HolidayService _holidaySvc;
        private readonly LeaveService _leaveSvc;

        private const int EmployeeId = 1;
        private const int ApproverId = 2;
        private const int LeaveTypeId = 1;

        public LeaveModuleTests()
        {
            var opts = new DbContextOptionsBuilder<PMSDbContext>()
                .UseInMemoryDatabase(Guid.NewGuid().ToString())
                .ConfigureWarnings(w => w.Ignore(InMemoryEventId.TransactionIgnoredWarning))
                .Options;
            _ctx = new PMSDbContext(opts);

            _rules = new WorkweekRulesService(_ctx);
            _holidaySvc = new HolidayService(_ctx, _rules);
            var allocations = new AnnualLeaveAllocationService(_ctx);
            _leaveSvc = new LeaveService(_ctx, _rules, allocations);

            Seed();
        }

        private void Seed()
        {
            _ctx.Roles.Add(new Role { Id = 1, Name = "SystemAdmin", IsAdmin = true });
            _ctx.Users.Add(new User { Id = EmployeeId, UserName = "employee", Email = "employee@test.com", FirstName = "Emp", LastName = "Loyee", FullName = "Emp Loyee", PasswordHash = "x", RoleId = 1, IsActive = true, CreatedAt = DateTime.UtcNow });
            _ctx.Users.Add(new User { Id = ApproverId, UserName = "approver", Email = "approver@test.com", FirstName = "App", LastName = "Rover", FullName = "App Rover", PasswordHash = "x", RoleId = 1, IsActive = true, CreatedAt = DateTime.UtcNow });
            _ctx.LeaveTypes.Add(new LeaveType { Id = LeaveTypeId, Name = "Casual Leave", IsActive = true });
            // 5-day pooled allocation for 2026 (all test dates fall in Oct 2026) — mirrors the old
            // per-type quota this test suite exercised before allocation became type-agnostic.
            _ctx.AnnualLeaveAllocations.Add(new AnnualLeaveAllocation { Year = 2026, LeaveDays = 5 });
            _ctx.SaveChanges();
        }

        public void Dispose() => _ctx.Dispose();

        // ── Nth-Saturday-of-month math (default rule: 1,3,5 off / 2,4 full working day) ──

        [Theory]
        [InlineData(3, "Holiday")]     // 1st Saturday — off
        [InlineData(10, "WorkingDay")] // 2nd Saturday — full working day
        [InlineData(17, "Holiday")]    // 3rd Saturday — off
        [InlineData(24, "WorkingDay")] // 4th Saturday — full working day
        [InlineData(31, "Holiday")]    // 5th Saturday — off
        public async Task GetDayType_AlternatingSaturdays_MatchDefaultRule(int octoberDay, string expected)
        {
            // WorkweekRulesService lazily creates the default rules row (Holiday: 1,3,5 / Working: none) on first use.
            var actual = await _rules.GetDayTypeAsync(new DateTime(2026, 10, octoberDay));
            Assert.Equal(expected, actual);
        }

        [Fact]
        public async Task GetDayType_Sunday_IsHoliday()
        {
            // Oct 4, 2026 is a Sunday.
            Assert.Equal("Holiday", await _rules.GetDayTypeAsync(new DateTime(2026, 10, 4)));
        }

        [Fact]
        public async Task GetDayType_Weekday_IsWorkingDay()
        {
            // Oct 5, 2026 is a Monday.
            Assert.Equal("WorkingDay", await _rules.GetDayTypeAsync(new DateTime(2026, 10, 5)));
        }

        [Fact]
        public async Task ManualOverride_TakesPrecedenceOverComputedRule()
        {
            // Override the otherwise-plain Monday Oct 5, 2026 to a company holiday.
            _ctx.Holidays.Add(new Holiday { Date = new DateTime(2026, 10, 5), Name = "Founder's Day", DayType = "Holiday", IsManualOverride = true });
            await _ctx.SaveChangesAsync();

            Assert.Equal("Holiday", await _rules.GetDayTypeAsync(new DateTime(2026, 10, 5)));
        }

        [Fact]
        public async Task UpdateRules_ChangingSaturdayPattern_ClearsStaleFutureAutoRows()
        {
            var rangeStart = new DateTime(2026, 10, 1);
            var rangeEnd = new DateTime(2026, 10, 31);

            // Default pattern (1,3,5) materializes the 1st/3rd/5th Saturdays.
            await _holidaySvc.RegenerateSaturdayHolidaysAsync(rangeStart, rangeEnd);
            var beforeNames = _ctx.Holidays.Where(h => h.Date >= rangeStart && h.Date <= rangeEnd)
                .Select(h => h.Name).OrderBy(n => n).ToList();
            Assert.Equal(new[] { "1st Saturday", "3rd Saturday", "5th Saturday" }, beforeNames);

            // Flip the policy to 2nd/4th.
            var updated = await _rules.UpdateRulesAsync(ApproverId, new UpdateWorkweekRulesDto
            {
                WorkStartTime = "10:00",
                WorkEndTime = "19:00",
                BreakMinMinutes = 30,
                BreakMaxMinutes = 60,
                HolidaySaturdayOccurrences = new() { 2, 4 },
            });
            Assert.True(updated.Success, updated.Message);

            // Regression guard: the stale 1st/3rd/5th rows must be gone, not left behind for the
            // next regeneration pass to additively join with the new 2nd/4th rows (the reported
            // bug — every Saturday in the month ends up looking "off").
            Assert.Empty(_ctx.Holidays.Where(h => h.Date >= rangeStart && h.Date <= rangeEnd));

            // Regenerating against the new pattern produces exactly 2nd/4th — not a union of both.
            await _holidaySvc.RegenerateSaturdayHolidaysAsync(rangeStart, rangeEnd);
            var afterNames = _ctx.Holidays.Where(h => h.Date >= rangeStart && h.Date <= rangeEnd)
                .Select(h => h.Name).OrderBy(n => n).ToList();
            Assert.Equal(new[] { "2nd Saturday", "4th Saturday" }, afterNames);
        }

        [Fact]
        public async Task UpdateRules_ThenEagerRegenerateAcrossMultipleMonths_UpdatesEveryMonth()
        {
            // Mirrors what LeaveController.UpdateRules now does in one shot after a successful
            // rules change: regenerate the whole remaining span in a single call, so every month
            // in range picks up the new pattern immediately instead of only whichever single
            // month someone happens to view next.
            var rangeStart = new DateTime(2026, 10, 1);
            var rangeEnd = new DateTime(2026, 12, 31);

            await _holidaySvc.RegenerateSaturdayHolidaysAsync(rangeStart, rangeEnd);
            var beforeCount = _ctx.Holidays.Count(h => h.Date >= rangeStart && h.Date <= rangeEnd && h.Name != null && (h.Name.StartsWith("1st") || h.Name.StartsWith("3rd") || h.Name.StartsWith("5th")));
            Assert.True(beforeCount > 0);

            var updated = await _rules.UpdateRulesAsync(ApproverId, new UpdateWorkweekRulesDto
            {
                WorkStartTime = "10:00",
                WorkEndTime = "19:00",
                BreakMinMinutes = 30,
                BreakMaxMinutes = 60,
                HolidaySaturdayOccurrences = new() { 2, 4 },
            });
            Assert.True(updated.Success, updated.Message);

            // Single eager call spanning all three months — same as the controller's post-update step.
            await _holidaySvc.RegenerateSaturdayHolidaysAsync(rangeStart, rangeEnd);

            var namesByMonth = _ctx.Holidays
                .Where(h => h.Date >= rangeStart && h.Date <= rangeEnd)
                .OrderBy(h => h.Date)
                .Select(h => new { h.Date.Month, h.Name })
                .ToList();

            foreach (var month in new[] { 10, 11, 12 })
            {
                var names = namesByMonth.Where(x => x.Month == month).Select(x => x.Name).OrderBy(n => n).ToList();
                Assert.Equal(new[] { "2nd Saturday", "4th Saturday" }, names);
            }
        }

        [Fact]
        public async Task UpdateRules_ClearsPastAutoRowsButKeepsManualHolidays()
        {
            // An auto-generated Saturday row is just a cache of the pattern formula's output, not
            // a historical record — unlike an admin-curated manual holiday (a real named event),
            // it does NOT survive a policy change, even for a date that's already passed.
            var pastSaturday = AppClock.Today.AddDays(-30);
            while (pastSaturday.DayOfWeek != DayOfWeek.Saturday) pastSaturday = pastSaturday.AddDays(-1);
            var pastMonday = AppClock.Today.AddDays(-29);
            while (pastMonday.DayOfWeek != DayOfWeek.Monday) pastMonday = pastMonday.AddDays(-1);

            _ctx.Holidays.Add(new Holiday { Date = pastSaturday, Name = "Old pattern Saturday", DayType = "Holiday", IsManualOverride = false });
            _ctx.Holidays.Add(new Holiday { Date = pastMonday, Name = "Founder's Day", DayType = "Holiday", IsManualOverride = true, CreatedById = ApproverId });
            await _ctx.SaveChangesAsync();

            var updated = await _rules.UpdateRulesAsync(ApproverId, new UpdateWorkweekRulesDto
            {
                WorkStartTime = "10:00",
                WorkEndTime = "19:00",
                BreakMinMinutes = 30,
                BreakMaxMinutes = 60,
                HolidaySaturdayOccurrences = new() { 2, 4 },
            });
            Assert.True(updated.Success, updated.Message);

            Assert.Null(_ctx.Holidays.FirstOrDefault(h => h.Date == pastSaturday));
            Assert.NotNull(_ctx.Holidays.FirstOrDefault(h => h.Date == pastMonday));
        }

        // ── Leave request → approve → balance deduction ──────────────────────────

        [Fact]
        public async Task Request_TwoPlainWeekdays_ComputesDayCountOfTwo()
        {
            // Oct 5-6, 2026 = Mon/Tue, no Saturday/holiday involved.
            var result = await _leaveSvc.RequestAsync(EmployeeId, new CreateLeaveRequestDto
            {
                LeaveTypeId = LeaveTypeId,
                StartDate = new DateTime(2026, 10, 5),
                EndDate = new DateTime(2026, 10, 6),
                Reason = "Personal work"
            });

            Assert.True(result.Success, result.Message);
            Assert.Equal(2m, result.Data?.DayCount);
            Assert.Equal("Pending", result.Data?.Status);
        }

        [Fact]
        public async Task Request_SpanningOffSaturday_ExcludesThatDay()
        {
            // Oct 2-3, 2026 = Fri (working, 1) + Sat 1st occurrence (off by default, 0) = 1 day total.
            var result = await _leaveSvc.RequestAsync(EmployeeId, new CreateLeaveRequestDto
            {
                LeaveTypeId = LeaveTypeId,
                StartDate = new DateTime(2026, 10, 2),
                EndDate = new DateTime(2026, 10, 3),
                Reason = "Long weekend"
            });

            Assert.True(result.Success, result.Message);
            Assert.Equal(1m, result.Data?.DayCount);
        }

        [Fact]
        public async Task Request_SpanningManualWorkingDayOverride_CountsFullDay()
        {
            // Oct 3, 2026 (1st Saturday) defaults to Holiday under the current rule; manually
            // override it to WorkingDay to verify a full day is then counted for it, same as
            // any other admin per-date override.
            _ctx.Holidays.Add(new Holiday { Date = new DateTime(2026, 10, 3), Name = "Working Saturday override", DayType = "WorkingDay", IsManualOverride = true });
            await _ctx.SaveChangesAsync();

            var result = await _leaveSvc.RequestAsync(EmployeeId, new CreateLeaveRequestDto
            {
                LeaveTypeId = LeaveTypeId,
                StartDate = new DateTime(2026, 10, 2),
                EndDate = new DateTime(2026, 10, 3),
                Reason = "Long weekend"
            });

            Assert.True(result.Success, result.Message);
            Assert.Equal(2m, result.Data?.DayCount); // Fri (1) + manually-overridden working Sat (1)
        }

        [Fact]
        public async Task ApproveRequest_DeductsFromBalance()
        {
            var request = await _leaveSvc.RequestAsync(EmployeeId, new CreateLeaveRequestDto
            {
                LeaveTypeId = LeaveTypeId,
                StartDate = new DateTime(2026, 10, 5),
                EndDate = new DateTime(2026, 10, 6),
                Reason = "Personal work"
            });
            Assert.True(request.Success, request.Message);

            var decided = await _leaveSvc.DecideAsync(ApproverId, request.Data!.Id, new DecideLeaveRequestDto { Approve = true });
            Assert.True(decided.Success, decided.Message);
            Assert.Equal("Approved", decided.Data?.Status);

            var balance = await _leaveSvc.GetMyBalanceAsync(EmployeeId);
            Assert.Equal(5m, balance.Data!.AllocatedDays);
            Assert.Equal(2m, balance.Data!.UsedDays);
            Assert.Equal(3m, balance.Data!.AvailableDays);
        }

        [Fact]
        public async Task RejectRequest_DoesNotAffectBalance()
        {
            var request = await _leaveSvc.RequestAsync(EmployeeId, new CreateLeaveRequestDto
            {
                LeaveTypeId = LeaveTypeId,
                StartDate = new DateTime(2026, 10, 5),
                EndDate = new DateTime(2026, 10, 6),
                Reason = "Personal work"
            });
            Assert.True(request.Success, request.Message);

            var decided = await _leaveSvc.DecideAsync(ApproverId, request.Data!.Id, new DecideLeaveRequestDto { Approve = false, DecisionNote = "Not enough coverage" });
            Assert.True(decided.Success, decided.Message);
            Assert.Equal("Rejected", decided.Data?.Status);

            var balance = await _leaveSvc.GetMyBalanceAsync(EmployeeId);
            Assert.Equal(0m, balance.Data!.UsedDays);
        }

        [Fact]
        public async Task Decide_OnAlreadyDecidedRequest_Fails()
        {
            var request = await _leaveSvc.RequestAsync(EmployeeId, new CreateLeaveRequestDto
            {
                LeaveTypeId = LeaveTypeId,
                StartDate = new DateTime(2026, 10, 5),
                EndDate = new DateTime(2026, 10, 6),
                Reason = "Personal work"
            });
            Assert.True(request.Success, request.Message);
            await _leaveSvc.DecideAsync(ApproverId, request.Data!.Id, new DecideLeaveRequestDto { Approve = true });

            var secondDecision = await _leaveSvc.DecideAsync(ApproverId, request.Data!.Id, new DecideLeaveRequestDto { Approve = false, DecisionNote = "too late" });

            Assert.False(secondDecision.Success);
        }

        [Fact]
        public async Task DeletePendingRequest_Succeeds()
        {
            var request = await _leaveSvc.RequestAsync(EmployeeId, new CreateLeaveRequestDto
            {
                LeaveTypeId = LeaveTypeId,
                StartDate = new DateTime(2026, 10, 5),
                EndDate = new DateTime(2026, 10, 6),
                Reason = "Personal work"
            });
            Assert.True(request.Success, request.Message);

            var deleted = await _leaveSvc.DeleteAsync(EmployeeId, request.Data!.Id);

            Assert.True(deleted.Success, deleted.Message);
            var mine = await _leaveSvc.GetMyRequestsAsync(EmployeeId);
            Assert.DoesNotContain(mine.Data!, r => r.Id == request.Data!.Id);
        }

        [Fact]
        public async Task DeleteApprovedRequest_Fails()
        {
            var request = await _leaveSvc.RequestAsync(EmployeeId, new CreateLeaveRequestDto
            {
                LeaveTypeId = LeaveTypeId,
                StartDate = new DateTime(2026, 10, 5),
                EndDate = new DateTime(2026, 10, 6),
                Reason = "Personal work"
            });
            Assert.True(request.Success, request.Message);
            await _leaveSvc.DecideAsync(ApproverId, request.Data!.Id, new DecideLeaveRequestDto { Approve = true });

            var deleted = await _leaveSvc.DeleteAsync(EmployeeId, request.Data!.Id);

            Assert.False(deleted.Success);
        }

        [Fact]
        public async Task DeletePendingRequest_WithAllowDeleteFalse_Fails()
        {
            var request = await _leaveSvc.RequestAsync(EmployeeId, new CreateLeaveRequestDto
            {
                LeaveTypeId = LeaveTypeId,
                StartDate = new DateTime(2026, 10, 5),
                EndDate = new DateTime(2026, 10, 6),
                Reason = "Personal work"
            });
            Assert.True(request.Success, request.Message);

            var locked = await _leaveSvc.SetPermissionsAsync(request.Data!.Id, new SetLeaveRequestPermissionsDto { AllowEdit = true, AllowDelete = false });
            Assert.True(locked.Success, locked.Message);

            var deleted = await _leaveSvc.DeleteAsync(EmployeeId, request.Data!.Id);

            Assert.False(deleted.Success);
        }

        [Fact]
        public async Task EditPendingRequest_RecomputesDayCount()
        {
            var request = await _leaveSvc.RequestAsync(EmployeeId, new CreateLeaveRequestDto
            {
                LeaveTypeId = LeaveTypeId,
                StartDate = new DateTime(2026, 10, 5),
                EndDate = new DateTime(2026, 10, 6),
                Reason = "Personal work"
            });
            Assert.True(request.Success, request.Message);
            Assert.Equal(2m, request.Data!.DayCount);

            // Extend to Mon-Wed (3 plain weekdays).
            var updated = await _leaveSvc.UpdateAsync(EmployeeId, request.Data!.Id, new UpdateLeaveRequestDto
            {
                LeaveTypeId = LeaveTypeId,
                StartDate = new DateTime(2026, 10, 5),
                EndDate = new DateTime(2026, 10, 7),
                Reason = "Personal work (extended)"
            });

            Assert.True(updated.Success, updated.Message);
            Assert.Equal(3m, updated.Data?.DayCount);
        }

        [Fact]
        public async Task EditRequest_WithAllowEditFalse_Fails()
        {
            var request = await _leaveSvc.RequestAsync(EmployeeId, new CreateLeaveRequestDto
            {
                LeaveTypeId = LeaveTypeId,
                StartDate = new DateTime(2026, 10, 5),
                EndDate = new DateTime(2026, 10, 6),
                Reason = "Personal work"
            });
            Assert.True(request.Success, request.Message);

            var locked = await _leaveSvc.SetPermissionsAsync(request.Data!.Id, new SetLeaveRequestPermissionsDto { AllowEdit = false, AllowDelete = true });
            Assert.True(locked.Success, locked.Message);

            var updated = await _leaveSvc.UpdateAsync(EmployeeId, request.Data!.Id, new UpdateLeaveRequestDto
            {
                LeaveTypeId = LeaveTypeId,
                StartDate = new DateTime(2026, 10, 5),
                EndDate = new DateTime(2026, 10, 7),
                Reason = "Trying to extend"
            });

            Assert.False(updated.Success);
        }

        [Fact]
        public async Task EditApprovedRequest_Fails()
        {
            var request = await _leaveSvc.RequestAsync(EmployeeId, new CreateLeaveRequestDto
            {
                LeaveTypeId = LeaveTypeId,
                StartDate = new DateTime(2026, 10, 5),
                EndDate = new DateTime(2026, 10, 6),
                Reason = "Personal work"
            });
            Assert.True(request.Success, request.Message);
            await _leaveSvc.DecideAsync(ApproverId, request.Data!.Id, new DecideLeaveRequestDto { Approve = true });

            var updated = await _leaveSvc.UpdateAsync(EmployeeId, request.Data!.Id, new UpdateLeaveRequestDto
            {
                LeaveTypeId = LeaveTypeId,
                StartDate = new DateTime(2026, 10, 5),
                EndDate = new DateTime(2026, 10, 7),
                Reason = "Trying to extend an approved request"
            });

            Assert.False(updated.Success);
        }

        [Fact]
        public async Task SetPermissions_OnDecidedRequest_Fails()
        {
            var request = await _leaveSvc.RequestAsync(EmployeeId, new CreateLeaveRequestDto
            {
                LeaveTypeId = LeaveTypeId,
                StartDate = new DateTime(2026, 10, 5),
                EndDate = new DateTime(2026, 10, 6),
                Reason = "Personal work"
            });
            Assert.True(request.Success, request.Message);
            await _leaveSvc.DecideAsync(ApproverId, request.Data!.Id, new DecideLeaveRequestDto { Approve = true });

            var result = await _leaveSvc.SetPermissionsAsync(request.Data!.Id, new SetLeaveRequestPermissionsDto { AllowEdit = false, AllowDelete = false });

            Assert.False(result.Success);
        }

        [Fact]
        public async Task NewRequest_DefaultsToAllowEditAndDeleteTrue()
        {
            var request = await _leaveSvc.RequestAsync(EmployeeId, new CreateLeaveRequestDto
            {
                LeaveTypeId = LeaveTypeId,
                StartDate = new DateTime(2026, 10, 5),
                EndDate = new DateTime(2026, 10, 6),
                Reason = "Personal work"
            });

            Assert.True(request.Success, request.Message);
            Assert.True(request.Data!.AllowEdit);
            Assert.True(request.Data!.AllowDelete);
        }

        [Fact]
        public async Task Request_ExceedingAllocation_StillSucceeds()
        {
            // Quota is 5 days; Oct 5 (Mon) through Oct 12 (Mon) = Mon,Tue,Wed,Thu,Fri (5 working
            // days) + Sat 2nd occurrence (full working day by default, 1) + Sun (off, 0) + Mon (1)
            // = 7 working days — over the 5-day quota, but submission is never blocked on balance;
            // that's the approver's call, not a validation gate.
            var result = await _leaveSvc.RequestAsync(EmployeeId, new CreateLeaveRequestDto
            {
                LeaveTypeId = LeaveTypeId,
                StartDate = new DateTime(2026, 10, 5),
                EndDate = new DateTime(2026, 10, 12),
                Reason = "Long trip"
            });

            Assert.True(result.Success, result.Message);
            Assert.Equal(7m, result.Data?.DayCount);

            var decided = await _leaveSvc.DecideAsync(ApproverId, result.Data!.Id, new DecideLeaveRequestDto { Approve = true });
            Assert.True(decided.Success, decided.Message);

            var balance = await _leaveSvc.GetMyBalanceAsync(EmployeeId);
            Assert.Equal(5m, balance.Data!.AllocatedDays);
            Assert.Equal(7m, balance.Data!.UsedDays);
            Assert.Equal(-2m, balance.Data!.AvailableDays);
        }

        [Fact]
        public async Task Request_ForPastDate_Fails()
        {
            var yesterday = AppClock.Today.AddDays(-1);
            var result = await _leaveSvc.RequestAsync(EmployeeId, new CreateLeaveRequestDto
            {
                LeaveTypeId = LeaveTypeId,
                StartDate = yesterday,
                EndDate = yesterday,
                Reason = "Backdated"
            });

            Assert.False(result.Success);
            Assert.Contains("past", result.Message, StringComparison.OrdinalIgnoreCase);
        }

        [Fact]
        public async Task Request_SameStartAndEndDate_ComputesOneDay()
        {
            // Start == End is the common single-day case and must not be rejected. Oct 5, 2026
            // is a plain Monday (no Saturday/holiday math involved).
            var result = await _leaveSvc.RequestAsync(EmployeeId, new CreateLeaveRequestDto
            {
                LeaveTypeId = LeaveTypeId,
                StartDate = new DateTime(2026, 10, 5),
                EndDate = new DateTime(2026, 10, 5),
                Reason = "Single day off"
            });

            Assert.True(result.Success, result.Message);
            Assert.Equal(1m, result.Data?.DayCount);
        }

        [Fact]
        public async Task Request_OverlappingExistingPending_Fails()
        {
            var first = await _leaveSvc.RequestAsync(EmployeeId, new CreateLeaveRequestDto
            {
                LeaveTypeId = LeaveTypeId,
                StartDate = new DateTime(2026, 10, 5),
                EndDate = new DateTime(2026, 10, 6),
                Reason = "First"
            });
            Assert.True(first.Success, first.Message);

            var overlapping = await _leaveSvc.RequestAsync(EmployeeId, new CreateLeaveRequestDto
            {
                LeaveTypeId = LeaveTypeId,
                StartDate = new DateTime(2026, 10, 6),
                EndDate = new DateTime(2026, 10, 7),
                Reason = "Overlaps first"
            });

            Assert.False(overlapping.Success);
            Assert.Contains("overlaps", overlapping.Message, StringComparison.OrdinalIgnoreCase);
        }
    }
}
