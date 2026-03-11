-- Fix worker access to workflows and workflow_stages.
-- The old policies only checked projects.workflow_id (project-level workflow).
-- Since workflows are now per-tile, workers also need access via tiles.workflow_id.

-- Drop old worker SELECT policies
DROP POLICY IF EXISTS "workflows_worker_select" ON workflows;
DROP POLICY IF EXISTS "stages_worker_select" ON workflow_stages;

-- Workers can see workflows used by tiles in their projects
CREATE POLICY "workflows_worker_select" ON workflows FOR SELECT USING (
    EXISTS (
        SELECT 1 FROM tiles
        JOIN projects ON projects.id = tiles.project_id
        WHERE tiles.workflow_id = workflows.id
          AND projects.worker_id = auth.uid()
    )
);

-- Workers can see stages for workflows used by tiles in their projects
CREATE POLICY "stages_worker_select" ON workflow_stages FOR SELECT USING (
    EXISTS (
        SELECT 1 FROM tiles
        JOIN projects ON projects.id = tiles.project_id
        WHERE tiles.workflow_id = workflow_stages.workflow_id
          AND projects.worker_id = auth.uid()
    )
);
