from pydantic import BaseModel
from typing import Optional
from datetime import datetime

class LocationData(BaseModel):
    """Modelo para datos de ubicación"""
    latitude: float
    longitude: float
    timestamp_value: int
    created_at: Optional[datetime] = None
    device_id: Optional[str] = None # Añadido

class LocationResponse(BaseModel):
    """Respuesta para ubicación"""
    latitude: float
    longitude: float
    timestamp_value: int
    created_at: datetime
    device_id: Optional[str] = None # Añadido

class AllLocationsResponse(BaseModel):
    """Respuesta para todas las ubicaciones"""
    id: int
    latitude: float
    longitude: float
    timestamp_value: int
    accuracy: Optional[float] = None
    altitude: Optional[float] = None
    speed: Optional[float] = None
    provider: Optional[str] = None
    created_at: datetime
    device_id: Optional[str] = None # Añadido

class HealthResponse(BaseModel):
    """Respuesta del health check"""
    status: str
    timestamp: str

class ErrorResponse(BaseModel):
    """Respuesta de error"""
    message: str
    
class InternalErrorResponse(BaseModel):
    """Respuesta de error interno"""
    error: str

class GeofenceCreate(BaseModel):
    """Modelo para crear una geocerca"""
    name: str
    description: Optional[str] = None
    min_lat: float
    max_lat: float
    min_lng: float
    max_lng: float
    device_ids: list[str]
    created_by: Optional[str] = None

class GeofenceResponse(BaseModel):
    """Respuesta de geocerca"""
    id: int
    name: str
    description: Optional[str] = None
    min_lat: float
    max_lat: float
    min_lng: float
    max_lng: float
    device_ids: list[str]
    created_by: Optional[str] = None
    created_at: datetime
    updated_at: datetime
    is_active: bool
    journey_count: Optional[int] = 0

class GeofenceJourney(BaseModel):
    """Modelo para journey de geocerca"""
    device_id: str
    start_time: int
    end_time: int
    points: list[dict]

class GeofenceWithJourneys(BaseModel):
    """Geocerca con sus journeys"""
    id: int
    name: str
    description: Optional[str] = None
    min_lat: float
    max_lat: float
    min_lng: float
    max_lng: float
    device_ids: list[str]
    created_by: Optional[str] = None
    created_at: datetime
    updated_at: datetime
    is_active: bool
    journeys: list[GeofenceJourney]