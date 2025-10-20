import asyncio
import os
from datetime import datetime, timedelta
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv

from database import db
from udp_server import start_udp_server, stop_udp_server
from models import (
    LocationResponse,
    AllLocationsResponse,
    HealthResponse,
    ErrorResponse,
    InternalErrorResponse
)
from typing import List, Dict

# Cargar variables de entorno
load_dotenv()

# Crear la aplicación FastAPI
app = FastAPI(
    title="Pantera Location API",
    description="API para recibir y consultar datos de ubicación de dispositivos.",
    version="3.0.0" # Version actualizada
)

# Configurar CORS (ajustado para mayor seguridad en producción)
origins = [
    "http://localhost",
    "http://localhost:3000",
    "http://localhost:5173", # Puerto común de Vite dev
    "https://panteratracker.tech", # Tu dominio de producción
    "http://panteratracker.tech"
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Variables globales para el servidor UDP
udp_transport = None
udp_protocol = None

@app.on_event("startup")
async def startup_event():
    """Eventos al iniciar la aplicación"""
    global udp_transport, udp_protocol
    try:
        await db.init_connection_pool()
        await db.create_table()
        udp_transport, udp_protocol = await start_udp_server()
        print(f"HTTP API escuchando en puerto {os.getenv('HTTP_PORT', 3001)}")
    except Exception as e:
        print(f"Error iniciando servidor: {e}")
        raise

@app.on_event("shutdown")
async def shutdown_event():
    """Eventos al cerrar la aplicación"""
    global udp_transport
    if udp_transport:
        await stop_udp_server(udp_transport)
    await db.close_connection_pool()

# --- NUEVO ENDPOINT ---
@app.get("/api/location/active_devices", response_model=Dict[str, LocationResponse], tags=["Location Data"])
async def get_active_devices_last_location(minutes: int = Query(default=60, ge=1, description="Considerar activos dispositivos que enviaron datos en los últimos X minutos")):
    """Obtiene la última ubicación de cada dispositivo activo recientemente."""
    try:
        # Calcula el timestamp límite (hace X minutos)
        time_threshold = int((datetime.utcnow() - timedelta(minutes=minutes)).timestamp() * 1000)

        # Consulta optimizada para obtener la última ubicación de cada device_id
        # dentro del umbral de tiempo. (Requiere asyncpg)
        query = """
        SELECT DISTINCT ON (device_id)
            latitude, longitude, timestamp_value, created_at, device_id
        FROM location_data
        WHERE device_id IS NOT NULL AND timestamp_value >= $1
        ORDER BY device_id, timestamp_value DESC;
        """
        async with db.pool.acquire() as connection:
            records = await connection.fetch(query, time_threshold)

        if not records:
            # En lugar de 404, devolvemos un diccionario vacío si no hay activos
            return {}

        # Convertir los registros en un diccionario device_id -> location_data
        active_devices_data = {
            record['device_id']: LocationResponse(**dict(record))
            for record in records
        }
        return active_devices_data

    except Exception as e:
        print(f"Error obteniendo dispositivos activos: {e}")
        raise HTTPException(status_code=500, detail="Error interno del servidor al obtener dispositivos activos")


@app.get("/api/location/device_history/{device_id}", response_model=list[AllLocationsResponse], tags=["Location Data"])
async def get_device_history(device_id: str, limit: int = Query(default=500, ge=1, le=5000)):
    """Obtiene el historial reciente de un dispositivo específico."""
    try:
        query = """
        SELECT * FROM location_data
        WHERE device_id = $1
        ORDER BY timestamp_value DESC
        LIMIT $2;
        """
        async with db.pool.acquire() as connection:
            records = await connection.fetch(query, device_id, limit)

        if not records:
             raise HTTPException(status_code=404, detail=f"No hay historial reciente para el dispositivo {device_id}.")

        # Convertimos a AllLocationsResponse y revertimos para orden cronológico
        return sorted([AllLocationsResponse(**dict(record)) for record in records], key=lambda x: x.timestamp_value)

    except HTTPException:
        raise
    except Exception as e:
        print(f"Error obteniendo historial para {device_id}: {e}")
        raise HTTPException(status_code=500, detail="Error interno del servidor al obtener historial.")


@app.get("/api/location/range", response_model=list[LocationResponse], tags=["Location Data"])
async def get_location_range(
    startDate: datetime = Query(..., description="Fecha de inicio en formato ISO 8601"),
    endDate: datetime = Query(..., description="Fecha de fin en formato ISO 8601"),
    deviceId: str = Query(None, description="Filtrar por ID de dispositivo (opcional)") # Añadimos deviceId opcional
):
    """Endpoint para obtener registros por rango de fechas, opcionalmente filtrado por dispositivo."""
    try:
        start_time = int(startDate.timestamp() * 1000)
        end_time = int(endDate.timestamp() * 1000)

        # Modificamos la consulta para incluir el filtro opcional
        if deviceId:
            query = """
            SELECT latitude, longitude, timestamp_value, created_at, device_id
            FROM location_data
            WHERE timestamp_value >= $1 AND timestamp_value <= $2 AND device_id = $3
            ORDER BY timestamp_value ASC;
            """
            async with db.pool.acquire() as connection:
                records = await connection.fetch(query, start_time, end_time, deviceId)
        else:
            # Consulta original si no se especifica deviceId
            query = """
            SELECT latitude, longitude, timestamp_value, created_at, device_id
            FROM location_data
            WHERE timestamp_value >= $1 AND timestamp_value <= $2
            ORDER BY timestamp_value ASC;
            """
            async with db.pool.acquire() as connection:
                records = await connection.fetch(query, start_time, end_time)

        return [LocationResponse(**dict(record)) for record in records]

    except Exception as e:
        print(f"Error obteniendo registros por rango: {e}")
        raise HTTPException(status_code=500, detail="Error interno del servidor")


# -- Endpoints antiguos (puedes mantenerlos o eliminarlos si ya no los usas) --
@app.get("/api/location/latest", response_model=LocationResponse, tags=["Legacy"])
async def get_latest_location_legacy():
    """(Legado) Obtiene la última ubicación registrada globalmente."""
    try:
        result = await db.get_latest_location()
        if not result:
            raise HTTPException(status_code=404, detail="No hay datos disponibles")
        return LocationResponse(**result)
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error obteniendo último registro (legado): {e}")
        raise HTTPException(status_code=500, detail="Error interno del servidor")

@app.get("/api/location/all", response_model=list[AllLocationsResponse], tags=["Legacy"])
async def get_all_locations_legacy(limit: int = Query(default=100, ge=1, le=1000)):
    """(Legado) Obtiene una lista de todas las ubicaciones recientes."""
    try:
        results = await db.get_all_locations(limit)
        return [AllLocationsResponse(**dict(record)) for result in results]
    except Exception as e:
        print(f"Error obteniendo registros (legado): {e}")
        raise HTTPException(status_code=500, detail="Error interno del servidor")
# --- Fin Endpoints Legados ---

@app.get("/api/health", response_model=HealthResponse, tags=["Status"])
async def health_check():
    """Verifica el estado de la API."""
    return HealthResponse(
        status="OK",
        timestamp=datetime.utcnow().isoformat()
    )

# --- Manejo de Errores ---
@app.exception_handler(HTTPException)
async def http_exception_handler(request, exc):
    from fastapi.responses import JSONResponse
    return JSONResponse(
        status_code=exc.status_code,
        content={"message": exc.detail},
    )

@app.exception_handler(Exception)
async def generic_exception_handler(request, exc):
    from fastapi.responses import JSONResponse
    print(f"Error inesperado: {exc}") # Loguear el error real
    return JSONResponse(
        status_code=500,
        content={"error": "Ocurrió un error inesperado en el servidor."},
    )

if __name__ == "__main__":
    import uvicorn
    http_port = int(os.getenv('HTTP_PORT', 3001))
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=http_port,
        reload=False, # Desactivar reload para producción
        log_level="info"
    )