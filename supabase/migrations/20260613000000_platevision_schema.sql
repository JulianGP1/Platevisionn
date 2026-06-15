/*
# PlateVision — Esquema SaaS completo (schema: platevision)

## Descripcion general
Este archivo documenta el esquema `platevision` tal como existe en Supabase.
Todos los objetos viven en el schema `platevision`, separado del schema `public`.
La estructura es multi-tenant: cada recurso pertenece a un Proyecto, y cada
Proyecto tiene Miembros con roles distintos.

## 1. Schema
- `platevision` — schema propietario de todas las tablas del sistema.

## 2. Tablas

### platevision.profiles
Perfil de usuario vinculado a `auth.users`.
- `id`          uuid PK, FK → auth.users(id) ON DELETE CASCADE
- `full_name`   text, nombre completo
- `correo`      text, email del usuario
- `created_at`  timestamptz, default now()

### platevision.proyectos
Unidad organizativa principal (un cliente = un proyecto).
- `id_proyecto`      uuid PK, default gen_random_uuid()
- `nombre_proyecto`  varchar, nombre del proyecto
- `plan_id`          varchar, default 'free'
- `created_at`       timestamptz, default now()
- `creado_por`       uuid nullable, FK → platevision.profiles(id)

### platevision.miembros_proyecto
Asociacion de usuarios a proyectos con un rol.
- `id_miembro`   uuid PK, default gen_random_uuid()
- `id_proyecto`  uuid nullable, FK → platevision.proyectos(id_proyecto)
- `id_usuario`   uuid nullable, FK → platevision.profiles(id)
- `rol`          varchar, default 'GUARDIA' — valores: ADMIN, GUARDIA
- `created_at`   timestamptz, default now()

### platevision.camara
Camaras LPR registradas por proyecto.
- `id_camara`    serial PK (int4)
- `id_proyecto`  uuid nullable, FK → platevision.proyectos(id_proyecto)
- `nombre`       varchar nullable
- `ip`           varchar nullable
- `funcion`      varchar nullable, default 'ENTRADA' — valores: ENTRADA, SALIDA
- `estado`       char(1) nullable, default 'A' — A=activa, I=inactiva

### platevision.vehiculos
Vehiculos registrados (lista blanca por proyecto).
- `id_carro`     serial PK (int4)
- `id_proyecto`  uuid nullable, FK → platevision.proyectos(id_proyecto)
- `placa`        varchar NOT NULL
- `dueno`        varchar nullable

### platevision.registros_estadia
Registro de cada evento de entrada/salida detectado por LPR.
- `id_registro`       serial PK (int4)
- `id_proyecto`       uuid nullable, FK → platevision.proyectos(id_proyecto)
- `id_vehiculo`       int4 nullable, FK → platevision.vehiculos(id_carro)
- `placa_capturada`   varchar NOT NULL
- `id_camara_entrada` int4 nullable, FK → platevision.camara(id_camara)
- `fecha_ingreso`     timestamptz nullable, default now()
- `foto_entrada_url`  text nullable
- `id_camara_salida`  int4 nullable, FK → platevision.camara(id_camara)
- `fecha_salida`      timestamptz nullable
- `foto_salida_url`   text nullable
- `estado`            varchar nullable, default 'adentro' — valores: adentro, afuera

### platevision.lista_negra
Vehiculos bloqueados temporal o permanentemente.
- `id_lista`     serial PK (int4)
- `id_proyecto`  uuid nullable, FK → platevision.proyectos(id_proyecto)
- `id_vehiculo`  int4 nullable, FK → platevision.vehiculos(id_carro)
- `causa`        varchar nullable
- `fecha_inicio` date nullable, default CURRENT_DATE
- `fecha_fin`    date nullable — null = bloqueo indefinido

## 3. Seguridad
RLS habilitado en todas las tablas. Politicas multi-tenant: acceso restringido
a miembros del proyecto. Solo el creador del proyecto puede gestionar camaras,
lista negra y eliminar registros.

## 4. Notas
- Este archivo es referencia documental del estado actual de Supabase.
- El esquema ya fue aplicado directamente en Supabase.
- El SQL es idempotente (IF NOT EXISTS / DROP POLICY IF EXISTS).
*/

