-- Move workflow assignment from project level to tile level
-- This allows multiple workflows within a single project

-- Add workflow_id to tiles
ALTER TABLE tiles ADD COLUMN workflow_id uuid REFERENCES workflows(id);

-- Migrate existing tiles: copy workflow_id from their project
UPDATE tiles SET workflow_id = (SELECT workflow_id FROM projects WHERE projects.id = tiles.project_id);

-- Make workflow_id NOT NULL after migration
ALTER TABLE tiles ALTER COLUMN workflow_id SET NOT NULL;

-- Make workflow_id optional on projects (kept as default workflow for new tiles)
ALTER TABLE projects ALTER COLUMN workflow_id DROP NOT NULL;
