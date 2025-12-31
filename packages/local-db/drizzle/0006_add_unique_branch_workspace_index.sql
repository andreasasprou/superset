-- Dedupe existing duplicate branch workspaces before creating unique index.
-- Keep the oldest one (smallest id) as the deterministic winner.
-- First, update settings.last_active_workspace_id if it points to a workspace we're about to delete
UPDATE settings
SET last_active_workspace_id = (
    SELECT w1.id FROM workspaces w1
    WHERE w1.type = 'branch'
    AND w1.project_id = (
        SELECT w2.project_id FROM workspaces w2 WHERE w2.id = settings.last_active_workspace_id
    )
    ORDER BY w1.id ASC
    LIMIT 1
)
WHERE last_active_workspace_id IN (
    SELECT w1.id FROM workspaces w1
    WHERE w1.type = 'branch'
    AND EXISTS (
        SELECT 1 FROM workspaces w2
        WHERE w2.type = 'branch'
        AND w2.project_id = w1.project_id
        AND w2.id < w1.id
    )
);

-- Delete duplicate branch workspaces, keeping the oldest (smallest id) per project
DELETE FROM workspaces
WHERE type = 'branch'
AND id NOT IN (
    SELECT MIN(id) FROM workspaces WHERE type = 'branch' GROUP BY project_id
);

-- Now safe to create the unique index
CREATE UNIQUE INDEX IF NOT EXISTS `workspaces_unique_branch_per_project` ON `workspaces` (`project_id`) WHERE `type` = 'branch';
