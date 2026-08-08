-- ══════════════════════════════════════════════════════════════
-- FASE 11 — MEJORAS A PROMOVIDOS (CRM)
-- ══════════════════════════════════════════════════════════════
-- Permite que la búsqueda por nombre ignore acentos (ej: buscar
-- "Maria" también encuentra "María") — español real, no inglés.
CREATE EXTENSION IF NOT EXISTS unaccent;
