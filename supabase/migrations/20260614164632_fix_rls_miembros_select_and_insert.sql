-- Fix 1: miembros_proyecto SELECT — the old policy was self-referential (recursive),
-- meaning a user with no memberships could never read their own rows.
-- Use direct id_usuario = auth.uid() so every user can always see their own memberships.
DROP POLICY IF EXISTS "miembros_select_member" ON platevision.miembros_proyecto;
CREATE POLICY "miembros_select_member" ON platevision.miembros_proyecto FOR SELECT
  TO authenticated USING (
    id_usuario = auth.uid()
    OR EXISTS (
      SELECT 1 FROM platevision.proyectos p
      WHERE p.id_proyecto = id_proyecto AND p.creado_por = auth.uid()
    )
  );

-- Fix 2: miembros_proyecto INSERT — the old policy only allowed project creators
-- to insert, so invited users (GUARDIA role) could never accept an invitation.
-- Allow an authenticated user to insert their own membership row when a valid
-- pending invitation exists for their email on that project.
DROP POLICY IF EXISTS "miembros_insert_admin" ON platevision.miembros_proyecto;
CREATE POLICY "miembros_insert_admin" ON platevision.miembros_proyecto FOR INSERT
  TO authenticated WITH CHECK (
    -- Project creator can always add members
    EXISTS (
      SELECT 1 FROM platevision.proyectos p
      WHERE p.id_proyecto = id_proyecto AND p.creado_por = auth.uid()
    )
    OR
    -- Invited user can add themselves when a valid pending invitation exists
    (
      id_usuario = auth.uid()
      AND EXISTS (
        SELECT 1 FROM platevision.invitaciones inv
        WHERE inv.id_proyecto = id_proyecto
          AND inv.email_invitado = (auth.jwt() ->> 'email')
          AND inv.estado = 'pendiente'
      )
    )
  );

-- Fix 3: profiles SELECT — MiembrosSection joins profiles to get member names/emails.
-- The old policy only allowed reading your own profile, so member names showed blank.
-- Allow reading profiles of users who share at least one project.
DROP POLICY IF EXISTS "profiles_select_own" ON platevision.profiles;
CREATE POLICY "profiles_select_own" ON platevision.profiles FOR SELECT
  TO authenticated USING (
    auth.uid() = id
    OR EXISTS (
      SELECT 1
      FROM platevision.miembros_proyecto m1
      JOIN platevision.miembros_proyecto m2 ON m1.id_proyecto = m2.id_proyecto
      WHERE m1.id_usuario = auth.uid() AND m2.id_usuario = id
    )
  );
