-- Ejecutar como el propietario administrativo de noise_analytics.
-- Requiere que init_noise_app_roles.sh haya creado ambos roles de aplicación.

BEGIN;

SELECT format('REVOKE ALL ON DATABASE %I FROM PUBLIC', current_database())
\gexec
SELECT format(
    'GRANT CONNECT ON DATABASE %I TO noise_writer, dashboard_reader',
    current_database()
)
\gexec

REVOKE ALL ON SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO noise_writer, dashboard_reader;

REVOKE ALL ON ALL TABLES IN SCHEMA public
    FROM PUBLIC, noise_writer, dashboard_reader;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public
    FROM PUBLIC, noise_writer, dashboard_reader;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public
    FROM PUBLIC, noise_writer, dashboard_reader;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE stations TO noise_writer;
GRANT SELECT, INSERT ON TABLE acoustic_measurements TO noise_writer;
GRANT SELECT, INSERT, UPDATE ON TABLE hourly_aggregations TO noise_writer;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO noise_writer;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO noise_writer;

GRANT SELECT ON ALL TABLES IN SCHEMA public TO dashboard_reader;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
    REVOKE ALL ON TABLES FROM PUBLIC, noise_writer, dashboard_reader;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
    REVOKE ALL ON SEQUENCES FROM PUBLIC, noise_writer, dashboard_reader;
ALTER DEFAULT PRIVILEGES
    REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
    REVOKE ALL ON FUNCTIONS FROM noise_writer, dashboard_reader;

COMMIT;
