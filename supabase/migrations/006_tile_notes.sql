-- Notes on tiles with visibility control
CREATE TABLE tile_notes (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tile_id uuid NOT NULL REFERENCES tiles(id) ON DELETE CASCADE,
    author_id uuid NOT NULL REFERENCES users(id),
    content text NOT NULL,
    visible_to_worker boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_tile_notes_tile_id ON tile_notes(tile_id);

ALTER TABLE tile_notes ENABLE ROW LEVEL SECURITY;

-- Managers: full access to notes on their project tiles
CREATE POLICY "notes_manager_all" ON tile_notes FOR ALL USING (
    EXISTS (
        SELECT 1 FROM tiles
        JOIN projects ON projects.id = tiles.project_id
        WHERE tiles.id = tile_notes.tile_id
          AND projects.manager_id = auth.uid()
    )
) WITH CHECK (
    EXISTS (
        SELECT 1 FROM tiles
        JOIN projects ON projects.id = tiles.project_id
        WHERE tiles.id = tile_notes.tile_id
          AND projects.manager_id = auth.uid()
    )
);

-- Workers: can read visible notes, can insert their own notes (always visible)
CREATE POLICY "notes_worker_select" ON tile_notes FOR SELECT USING (
    visible_to_worker = true
    AND EXISTS (
        SELECT 1 FROM tiles
        JOIN projects ON projects.id = tiles.project_id
        WHERE tiles.id = tile_notes.tile_id
          AND projects.worker_id = auth.uid()
    )
);

CREATE POLICY "notes_worker_insert" ON tile_notes FOR INSERT WITH CHECK (
    author_id = auth.uid()
    AND visible_to_worker = true
    AND EXISTS (
        SELECT 1 FROM tiles
        JOIN projects ON projects.id = tiles.project_id
        WHERE tiles.id = tile_notes.tile_id
          AND projects.worker_id = auth.uid()
    )
);
