import asyncpg
import os
from dotenv import load_dotenv

# Cargar variables de entorno
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
        """Crea la tabla si no existe"""
        query = """
        CREATE TABLE IF NOT EXISTS location_data (
            id SERIAL PRIMARY KEY,
            user_id VARCHAR(50) NOT NULL,
            latitude DECIMAL(10, 8) NOT NULL,
            longitude DECIMAL(11, 8) NOT NULL,
            timestamp_value BIGINT NOT NULL,
            accuracy DECIMAL(8, 2),
            altitude DECIMAL(8, 2),
            speed DECIMAL(8, 2),
            provider VARCHAR(50),
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
        """
        
        async with self.pool.acquire() as connection:
            await connection.execute(query)
            print("Tabla location_data verificada/creada")
            
    async def insert_location(self, data):
        """Inserta una nueva ubicación"""
        query = """
        INSERT INTO location_data
        (user_id, latitude, longitude, timestamp_value, accuracy, altitude, speed, provider)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING id;
        """
        
        values = [
            data.get('user_id'),
            data.get('lat'),
            data.get('lon'),
            data.get('time'),
            data.get('acc'),
            data.get('alt'),
            data.get('spd'),
            data.get('prov')
        ]
        
        async with self.pool.acquire() as connection:
            record = await connection.fetchrow(query, *values)
            return record['id']
            
    async def get_latest_location(self, user_id: str):
        """Obtiene la última ubicación de un usuario específico"""
        query = """
        SELECT latitude, longitude, timestamp_value, created_at
        FROM location_data
        WHERE user_id = $1
        ORDER BY id DESC
        LIMIT 1;
        """
        
        async with self.pool.acquire() as connection:
            record = await connection.fetchrow(query, user_id)
            return dict(record) if record else None
            
    async def get_all_locations(self, limit=100):
        """Obtiene todas las ubicaciones con límite"""
        query = """
        SELECT * FROM location_data
        ORDER BY id DESC
        LIMIT $1;
        """
        
        async with self.pool.acquire() as connection:
            records = await connection.fetch(query, limit)
            return [dict(record) for record in records]

    async def get_locations_by_range(self, user_id: str, start_time, end_time):
        """Obtiene ubicaciones por rango de fechas"""

        # Se añade created_at a la consulta para evitar el error de validación
        query = """
        SELECT latitude, longitude, timestamp_value, created_at
        FROM location_data
        WHERE user_id = $1 AND timestamp_value >= $2 AND timestamp_value <= $3 -- Filtra por user_id
        ORDER BY timestamp_value ASC;
        """
        
        async with self.pool.acquire() as connection:
            records = await connection.fetch(query, user_id, start_time, end_time)
            return [dict(record) for record in records]

# Instancia global de la base de datos
db = Database()