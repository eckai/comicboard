-- Fix: Auto-create user profile on auth signup using a database trigger.
-- This avoids RLS issues when inserting into the users table during signup.

-- Create a function that runs after a new auth user is created
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.users (id, email, display_name, role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'display_name', NEW.email),
    COALESCE((NEW.raw_user_meta_data->>'role')::user_role, 'worker')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger it on every new auth.users insert
CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Drop the old insert policy since the trigger handles it now
DROP POLICY IF EXISTS "users_insert_own" ON users;
