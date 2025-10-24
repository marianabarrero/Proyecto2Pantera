-- Tabla para almacenar geocercas
CREATE TABLE IF NOT EXISTS geofences (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    min_lat DOUBLE PRECISION NOT NULL,
    max_lat DOUBLE PRECISION NOT NULL,
    min_lng DOUBLE PRECISION NOT NULL,
    max_lng DOUBLE PRECISION NOT NULL,
    device_ids TEXT[] NOT NULL,
    created_by VARCHAR(100),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    is_active BOOLEAN DEFAULT TRUE
);

-- Tabla para almacenar los journeys asociados a cada geocerca
CREATE TABLE IF NOT EXISTS geofence_journeys (
    id SERIAL PRIMARY KEY,
    geofence_id INTEGER REFERENCES geofences(id) ON DELETE CASCADE,
    device_id VARCHAR(100) NOT NULL,
    start_time BIGINT NOT NULL,
    end_time BIGINT NOT NULL,
    points JSONB NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Índices para mejorar el rendimiento
CREATE INDEX IF NOT EXISTS idx_geofences_created_by ON geofences(created_by);
CREATE INDEX IF NOT EXISTS idx_geofences_is_active ON geofences(is_active);
CREATE INDEX IF NOT EXISTS idx_geofence_journeys_geofence_id ON geofence_journeys(geofence_id);
CREATE INDEX IF NOT EXISTS idx_geofence_journeys_device_id ON geofence_journeys(device_id);