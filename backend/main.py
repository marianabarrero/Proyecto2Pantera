import asyncio
import os
import json
from datetime import datetime
from typing import Optional, List
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
from pydantic import BaseModel

from database import Database
from udp_server import start_udp_server, stop_udp_server
from webrtc_server import start_webrtc_server
from models import (
    LocationData, LocationResponse, AllLocationsResponse, 
    HealthResponse, ErrorResponse, InternalErrorResponse,
    GeofenceCreate, GeofenceResponse, GeofenceJourney, GeofenceWithJourneys
)

# Cargar variables de entorno
load_dotenv()

# Inicializar base de datos
db = Database()

# Modelo para el request de guardar geocerca
class GeofenceSaveRequest(BaseModel):
    """Request para guardar geocerca con journeys"""
    geofence: GeofenceCreate
    journeys: Optional[List[GeofenceJourney]] = None

# Crear la aplicación FastAPI
app = FastAPI(
    title="Location Tracker API",
    description="UDP receiver and API for location tracking",
    version="1.0.0"
)

# Configurar CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Variables globales para el servidor UDP
udp_transport = None
udp_protocol = None
webrtc_runner = None

@app.on_event("startup")
async def startup_event():
    """Eventos al iniciar la aplicación"""
    global udp_transport, udp_protocol, webrtc_runner

    try:
        await db.init_connection_pool()
        await db.create_table()
        udp_transport, udp_protocol = await start_udp_server(db)  # ✅ Pasa db aquí
        webrtc_runner = await start_webrtc_server(
            host='0.0.0.0',
            port=int(os.getenv('WEBRTC_PORT', 8080))
        )
        print(f"HTTP API escuchando en puerto {os.getenv('HTTP_PORT', 3001)}")
        print(f"WebRTC Server escuchando en puerto {os.getenv('WEBRTC_PORT', 8080)}")
    except Exception as e:
        print(f"Error iniciando servidor: {e}")
        raise

@app.on_event("shutdown")
async def shutdown_event():
    """Eventos al cerrar la aplicación"""
    global udp_transport, webrtc_runner
    if udp_transport:
        await stop_udp_server(udp_transport)
    if webrtc_runner:
        await webrtc_runner.cleanup()
    await db.close_connection_pool()

@app.get("/api/location/latest", response_model=LocationResponse)
async def get_latest_location(device_id: str = Query(None, description="ID del dispositivo (opcional)")):
    """Endpoint para obtener el último registro, opcionalmente filtrado por device_id"""
    try:
        result = await db.get_latest_location(device_id=device_id)
        if not result:
            raise HTTPException(status_code=404, detail="No hay datos disponibles")
        return LocationResponse(**result)
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error obteniendo último registro: {e}")
        raise HTTPException(status_code=500, detail="Error interno del servidor")

@app.get("/api/location/latest-by-devices", response_model=list[LocationResponse])
async def get_latest_by_devices():
    """Endpoint para obtener la última ubicación de CADA dispositivo"""
    try:
        results = await db.get_latest_location_by_devices()
        if not results:
            raise HTTPException(status_code=404, detail="No hay datos disponibles")
        return [LocationResponse(**result) for result in results]
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error obteniendo últimas ubicaciones por dispositivo: {e}")
        raise HTTPException(status_code=500, detail="Error interno del servidor")

@app.get("/api/location/all", response_model=list[AllLocationsResponse])
async def get_all_locations(
    limit: int = Query(default=100, ge=1, le=1000),
    device_id: str = Query(None, description="ID del dispositivo (opcional)")
):
    """Endpoint para obtener todos los registros, opcionalmente filtrados por device_id"""
    try:
        results = await db.get_all_locations(limit, device_id=device_id)
        return [AllLocationsResponse(**result) for result in results]
    except Exception as e:
        print(f"Error obteniendo registros: {e}")
        raise HTTPException(status_code=500, detail="Error interno del servidor")

@app.get("/api/location/range", response_model=list[LocationResponse])
async def get_location_range(
    startDate: datetime = Query(..., description="Fecha de inicio en formato ISO 8601"),
    endDate: datetime = Query(..., description="Fecha de fin en formato ISO 8601"),
    device_id: str = Query(None, description="ID del dispositivo (opcional)")
):
    """Endpoint para obtener registros por rango de fechas, opcionalmente filtrados por device_id"""
    try:
        start_time = int(startDate.timestamp() * 1000)
        end_time = int(endDate.timestamp() * 1000)

        results = await db.get_locations_by_range(start_time, end_time, device_id=device_id)
        return [LocationResponse(**result) for result in results]

    except Exception as e:
        print(f"Error obteniendo registros por rango: {e}")
        raise HTTPException(
            status_code=500,
            detail="Error interno del servidor"
        )

@app.get("/api/devices", response_model=list[str])
async def get_devices():
    """Endpoint para obtener todos los device_id únicos"""
    try:
        devices = await db.get_all_device_ids()
        return devices
    except Exception as e:
        print(f"Error obteniendo dispositivos: {e}")
        raise HTTPException(status_code=500, detail="Error interno del servidor")

