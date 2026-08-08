-- =============================================================================
-- init_super_admin.sql
-- Base de datos: station_registry
-- Descripción: Crea el primer super-administrador del sistema.
--
-- INSTRUCCIONES:
--   1. Generar un hash BCrypt del password deseado con Python:
--
--      python3 -c "
--      import bcrypt, getpass
--      pwd = getpass.getpass('Password: ').encode()
--      print(bcrypt.hashpw(pwd, bcrypt.gensalt(rounds=12)).decode())
--      "
--      (requiere: pip install bcrypt)
--
--   2. Reemplazar los valores entre < > con los valores reales.
--
--   3. Ejecutar UNA SOLA VEZ:
--      psql -U auth_user -d station_registry -f init_super_admin.sql
--
--   4. Verificar:
--      psql -U auth_user -d station_registry \
--        -c "SELECT id, username, is_super, is_active, created_at FROM admin_users;"
--
-- IMPORTANTE:
--   - Este script falla silenciosamente si ya existe un admin con ese username
--     gracias al ON CONFLICT DO NOTHING.
--   - Nunca hay un endpoint público para crear super-admins.
--   - El password en texto plano nunca se almacena ni se loguea.
-- =============================================================================

INSERT INTO admin_users (username, password_hash, is_super, is_active)
VALUES (
    'GIIRAdmin',       -- Ej: 'admin'
    '$2b$12$h7ye09RZ/obqDvBcvi6WBO7G4vHS.7PK/kW7JO5cFJAJEuuIoApyK',    -- Hash generado con el comando Python de arriba
    TRUE,               -- is_super = TRUE solo para este primer admin
    TRUE
)
ON CONFLICT (username) DO NOTHING;