-- ─── Schema ───────────────────────────────────────────────────────────────────
CREATE SCHEMA IF NOT EXISTS platevision;

-- ─── profiles ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS platevision.profiles (
  id          uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name   text,
  correo      text,
  created_at  timestamptz DEFAULT now()
);

ALTER TABLE platevision.profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "profiles_select_own" ON platevision.profiles;
CREATE POLICY "profiles_select_own" ON platevision.profiles FOR SELECT
  TO authenticated USING (auth.uid() = id);

DROP POLICY IF EXISTS "profiles_insert_own" ON platevision.profiles;
CREATE POLICY "profiles_insert_own" ON platevision.profiles FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "profiles_update_own" ON platevision.profiles;
CREATE POLICY "profiles_update_own" ON platevision.profiles FOR UPDATE
  TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "profiles_delete_own" ON platevision.profiles;
CREATE POLICY "profiles_delete_own" ON platevision.profiles FOR DELETE
  TO authenticated USING (auth.uid() = id);

-- ─── proyectos ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS platevision.proyectos (
  id_proyecto     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre_proyecto varchar NOT NULL,
  plan_id         varchar DEFAULT 'free',
  created_at      timestamptz DEFAULT now(),
  creado_por      uuid REFERENCES platevision.profiles(id)
);

ALTER TABLE platevision.proyectos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "proyectos_select_member" ON platevision.proyectos;
CREATE POLICY "proyectos_select_member" ON platevision.proyectos FOR SELECT
  TO authenticated USING (
    creado_por = auth.uid()
    OR EXISTS (
      SELECT 1 FROM platevision.miembros_proyecto m
      WHERE m.id_proyecto = id_proyecto AND m.id_usuario = auth.uid()
    )
  );

DROP POLICY IF EXISTS "proyectos_insert_own" ON platevision.proyectos;
CREATE POLICY "proyectos_insert_own" ON platevision.proyectos FOR INSERT
  TO authenticated WITH CHECK (creado_por = auth.uid());

DROP POLICY IF EXISTS "proyectos_update_admin" ON platevision.proyectos;
CREATE POLICY "proyectos_update_admin" ON platevision.proyectos FOR UPDATE
  TO authenticated USING (creado_por = auth.uid()) WITH CHECK (creado_por = auth.uid());

DROP POLICY IF EXISTS "proyectos_delete_admin" ON platevision.proyectos;
CREATE POLICY "proyectos_delete_admin" ON platevision.proyectos FOR DELETE
  TO authenticated USING (creado_por = auth.uid());

-- ─── miembros_proyecto ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS platevision.miembros_proyecto (
  id_miembro  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  id_proyecto uuid REFERENCES platevision.proyectos(id_proyecto) ON DELETE CASCADE,
  id_usuario  uuid REFERENCES platevision.profiles(id) ON DELETE CASCADE,
  rol         varchar NOT NULL DEFAULT 'GUARDIA',
  created_at  timestamptz DEFAULT now()
);

ALTER TABLE platevision.miembros_proyecto ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "miembros_select_member" ON platevision.miembros_proyecto;
CREATE POLICY "miembros_select_member" ON platevision.miembros_proyecto FOR SELECT
  TO authenticated USING (
    EXISTS (
      SELECT 1 FROM platevision.miembros_proyecto m2
      WHERE m2.id_proyecto = id_proyecto AND m2.id_usuario = auth.uid()
    )
  );

DROP POLICY IF EXISTS "miembros_insert_admin" ON platevision.miembros_proyecto;
CREATE POLICY "miembros_insert_admin" ON platevision.miembros_proyecto FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (
      SELECT 1 FROM platevision.proyectos p
      WHERE p.id_proyecto = id_proyecto AND p.creado_por = auth.uid()
    )
  );

DROP POLICY IF EXISTS "miembros_update_admin" ON platevision.miembros_proyecto;
CREATE POLICY "miembros_update_admin" ON platevision.miembros_proyecto FOR UPDATE
  TO authenticated USING (
    EXISTS (
      SELECT 1 FROM platevision.proyectos p
      WHERE p.id_proyecto = id_proyecto AND p.creado_por = auth.uid()
    )
  );

