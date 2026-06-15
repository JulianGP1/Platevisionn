-- Add permisos column to miembros_proyecto
ALTER TABLE platevision.miembros_proyecto
ADD COLUMN IF NOT EXISTS permisos jsonb NOT NULL DEFAULT '{}';

-- Create invitaciones table
CREATE TABLE IF NOT EXISTS platevision.invitaciones (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  id_proyecto     uuid NOT NULL REFERENCES platevision.proyectos(id_proyecto) ON DELETE CASCADE,
  email_invitado  text NOT NULL,
  token           text NOT NULL,
  permisos        jsonb NOT NULL DEFAULT '{}',
  rol             varchar NOT NULL DEFAULT 'GUARDIA',
  estado          varchar NOT NULL DEFAULT 'pendiente',
  created_at      timestamptz DEFAULT now(),
  expires_at      timestamptz DEFAULT (now() + interval '7 days'),
  CONSTRAINT invitaciones_token_unique UNIQUE (token)
);

ALTER TABLE platevision.invitaciones ENABLE ROW LEVEL SECURITY;

-- Admin of the project can see all invitations for their project;
-- invited user can see their own invitation by matching email in JWT
DROP POLICY IF EXISTS "invitaciones_select" ON platevision.invitaciones;
CREATE POLICY "invitaciones_select" ON platevision.invitaciones FOR SELECT
  TO authenticated USING (
    EXISTS (
      SELECT 1 FROM platevision.proyectos p
      WHERE p.id_proyecto = id_proyecto AND p.creado_por = auth.uid()
    )
    OR email_invitado = (auth.jwt() ->> 'email')
  );

-- Only project creator can insert invitations
DROP POLICY IF EXISTS "invitaciones_insert" ON platevision.invitaciones;
CREATE POLICY "invitaciones_insert" ON platevision.invitaciones FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (
      SELECT 1 FROM platevision.proyectos p
      WHERE p.id_proyecto = id_proyecto AND p.creado_por = auth.uid()
    )
  );

-- Only project creator can delete invitations
DROP POLICY IF EXISTS "invitaciones_delete" ON platevision.invitaciones;
CREATE POLICY "invitaciones_delete" ON platevision.invitaciones FOR DELETE
  TO authenticated USING (
    EXISTS (
      SELECT 1 FROM platevision.proyectos p
      WHERE p.id_proyecto = id_proyecto AND p.creado_por = auth.uid()
    )
  );

-- Invited user can update estado to mark as used (only their own invitation)
DROP POLICY IF EXISTS "invitaciones_update" ON platevision.invitaciones;
CREATE POLICY "invitaciones_update" ON platevision.invitaciones FOR UPDATE
  TO authenticated
  USING (email_invitado = (auth.jwt() ->> 'email'))
  WITH CHECK (email_invitado = (auth.jwt() ->> 'email'));
