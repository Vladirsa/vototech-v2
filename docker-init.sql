-- Se corre automáticamente la primera vez que se crea el contenedor
-- de la base de datos — activa las extensiones que las migraciones
-- de VotoTech necesitan (uuid_generate_v4, quitar acentos, etc.).
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "unaccent";
