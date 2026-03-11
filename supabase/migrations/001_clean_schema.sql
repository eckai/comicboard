-- ComicBoard Clean Schema
-- Run this in Supabase SQL Editor as a single query

-- ============================================================================
-- ENUMS
-- ============================================================================

CREATE TYPE user_role AS ENUM ('manager', 'worker');
CREATE TYPE payment_mode AS ENUM ('on_completion', 'incremental_even', 'incremental_custom');
CREATE TYPE tile_status AS ENUM ('active', 'pending_approval', 'completed', 'archived');
CREATE TYPE payment_status AS ENUM ('owed', 'paid');

-- ============================================================================
-- TABLES
-- ============================================================================

CREATE TABLE users (
    id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED,
    email text NOT NULL,
    display_name text,
    role user_role NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE workflows (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name text NOT NULL,
    manager_id uuid NOT NULL REFERENCES users(id),
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE workflow_stages (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    workflow_id uuid NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
    name text NOT NULL,
    stage_order int NOT NULL,
    payment_pct decimal NOT NULL DEFAULT 0,
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (workflow_id, stage_order)
);

CREATE TABLE projects (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name text NOT NULL,
    manager_id uuid NOT NULL REFERENCES users(id),
    worker_id uuid REFERENCES users(id),
    workflow_id uuid NOT NULL REFERENCES workflows(id),
    payment_mode payment_mode NOT NULL,
    approval_required boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE tiles (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    title text NOT NULL,
    current_stage_id uuid REFERENCES workflow_stages(id),
    total_value decimal NOT NULL DEFAULT 0,
    status tile_status NOT NULL DEFAULT 'active',
    created_at timestamptz NOT NULL DEFAULT now(),
    completed_at timestamptz
);

CREATE TABLE stage_transitions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tile_id uuid NOT NULL REFERENCES tiles(id) ON DELETE CASCADE,
    from_stage_id uuid REFERENCES workflow_stages(id),
    to_stage_id uuid NOT NULL REFERENCES workflow_stages(id),
    moved_by uuid NOT NULL REFERENCES users(id),
    approved_by uuid REFERENCES users(id),
    approved_at timestamptz,
    rejected boolean NOT NULL DEFAULT false,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE payments (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tile_id uuid NOT NULL REFERENCES tiles(id) ON DELETE CASCADE,
    stage_id uuid NOT NULL REFERENCES workflow_stages(id),
    amount decimal NOT NULL,
    status payment_status NOT NULL DEFAULT 'owed',
    paid_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE invites (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    token text UNIQUE NOT NULL,
    manager_id uuid NOT NULL REFERENCES users(id),
    email text,
    used_by uuid REFERENCES users(id),
    expires_at timestamptz NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);

-- ============================================================================
-- INDEXES
-- ============================================================================

CREATE INDEX idx_tiles_project_id ON tiles(project_id);
CREATE INDEX idx_tiles_current_stage_id ON tiles(current_stage_id);
CREATE INDEX idx_tiles_status ON tiles(status);
CREATE INDEX idx_stage_transitions_tile_id ON stage_transitions(tile_id);
CREATE INDEX idx_payments_tile_id ON payments(tile_id);
CREATE INDEX idx_payments_status ON payments(status);
CREATE INDEX idx_workflow_stages_workflow_id ON workflow_stages(workflow_id);

-- ============================================================================
-- AUTO-CREATE USER PROFILE ON SIGNUP (SECURITY DEFINER bypasses RLS)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.users (id, email, display_name, role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1)),
    COALESCE((NEW.raw_user_meta_data->>'role')::user_role, 'worker')
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================

ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE workflows ENABLE ROW LEVEL SECURITY;
ALTER TABLE workflow_stages ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE tiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE stage_transitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE invites ENABLE ROW LEVEL SECURITY;

-- users: read own + coworkers, update own (no insert policy needed - trigger handles it)
CREATE POLICY "users_select_own" ON users FOR SELECT USING (id = auth.uid());
CREATE POLICY "users_select_coworkers" ON users FOR SELECT USING (
    EXISTS (SELECT 1 FROM projects WHERE projects.manager_id = auth.uid() AND (projects.worker_id = users.id OR projects.manager_id = users.id))
);
CREATE POLICY "users_update_own" ON users FOR UPDATE USING (id = auth.uid());

-- workflows: manager CRUD, worker read
CREATE POLICY "workflows_manager_all" ON workflows FOR ALL USING (manager_id = auth.uid()) WITH CHECK (manager_id = auth.uid());
CREATE POLICY "workflows_worker_select" ON workflows FOR SELECT USING (
    EXISTS (SELECT 1 FROM projects WHERE projects.workflow_id = workflows.id AND projects.worker_id = auth.uid())
);

-- workflow_stages: manager CRUD, worker read
CREATE POLICY "stages_manager_all" ON workflow_stages FOR ALL USING (
    EXISTS (SELECT 1 FROM workflows WHERE workflows.id = workflow_stages.workflow_id AND workflows.manager_id = auth.uid())
) WITH CHECK (
    EXISTS (SELECT 1 FROM workflows WHERE workflows.id = workflow_stages.workflow_id AND workflows.manager_id = auth.uid())
);
CREATE POLICY "stages_worker_select" ON workflow_stages FOR SELECT USING (
    EXISTS (SELECT 1 FROM projects JOIN workflows ON workflows.id = projects.workflow_id WHERE workflows.id = workflow_stages.workflow_id AND projects.worker_id = auth.uid())
);

-- projects: manager CRUD, worker read
CREATE POLICY "projects_manager_all" ON projects FOR ALL USING (manager_id = auth.uid()) WITH CHECK (manager_id = auth.uid());
CREATE POLICY "projects_worker_select" ON projects FOR SELECT USING (worker_id = auth.uid());

-- tiles: manager CRUD, worker read + update
CREATE POLICY "tiles_manager_all" ON tiles FOR ALL USING (
    EXISTS (SELECT 1 FROM projects WHERE projects.id = tiles.project_id AND projects.manager_id = auth.uid())
) WITH CHECK (
    EXISTS (SELECT 1 FROM projects WHERE projects.id = tiles.project_id AND projects.manager_id = auth.uid())
);
CREATE POLICY "tiles_worker_select" ON tiles FOR SELECT USING (
    EXISTS (SELECT 1 FROM projects WHERE projects.id = tiles.project_id AND projects.worker_id = auth.uid())
);
CREATE POLICY "tiles_worker_update" ON tiles FOR UPDATE USING (
    EXISTS (SELECT 1 FROM projects WHERE projects.id = tiles.project_id AND projects.worker_id = auth.uid())
);

-- stage_transitions: manager CRUD, worker insert + read
CREATE POLICY "transitions_manager_all" ON stage_transitions FOR ALL USING (
    EXISTS (SELECT 1 FROM tiles JOIN projects ON projects.id = tiles.project_id WHERE tiles.id = stage_transitions.tile_id AND projects.manager_id = auth.uid())
) WITH CHECK (
    EXISTS (SELECT 1 FROM tiles JOIN projects ON projects.id = tiles.project_id WHERE tiles.id = stage_transitions.tile_id AND projects.manager_id = auth.uid())
);
CREATE POLICY "transitions_worker_insert" ON stage_transitions FOR INSERT WITH CHECK (
    moved_by = auth.uid() AND EXISTS (SELECT 1 FROM tiles JOIN projects ON projects.id = tiles.project_id WHERE tiles.id = stage_transitions.tile_id AND projects.worker_id = auth.uid())
);
CREATE POLICY "transitions_worker_select" ON stage_transitions FOR SELECT USING (
    moved_by = auth.uid() OR EXISTS (SELECT 1 FROM tiles JOIN projects ON projects.id = tiles.project_id WHERE tiles.id = stage_transitions.tile_id AND projects.worker_id = auth.uid())
);

-- payments: manager CRUD, worker read
CREATE POLICY "payments_manager_all" ON payments FOR ALL USING (
    EXISTS (SELECT 1 FROM tiles JOIN projects ON projects.id = tiles.project_id WHERE tiles.id = payments.tile_id AND projects.manager_id = auth.uid())
) WITH CHECK (
    EXISTS (SELECT 1 FROM tiles JOIN projects ON projects.id = tiles.project_id WHERE tiles.id = payments.tile_id AND projects.manager_id = auth.uid())
);
CREATE POLICY "payments_worker_select" ON payments FOR SELECT USING (
    EXISTS (SELECT 1 FROM tiles JOIN projects ON projects.id = tiles.project_id WHERE tiles.id = payments.tile_id AND projects.worker_id = auth.uid())
);

-- invites: manager CRUD, anyone can read (for accepting), authenticated can update (to mark used)
CREATE POLICY "invites_manager_all" ON invites FOR ALL USING (manager_id = auth.uid()) WITH CHECK (manager_id = auth.uid());
CREATE POLICY "invites_select_by_token" ON invites FOR SELECT USING (true);
CREATE POLICY "invites_update_on_accept" ON invites FOR UPDATE USING (true) WITH CHECK (used_by = auth.uid());