DROP POLICY IF EXISTS "miembros_delete_admin" ON platevision.miembros_proyecto;
CREATE POLICY "miembros_delete_admin" ON platevision.miembros_proyecto FOR DELETE
  TO authenticated USING (
    EXISTS (
      SELECT 1 FROM platevision.proyectos p
      WHERE p.id_proyecto = id_proyecto AND p.creado_por = auth.uid()
    )
  );

-- ─── camara ───────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS platevision.camara (
  id_camara   serial PRIMARY KEY,
  id_proyecto uuid REFERENCES platevision.proyectos(id_proyecto) ON DELETE CASCADE,
  nombre      varchar,
  ip          varchar,
  funcion     varchar DEFAULT 'ENTRADA',
  estado      char(1) DEFAULT 'A'
);

ALTER TABLE platevision.camara ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "camara_select_member" ON platevision.camara;
CREATE POLICY "camara_select_member" ON platevision.camara FOR SELECT
  TO authenticated USING (
    EXISTS (
      SELECT 1 FROM platevision.miembros_proyecto m
      WHERE m.id_proyecto = id_proyecto AND m.id_usuario = auth.uid()
    )
  );

DROP POLICY IF EXISTS "camara_insert_admin" ON platevision.camara;
CREATE POLICY "camara_insert_admin" ON platevision.camara FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (
      SELECT 1 FROM platevision.proyectos p
      WHERE p.id_proyecto = id_proyecto AND p.creado_por = auth.uid()
    )
  );

DROP POLICY IF EXISTS "camara_update_admin" ON platevision.camara;
CREATE POLICY "camara_update_admin" ON platevision.camara FOR UPDATE
  TO authenticated USING (
    EXISTS (
      SELECT 1 FROM platevision.proyectos p
      WHERE p.id_proyecto = id_proyecto AND p.creado_por = auth.uid()
    )
  );

DROP POLICY IF EXISTS "camara_delete_admin" ON platevision.camara;
CREATE POLICY "camara_delete_admin" ON platevision.camara FOR DELETE
  TO authenticated USING (
    EXISTS (
      SELECT 1 FROM platevision.proyectos p
      WHERE p.id_proyecto = id_proyecto AND p.creado_por = auth.uid()
    )
  );

-- ─── vehiculos ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS platevision.vehiculos (
  id_carro    serial PRIMARY KEY,
  id_proyecto uuid REFERENCES platevision.proyectos(id_proyecto) ON DELETE CASCADE,
  placa       varchar NOT NULL,
  dueno       varchar
);

ALTER TABLE platevision.vehiculos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "vehiculos_select_member" ON platevision.vehiculos;
CREATE POLICY "vehiculos_select_member" ON platevision.vehiculos FOR SELECT
  TO authenticated USING (
    EXISTS (
      SELECT 1 FROM platevision.miembros_proyecto m
      WHERE m.id_proyecto = id_proyecto AND m.id_usuario = auth.uid()
    )
  );

DROP POLICY IF EXISTS "vehiculos_insert_member" ON platevision.vehiculos;
CREATE POLICY "vehiculos_insert_member" ON platevision.vehiculos FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (
      SELECT 1 FROM platevision.miembros_proyecto m
      WHERE m.id_proyecto = id_proyecto AND m.id_usuario = auth.uid()
    )
  );

DROP POLICY IF EXISTS "vehiculos_update_member" ON platevision.vehiculos;
CREATE POLICY "vehiculos_update_member" ON platevision.vehiculos FOR UPDATE
  TO authenticated USING (
    EXISTS (
      SELECT 1 FROM platevision.miembros_proyecto m
      WHERE m.id_proyecto = id_proyecto AND m.id_usuario = auth.uid()
    )
  );

DROP POLICY IF EXISTS "vehiculos_delete_admin" ON platevision.vehiculos;
CREATE POLICY "vehiculos_delete_admin" ON platevision.vehiculos FOR DELETE
  TO authenticated USING (
    EXISTS (
      SELECT 1 FROM platevision.proyectos p
      WHERE p.id_proyecto = id_proyecto AND p.creado_por = auth.uid()
    )
  );