@app.get("/api/location/area-records", response_model=list[dict])
async def get_area_records(
    minLat: float = Query(..., description="Latitud mínima del área"),
    maxLat: float = Query(..., description="Latitud máxima del área"),
    minLng: float = Query(..., description="Longitud mínima del área"),
    maxLng: float = Query(..., description="Longitud máxima del área"),
    device_id: str = Query(..., description="ID del dispositivo")
):
    """Endpoint para obtener recorridos de un dispositivo dentro de un área rectangular"""
    try:
        results = await db.get_locations_in_area(minLat, maxLat, minLng, maxLng, device_id)
        
        if not results:
            return []
        
        # Separar en recorridos basados en diferencia de tiempo de 5 minutos
        journeys = []
        current_journey = []
        
        for i, point in enumerate(results):
            if i == 0:
                current_journey.append(point)
            else:
                prev_time = results[i-1]['timestamp_value']
                curr_time = point['timestamp_value']
                time_diff = curr_time - prev_time
                
                # Si la diferencia es mayor a 5 minutos (300000 ms), es un nuevo recorrido
                if time_diff > 300000:
                    if current_journey:
                        journeys.append(current_journey)
                    current_journey = [point]
                else:
                    current_journey.append(point)
        
        # Agregar el último recorrido
        if current_journey:
            journeys.append(current_journey)
        
        # Formatear respuesta
        formatted_journeys = []
        for idx, journey in enumerate(journeys):
            formatted_journeys.append({
                'journey_id': idx,
                'points': journey,
                'start_time': journey[0]['timestamp_value'],
                'end_time': journey[-1]['timestamp_value']
            })
        
        return formatted_journeys
    
    except Exception as e:
        print(f"Error obteniendo recorridos por área: {e}")
        raise HTTPException(status_code=500, detail="Error interno del servidor")

# ==================== GEOFENCES ENDPOINTS ====================

@app.post("/api/geofences", response_model=GeofenceResponse)  #al hacer click en save geofence
#el backend guarda en PostgreSQL:
#Una fila en la tabla geofences con el área y metadatos
#Múltiples filas en geofence_journeys con cada recorrido
async def create_geofence(request: GeofenceSaveRequest):
    """Crea una nueva geocerca"""
    try:
        print(f"=== Recibiendo request de geocerca ===")
        print(f"Geofence data: {request.geofence.dict()}")
        print(f"Journeys count: {len(request.journeys) if request.journeys else 0}")
        
        geofence_data = request.geofence.dict()
        journeys_data = [j.dict() for j in request.journeys] if request.journeys else None
        
        print(f"Llamando a db.create_geofence...")
        result = await db.create_geofence(geofence_data, journeys_data)
        print(f"Geocerca creada exitosamente: ID {result.get('id')}")
        
        return GeofenceResponse(**result)
    except Exception as e:
        print(f"❌ Error creando geocerca: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Error creando geocerca: {str(e)}")

@app.get("/api/geofences", response_model=list[GeofenceResponse])
async def get_geofences(
    created_by: str = Query(None, description="Filtrar por creador"),
    is_active: bool = Query(None, description="Filtrar por estado activo")
):
    """Obtiene todas las geocercas"""
    try:
        print(f"Obteniendo geocercas - created_by: {created_by}, is_active: {is_active}")
        results = await db.get_all_geofences(created_by, is_active)
        print(f"Geocercas encontradas: {len(results)}")
        return [GeofenceResponse(**result) for result in results]
    except Exception as e:
        print(f"Error obteniendo geocercas: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail="Error obteniendo geocercas")

@app.get("/api/geofences/{geofence_id}", response_model=GeofenceWithJourneys) #al hacer click en en load
async def get_geofence(geofence_id: int):
    """Obtiene una geocerca específica con sus journeys"""
    try:
        print(f"Obteniendo geocerca ID: {geofence_id}")
        result = await db.get_geofence_by_id(geofence_id)
        if not result:
            raise HTTPException(status_code=404, detail="Geocerca no encontrada")
        print(f"Geocerca encontrada: {result.get('name')}")
        return GeofenceWithJourneys(**result)
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error obteniendo geocerca: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail="Error obteniendo geocerca")

@app.put("/api/geofences/{geofence_id}", response_model=GeofenceResponse)
async def update_geofence(geofence_id: int, update_data: dict):
    """Actualiza una geocerca"""
    try:
        print(f"Actualizando geocerca ID: {geofence_id}")
        result = await db.update_geofence(geofence_id, update_data)
        if not result:
            raise HTTPException(status_code=404, detail="Geocerca no encontrada")
        
        # Agregar journey_count
        result['journey_count'] = 0
        print(f"Geocerca actualizada exitosamente")
        return GeofenceResponse(**result)
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error actualizando geocerca: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail="Error actualizando geocerca")

@app.delete("/api/geofences/{geofence_id}")
async def delete_geofence(geofence_id: int):
    """Elimina una geocerca """
    try:
        print(f"Eliminando geocerca ID: {geofence_id}")
        success = await db.delete_geofence(geofence_id)
        if not success:
            raise HTTPException(status_code=404, detail="Geocerca no encontrada")
        print(f"Geocerca eliminada exitosamente")
        return {"message": "Geocerca eliminada exitosamente"}
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error eliminando geocerca: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail="Error eliminando geocerca")

@app.get("/api/health", response_model=HealthResponse)
async def health_check():
    """Endpoint de health check"""
    return HealthResponse(
        status="healthy",
        timestamp=datetime.now().isoformat()
    )

# Iniciar servidor (debe estar al FINAL)
if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv('HTTP_PORT', 3001))
    uvicorn.run(app, host="0.0.0.0", port=port)