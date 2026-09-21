-- ============================================================
-- Delete Tasks (TaskEntity) starting with "Task Title"
-- and TaskTemplateItems starting with "Item "
-- ============================================================

-- 1. Get Task IDs to delete (TaskEntity)
DECLARE @TaskIds TABLE (Id INT PRIMARY KEY);
INSERT INTO @TaskIds (Id)
SELECT Id FROM Tasks WHERE Title LIKE 'Task Title%';

-- 2. Get TaskTemplateItem IDs to delete
DECLARE @TemplateItemIds TABLE (Id INT PRIMARY KEY);
INSERT INTO @TemplateItemIds (Id)
SELECT Id FROM TaskTemplateItems WHERE Title LIKE 'Item %';

-- ============================================================
-- DELETE TASK ENTITY RELATED RECORDS (in FK order)
-- ============================================================

-- TaskReviewIssues
DELETE FROM TaskReviewIssues WHERE TaskId IN (SELECT Id FROM @TaskIds);

-- BlockChecklistItems
DELETE FROM BlockChecklistItems WHERE TaskId IN (SELECT Id FROM @TaskIds);

-- ReviewChecklistItems
DELETE FROM ReviewChecklistItems WHERE TaskId IN (SELECT Id FROM @TaskIds);

-- TaskConditionHistories
DELETE FROM TaskConditionHistories WHERE TaskId IN (SELECT Id FROM @TaskIds);

-- TaskBlockEntry (both TaskId and BlockedById could reference tasks)
DELETE FROM TaskBlockEntries WHERE TaskId IN (SELECT Id FROM @TaskIds);

-- TaskStatusHistory
DELETE FROM TaskStatusHistories WHERE TaskId IN (SELECT Id FROM @TaskIds);

-- TaskAssignmentHistory
DELETE FROM TaskAssignmentHistories WHERE TaskId IN (SELECT Id FROM @TaskIds);

-- ChecklistItems
DELETE FROM ChecklistItems WHERE TaskId IN (SELECT Id FROM @TaskIds);

-- TaskTags
DELETE FROM TaskTags WHERE TaskId IN (SELECT Id FROM @TaskIds);

-- TaskComments
DELETE FROM TaskComments WHERE TaskId IN (SELECT Id FROM @TaskIds);

-- Attachments
DELETE FROM Attachments WHERE TaskId IN (SELECT Id FROM @TaskIds);

-- Activity (targetType = 'task')
DELETE FROM Activities WHERE TargetType = 'task' AND TargetId IN (SELECT Id FROM @TaskIds);

-- TaskTemplateGeneratedTask (links generated tasks to template items)
DELETE FROM TaskTemplateGeneratedTasks WHERE TaskId IN (SELECT Id FROM @TaskIds);

-- Subtasks (ChildTasks) - delete children first due to self-referencing FK
DELETE FROM Tasks WHERE ParentTaskId IN (SELECT Id FROM @TaskIds);

-- Finally, delete the Tasks themselves
DELETE FROM Tasks WHERE Id IN (SELECT Id FROM @TaskIds);

-- ============================================================
-- DELETE TASKTEMPLATEITEM RELATED RECORDS (in FK order)
-- ============================================================

-- TaskTemplateItemReviewCriteria
DELETE FROM TaskTemplateItemReviewCriteria WHERE TemplateItemId IN (SELECT Id FROM @TemplateItemIds);

-- TaskTemplateItemAttachment
DELETE FROM TaskTemplateItemAttachments WHERE TemplateItemId IN (SELECT Id FROM @TemplateItemIds);

-- TaskTemplateItemDependency (both TemplateItemId and DependsOnItemId)
DELETE FROM TaskTemplateItemDependencies 
WHERE TemplateItemId IN (SELECT Id FROM @TemplateItemIds)
   OR DependsOnItemId IN (SELECT Id FROM @TemplateItemIds);

-- TaskTemplateItemTag
DELETE FROM TaskTemplateItemTags WHERE TemplateItemId IN (SELECT Id FROM @TemplateItemIds);

-- TaskTemplateItemChecklist
DELETE FROM TaskTemplateItemChecklists WHERE TemplateItemId IN (SELECT Id FROM @TemplateItemIds);

-- Finally, delete the TaskTemplateItems themselves
DELETE FROM TaskTemplateItems WHERE Id IN (SELECT Id FROM @TemplateItemIds);

-- ============================================================
-- VERIFICATION
-- ============================================================
SELECT 'Remaining Tasks with "Task Title%"' AS CheckType, COUNT(*) AS Count FROM Tasks WHERE Title LIKE 'Task Title%'
UNION ALL
SELECT 'Remaining TemplateItems with "Item %"', COUNT(*) FROM TaskTemplateItems WHERE Title LIKE 'Item %';