-- ─── registros_estadia ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS platevision.registros_estadia (
  id_registro       serial PRIMARY KEY,
  id_proyecto       uuid REFERENCES platevision.proyectos(id_proyecto) ON DELETE CASCADE,
  id_vehiculo       int4 REFERENCES platevision.vehiculos(id_carro),
  placa_capturada   varchar NOT NULL,
  id_camara_entrada int4 REFERENCES platevision.camara(id_camara),
  fecha_ingreso     timestamptz DEFAULT now(),
  foto_entrada_url  text,
  id_camara_salida  int4 REFERENCES platevision.camara(id_camara),
  fecha_salida      timestamptz,
  foto_salida_url   text,
  estado            varchar DEFAULT 'adentro'
);

ALTER TABLE platevision.registros_estadia ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "registros_select_member" ON platevision.registros_estadia;
CREATE POLICY "registros_select_member" ON platevision.registros_estadia FOR SELECT
  TO authenticated USING (
    EXISTS (
      SELECT 1 FROM platevision.miembros_proyecto m
      WHERE m.id_proyecto = id_proyecto AND m.id_usuario = auth.uid()
    )
  );

DROP POLICY IF EXISTS "registros_insert_member" ON platevision.registros_estadia;
CREATE POLICY "registros_insert_member" ON platevision.registros_estadia FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (
      SELECT 1 FROM platevision.miembros_proyecto m
      WHERE m.id_proyecto = id_proyecto AND m.id_usuario = auth.uid()
    )
  );

DROP POLICY IF EXISTS "registros_update_member" ON platevision.registros_estadia;
CREATE POLICY "registros_update_member" ON platevision.registros_estadia FOR UPDATE
  TO authenticated USING (
    EXISTS (
      SELECT 1 FROM platevision.miembros_proyecto m
      WHERE m.id_proyecto = id_proyecto AND m.id_usuario = auth.uid()
    )
  );

DROP POLICY IF EXISTS "registros_delete_admin" ON platevision.registros_estadia;
CREATE POLICY "registros_delete_admin" ON platevision.registros_estadia FOR DELETE
  TO authenticated USING (
    EXISTS (
      SELECT 1 FROM platevision.proyectos p
      WHERE p.id_proyecto = id_proyecto AND p.creado_por = auth.uid()
    )
  );

-- ─── lista_negra ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS platevision.lista_negra (
  id_lista     serial PRIMARY KEY,
  id_proyecto  uuid REFERENCES platevision.proyectos(id_proyecto) ON DELETE CASCADE,
  id_vehiculo  int4 REFERENCES platevision.vehiculos(id_carro) ON DELETE CASCADE,
  causa        varchar,
  fecha_inicio date DEFAULT CURRENT_DATE,
  fecha_fin    date
);

ALTER TABLE platevision.lista_negra ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "lista_negra_select_member" ON platevision.lista_negra;
CREATE POLICY "lista_negra_select_member" ON platevision.lista_negra FOR SELECT
  TO authenticated USING (
    EXISTS (
      SELECT 1 FROM platevision.miembros_proyecto m
      WHERE m.id_proyecto = id_proyecto AND m.id_usuario = auth.uid()
    )
  );

DROP POLICY IF EXISTS "lista_negra_insert_admin" ON platevision.lista_negra;
CREATE POLICY "lista_negra_insert_admin" ON platevision.lista_negra FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (
      SELECT 1 FROM platevision.proyectos p
      WHERE p.id_proyecto = id_proyecto AND p.creado_por = auth.uid()
    )
  );

DROP POLICY IF EXISTS "lista_negra_update_admin" ON platevision.lista_negra;
CREATE POLICY "lista_negra_update_admin" ON platevision.lista_negra FOR UPDATE
  TO authenticated USING (
    EXISTS (
      SELECT 1 FROM platevision.proyectos p
      WHERE p.id_proyecto = id_proyecto AND p.creado_por = auth.uid()
    )
  );

DROP POLICY IF EXISTS "lista_negra_delete_admin" ON platevision.lista_negra;
CREATE POLICY "lista_negra_delete_admin" ON platevision.lista_negra FOR DELETE
  TO authenticated USING (
    EXISTS (
      SELECT 1 FROM platevision.proyectos p
      WHERE p.id_proyecto = id_proyecto AND p.creado_por = auth.uid()
    )
  );
