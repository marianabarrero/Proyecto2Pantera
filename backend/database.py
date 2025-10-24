import asyncpg
import os
import json
from dotenv import load_dotenv


load_dotenv()

class Database:
    def __init__(self):
        self.pool = None

    async def init_connection_pool(self):
        """Inicializa el pool de conexiones"""
        self.pool = await asyncpg.create_pool(
            host=os.getenv('DB_HOST'),
            port=int(os.getenv('DB_PORT', 5432)),
            database=os.getenv('DB_NAME'),
            user=os.getenv('DB_USER'),
            password=os.getenv('DB_PASSWORD'),
            ssl='require'
        )
        print("Pool de conexiones PostgreSQL inicializado")

    async def close_connection_pool(self):
        """Cierra el pool de conexiones"""
        if self.pool:
            await self.pool.close()
            print("Pool de conexiones cerrado")

    async def create_table(self):
        """Crea la tabla si no existe y añade la columna device_id si no existe"""
        async with self.pool.acquire() as connection:
            # Crear la tabla si no existe
            await connection.execute("""
                CREATE TABLE IF NOT EXISTS location_data (
                    id SERIAL PRIMARY KEY,
                    latitude DECIMAL(10, 8) NOT NULL,
                    longitude DECIMAL(11, 8) NOT NULL,
                    timestamp_value BIGINT NOT NULL,
                    accuracy DECIMAL(8, 2),
                    altitude DECIMAL(8, 2),
                    speed DECIMAL(8, 2),
                    provider VARCHAR(50),
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                );
            """)

            # Verificar y añadir la columna device_id si no existe
            await connection.execute("""
                ALTER TABLE location_data
                ADD COLUMN IF NOT EXISTS device_id VARCHAR(255);
            """)
            print("Tabla location_data verificada/creada y actualizada con device_id")

    async def insert_location(self, data):
        """Inserta una nueva ubicación"""
        query = """
        INSERT INTO location_data
        (latitude, longitude, timestamp_value, accuracy, altitude, speed, provider, device_id)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING id;
        """

        values = [
            data.get('lat'),
            data.get('lon'),
            data.get('time'),
            data.get('acc'),
            data.get('alt'),
            data.get('spd'),
            data.get('prov'),
            data.get('deviceId')
        ]

        async with self.pool.acquire() as connection:
            record = await connection.fetchrow(query, *values)
            return record['id']

    async def get_latest_location(self, device_id=None):
        """Obtiene la última ubicación, opcionalmente filtrada por device_id"""
        if device_id:
            query = """
            SELECT latitude, longitude, timestamp_value, created_at, device_id
            FROM location_data
            WHERE device_id = $1
            ORDER BY id DESC
            LIMIT 1;
            """
            async with self.pool.acquire() as connection:
                record = await connection.fetchrow(query, device_id)
                return dict(record) if record else None
        else:
            query = """
            SELECT latitude, longitude, timestamp_value, created_at, device_id
            FROM location_data
            ORDER BY id DESC
            LIMIT 1;
            """
            async with self.pool.acquire() as connection:
                record = await connection.fetchrow(query)
                return dict(record) if record else None

    async def get_latest_location_by_devices(self):
        """Obtiene la última ubicación de cada dispositivo único"""
        query = """
        SELECT DISTINCT ON (device_id) 
            latitude, longitude, timestamp_value, created_at, device_id
        FROM location_data
        WHERE device_id IS NOT NULL
        ORDER BY device_id, id DESC;
        """
        
        async with self.pool.acquire() as connection:
            records = await connection.fetch(query)
            return [dict(record) for record in records]

    async def get_all_locations(self, limit=100, device_id=None):
        """Obtiene todas las ubicaciones con límite, opcionalmente filtradas por device_id"""
        if device_id:
            query = """
            SELECT * FROM location_data
            WHERE device_id = $1
            ORDER BY id DESC
            LIMIT $2;
            """
            async with self.pool.acquire() as connection:
                records = await connection.fetch(query, device_id, limit)
                return [dict(record) for record in records]
        else:
            query = """
            SELECT * FROM location_data
            ORDER BY id DESC
            LIMIT $1;
            """
            async with self.pool.acquire() as connection:
                records = await connection.fetch(query, limit)
                return [dict(record) for record in records]

    async def get_locations_by_range(self, start_time, end_time, device_id=None):
        """Obtiene ubicaciones por rango de fechas, opcionalmente filtradas por device_id"""
        if device_id:
            query = """
            SELECT latitude, longitude, timestamp_value, created_at, device_id
            FROM location_data
            WHERE timestamp_value >= $1 AND timestamp_value <= $2 AND device_id = $3
            ORDER BY timestamp_value ASC;
            """
            async with self.pool.acquire() as connection:
                records = await connection.fetch(query, start_time, end_time, device_id)
                return [dict(record) for record in records]
        else:
            query = """
            SELECT latitude, longitude, timestamp_value, created_at, device_id
            FROM location_data
            WHERE timestamp_value >= $1 AND timestamp_value <= $2
            ORDER BY timestamp_value ASC;
            """
            async with self.pool.acquire() as connection:
                records = await connection.fetch(query, start_time, end_time)
                return [dict(record) for record in records]

    async def get_all_device_ids(self):
        """Obtiene todos los device_id únicos disponibles"""
        query = """
        SELECT DISTINCT device_id
        FROM location_data
        WHERE device_id IS NOT NULL
        ORDER BY device_id;
        """
        async with self.pool.acquire() as connection:
            records = await connection.fetch(query)
            return [record['device_id'] for record in records]

    async def get_locations_in_area(self, min_lat, max_lat, min_lng, max_lng, device_id):
        """Obtiene ubicaciones de un dispositivo dentro de un área rectangular"""
        query = """
        SELECT latitude, longitude, timestamp_value, created_at, device_id
        FROM location_data
        WHERE device_id = $1
        AND latitude BETWEEN $2 AND $3
        AND longitude BETWEEN $4 AND $5
        ORDER BY timestamp_value ASC;
        """
        
        async with self.pool.acquire() as connection:
            records = await connection.fetch(query, device_id, min_lat, max_lat, min_lng, max_lng)
            return [dict(record) for record in records]
        
            # ==================== GEOFENCES ====================
    
    async def create_geofence(self, geofence_data: dict, journeys: list = None):
        """Crea una nueva geocerca y opcionalmente guarda sus journeys"""
        async with self.pool.acquire() as connection:
            async with connection.transaction():
                # Insertar geocerca
                query = """
                INSERT INTO geofences (name, description, min_lat, max_lat, min_lng, max_lng, device_ids, created_by)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                RETURNING id, name, description, min_lat, max_lat, min_lng, max_lng, device_ids, created_by, created_at, updated_at, is_active;
                """
                record = await connection.fetchrow(
                    query,
                    geofence_data['name'],
                    geofence_data.get('description'),
                    geofence_data['min_lat'],
                    geofence_data['max_lat'],
                    geofence_data['min_lng'],
                    geofence_data['max_lng'],
                    geofence_data['device_ids'],
                    geofence_data.get('created_by')
                )
                
                geofence_id = record['id']
                
                # Si hay journeys, insertarlos
                if journeys:
                    journey_query = """
                    INSERT INTO geofence_journeys (geofence_id, device_id, start_time, end_time, points)
                    VALUES ($1, $2, $3, $4, $5);
                    """
                    for journey in journeys:
                        await connection.execute(
                            journey_query,
                            geofence_id,
                            journey['device_id'],
                            journey['start_time'],
                            journey['end_time'],
                            json.dumps(journey['points'])
                        )
                
                result = dict(record)
                result['journey_count'] = len(journeys) if journeys else 0
                return result

    async def get_all_geofences(self, created_by: str = None, is_active: bool = None):
        """Obtiene todas las geocercas"""
        conditions = []
        params = []
        param_count = 1
        
        if created_by:
            conditions.append(f"created_by = ${param_count}")
            params.append(created_by)
            param_count += 1
            
        if is_active is not None:
            conditions.append(f"is_active = ${param_count}")
            params.append(is_active)
            param_count += 1
        
        where_clause = f"WHERE {' AND '.join(conditions)}" if conditions else ""
        
        query = f"""
        SELECT g.*, 
               (SELECT COUNT(*) FROM geofence_journeys WHERE geofence_id = g.id) as journey_count
        FROM geofences g
        {where_clause}
        ORDER BY g.created_at DESC;
        """
        
        async with self.pool.acquire() as connection:
            records = await connection.fetch(query, *params)
            return [dict(record) for record in records]

    async def get_geofence_by_id(self, geofence_id: int):
        """Obtiene una geocerca por ID con sus journeys"""
        async with self.pool.acquire() as connection:
            # Obtener geocerca
            geofence_query = """
            SELECT * FROM geofences WHERE id = $1;
            """
            geofence = await connection.fetchrow(geofence_query, geofence_id)
            
            if not geofence:
                return None
            
            # Obtener journeys
            journeys_query = """
            SELECT device_id, start_time, end_time, points
            FROM geofence_journeys
            WHERE geofence_id = $1
            ORDER BY start_time;
            """
            journeys = await connection.fetch(journeys_query, geofence_id)
            
            result = dict(geofence)
            result['journeys'] = [
                {
                    'device_id': j['device_id'],
                    'start_time': j['start_time'],
                    'end_time': j['end_time'],
                    'points': json.loads(j['points']) if isinstance(j['points'], str) else j['points']
                }
                for j in journeys
            ]
            
            return result

    async def update_geofence(self, geofence_id: int, update_data: dict):
        """Actualiza una geocerca"""
        query = """
        UPDATE geofences
        SET name = COALESCE($1, name),
            description = COALESCE($2, description),
            min_lat = COALESCE($3, min_lat),
            max_lat = COALESCE($4, max_lat),
            min_lng = COALESCE($5, min_lng),
            max_lng = COALESCE($6, max_lng),
            device_ids = COALESCE($7, device_ids),
            is_active = COALESCE($8, is_active),
            updated_at = CURRENT_TIMESTAMP
        WHERE id = $9
        RETURNING *;
        """
        
        async with self.pool.acquire() as connection:
            record = await connection.fetchrow(
                query,
                update_data.get('name'),
                update_data.get('description'),
                update_data.get('min_lat'),
                update_data.get('max_lat'),
                update_data.get('min_lng'),
                update_data.get('max_lng'),
                update_data.get('device_ids'),
                update_data.get('is_active'),
                geofence_id
            )
            return dict(record) if record else None

    async def delete_geofence(self, geofence_id: int):
        """Elimina una geocerca permanentemente (hard delete)"""
        query = """
        DELETE FROM geofences
        WHERE id = $1
        RETURNING id;
        """
        async with self.pool.acquire() as connection:
            result = await connection.fetchrow(query, geofence_id)
            return result is not None

db = Database()