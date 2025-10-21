import { useState, useEffect, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap, Polyline, CircleMarker } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L, { Icon } from 'leaflet';
import { ThreeDot } from 'react-loading-indicators';

// --- MUI Date Picker Imports ---
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { DateTimePicker } from '@mui/x-date-pickers/DateTimePicker';
import { DemoContainer } from '@mui/x-date-pickers/internals/demo';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import dayjs from 'dayjs';

import './App.css';

// --- Configuración Básica ---
const config = {
  API_BASE_URL: import.meta.env.VITE_API_URL || 'http://localhost:3001',
  APP_NAME: 'Pantera',
  APP_SUBTITLE: '',
  APP_VERSION: '2.0.0',
  POLLING_INTERVAL: import.meta.env.VITE_POLLING_INTERVAL || 5000,
  DEVICE_TIMEOUT: 20000, // 20 segundos en milisegundos
};

// Arreglo para el ícono por defecto de Leaflet en Vite
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

// Paleta de colores para diferentes dispositivos
const DEVICE_COLORS = [
  '#110394', // Azul oscuro
  '#FF6B6B', // Rojo
  '#4ECDC4', // Turquesa
  '#FFD93D', // Amarillo
  '#95E1D3', // Verde menta
  '#F38181', // Rosa
  '#AA96DA', // Púrpura
  '#FCBAD3', // Rosa claro
];

// Función para obtener color según device_id
const getColorForDevice = (deviceId, allDevices) => {
  if (!deviceId) return DEVICE_COLORS[0];
  const index = allDevices.indexOf(deviceId);
  return DEVICE_COLORS[index % DEVICE_COLORS.length];
};

// Función para verificar si un dispositivo está activo (últimos 20 segundos)
const isDeviceActive = (timestamp) => {
  const now = Date.now();
  const deviceTime = parseInt(timestamp);
  return (now - deviceTime) <= config.DEVICE_TIMEOUT;
};

// --- Componentes de UI ---

const LoadingSpinner = () => (
  <div className="flex items-center mx-auto justify-center p-8">
    <ThreeDot color="#FFFFFF" size="medium" text="" textColor="" />
  </div>
);

const ErrorMessage = ({ error, onRetry }) => (
  <div className="glassmorphism-strong mt-40 md:-mt-60 rounded-4xl min-w-[90%] mx-auto p-8 text-center">
    <div className="text-red-400 mb-4">
      <h3 className="text-xl font-bold">Atención</h3>
    </div>
    <p className="text-white/70 mb-4">{error}</p>
    <button onClick={onRetry} className="px-4 py-2 bg-sky-600 hover:bg-sky-700 text-white rounded-lg transition-colors">
      Reintentar
    </button>
  </div>
);

// --- NUEVO Modal de Búsqueda con MUI DateTimePicker ---
const DateSearchModal = ({ isOpen, onClose, onSearch, devices }) => {
  const [startDate, setStartDate] = useState(null);
  const [endDate, setEndDate] = useState(null);
  const [selectedDevice, setSelectedDevice] = useState('all');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  // Tema oscuro para los componentes de MUI
  const darkTheme = createTheme({
    palette: {
      mode: 'dark',
      primary: {
        main: '#0ea5e9',
      },
      background: {
        default: '#1e293b',
        paper: '#334155',
      },
    },
    components: {
      MuiOutlinedInput: {
        styleOverrides: {
          root: {
            '& .MuiOutlinedInput-notchedOutline': {
              borderColor: 'rgba(255, 255, 255, 0.3)',
            },
            '&:hover .MuiOutlinedInput-notchedOutline': {
              borderColor: 'rgba(14, 165, 233, 0.5)',
            },
            '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
              borderColor: '#0ea5e9',
            },
          },
        },
      },
      MuiInputLabel: {
        styleOverrides: {
          root: {
            color: 'rgba(255, 255, 255, 0.7)',
          },
        },
      },
    },
  });

  useEffect(() => {
    if (!isOpen) {
      resetForm();
    }
  }, [isOpen]);

  const resetForm = () => {
    setStartDate(null);
    setEndDate(null);
    setSelectedDevice('all');
    setError('');
  };

  const handleSearch = async () => {
    if (!startDate || !endDate) {
      setError('Por favor, selecciona ambas fechas.');
      return;
    }

    if (endDate.isBefore(startDate)) {
      setError('La fecha de fin debe ser posterior a la fecha de inicio.');
      return;
    }

    setIsLoading(true);
    setError('');

    try {
      await onSearch({
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
        deviceId: selectedDevice === 'all' ? null : selectedDevice
      });
      onClose();
    } catch (err) {
      setError('Error al realizar la búsqueda. Inténtalo de nuevo.');
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />

      <div className="relative glassmorphism-strong rounded-4xl p-8 mx-4 w-full max-w-5xl transform">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-bold text-white">Select Date Range</h2>
          <button onClick={onClose} className="text-white/60 cursor-pointer hover:text-white p-1">
            ✕
          </button>
        </div>

        <ThemeProvider theme={darkTheme}>
          <LocalizationProvider dateAdapter={AdapterDayjs}>
            <DemoContainer components={['DateTimePicker', 'DateTimePicker']}>
              <DateTimePicker
                label="Start Date"
                value={startDate}
                onChange={(newValue) => setStartDate(newValue)}
                maxDate={dayjs()}
              />
              <DateTimePicker
                label="End Date"
                value={endDate}
                onChange={(newValue) => setEndDate(newValue)}
                minDate={startDate}
                disabled={!startDate}
              />
            </DemoContainer>
          </LocalizationProvider>
        </ThemeProvider>

        {/* Selector de dispositivo */}
        {devices.length > 0 && (
          <div className="mt-6">
            <label className="block text-white mb-2">Filter by Device:</label>
            <select
              value={selectedDevice}
              onChange={(e) => setSelectedDevice(e.target.value)}
              className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-sky-500"
            >
              <option value="all">All Devices</option>
              {devices.map((device) => (
                <option key={device.device_id} value={device.device_id}>
                  {device.device_id}
                </option>
              ))}
            </select>
          </div>
        )}

        {error && (
          <div className="mt-4 text-center text-red-400 bg-red-900/50 p-3 rounded-xl">
            {error}
          </div>
        )}

        <div className="flex gap-4 pt-6 mt-4 border-t border-white/20">
          <button
            onClick={resetForm}
            className="flex-1 px-6 py-3 bg-white/10 hover:bg-white/20 text-white rounded-xl transition-all font-medium"
            disabled={isLoading}
          >
            Clean
          </button>
          <button
            onClick={handleSearch}
            disabled={isLoading || !startDate || !endDate}
            className="flex-1 inline-flex items-center justify-center gap-2 px-6 py-3 bg-gradient-to-r from-sky-600 to-sky-700 hover:from-sky-700 hover:to-sky-800 text-white rounded-xl transition-all font-medium disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading ? 'Searching...' : 'Search'}
          </button>
        </div>
      </div>
    </div>
  );
};

// --- NUEVO Componente de Lista de Dispositivos ---
const DevicesList = ({ allDevices, activeDeviceIds, onOpenDateSearch }) => {
  return (
    <div className='flex flex-col p-8 rounded-4xl glassmorphism-strong'>
      <div className='rounded-4xl h-auto'>
        <h2 className='text-2xl font-bold text-white text-center rounded-4xl mb-8'>
          Devices
        </h2>

        {allDevices.length === 0 ? (
          <div className="text-center text-white/60 py-8">
            <p>No devices registered yet</p>
          </div>
        ) : (
          <div className="space-y-3">
            {allDevices.map((device) => {
              const isActive = activeDeviceIds.includes(device.device_id);
              
              return (
                <div 
                  key={device.device_id} 
                  className="flex items-center justify-between gap-3 px-4 py-3 bg-white/5 hover:bg-white/10 rounded-xl transition-all"
                >
                  <div className="flex items-center gap-3">
                    {/* Indicador de estado (verde = activo, rojo = inactivo) */}
                    <div 
                      className={`w-3 h-3 rounded-full ${isActive ? 'bg-green-500' : 'bg-red-500'} shadow-lg`}
                      style={{
                        boxShadow: isActive 
                          ? '0 0 10px rgba(34, 197, 94, 0.6)' 
                          : '0 0 10px rgba(239, 68, 68, 0.6)'
                      }}
                    />
                    
                    {/* Nombre del dispositivo */}
                    <span className="text-white font-mono text-sm">
                      {device.device_id}
                    </span>
                  </div>

                  {/* Badge de estado */}
                  <span 
                    className={`text-xs px-2 py-1 rounded-full font-medium ${
                      isActive 
                        ? 'bg-green-500/20 text-green-400' 
                        : 'bg-red-500/20 text-red-400'
                    }`}
                  >
                    {isActive ? 'Active' : 'Inactive'}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <button
        onClick={onOpenDateSearch}
        className='button-hover inline-flex items-center justify-center gap-2 font-semibold rounded-full transition-all duration-300 cursor-pointer focus:outline-none focus:ring-2 focus:ring-sky-500 focus:ring-offset-2 focus:ring-offset-transparent mt-6'
      >
        <span className='group-hover:text-white/90 duration-300'>Search by Date</span>
      </button>
    </div>
  );
};

// --- Componente que actualiza la vista del mapa ---
const MapUpdater = ({ bounds, hasUserInteracted }) => {
  const map = useMap();
  
  useEffect(() => {
    // Solo ajustar el zoom si el usuario NO ha interactuado con el mapa
    if (bounds && bounds.length > 0 && !hasUserInteracted) {
      // Si hay múltiples puntos, ajustar los límites
      if (bounds.length > 1) {
        try {
          map.fitBounds(bounds, { padding: [50, 50], maxZoom: 18 });
        } catch (e) {
          console.error('Error ajustando bounds:', e);
        }
      } else {
        // Si solo hay un punto, hacer zoom normal
        map.flyTo(bounds[0], 18, {
          duration: 1.5,
          easeLinearity: 0.25
        });
      }
    }
  }, [bounds, map, hasUserInteracted]);
  
  return null;
};

// --- Componente del Mapa ---
const LocationMap = ({ locations, formatTimestamp, paths, allDevices }) => {
  const [hasUserInteracted, setHasUserInteracted] = useState(false);
  
  // Usar la primera ubicación como centro inicial, o coordenadas por defecto
  const centerLocation = locations.length > 0 
    ? locations[0] 
    : { latitude: 40.7128, longitude: -74.0060 };
  const position = [parseFloat(centerLocation.latitude), parseFloat(centerLocation.longitude)];

  // Calcular bounds para todos los puntos de todos los paths Y todas las ubicaciones actuales
  const allPathPoints = Object.values(paths).flat();
  const currentLocationPoints = locations.map(loc => [parseFloat(loc.latitude), parseFloat(loc.longitude)]);
  const allPoints = [...allPathPoints, ...currentLocationPoints];
  const bounds = allPoints.length > 0 ? allPoints : [position];

  // Componente interno para detectar interacciones del usuario
  const InteractionDetector = () => {
    const map = useMap();
    
    useEffect(() => {
      const handleInteraction = () => {
        setHasUserInteracted(true);
      };

      // Detectar zoom manual
      map.on('zoomstart', handleInteraction);
      // Detectar movimiento del mapa
      map.on('dragstart', handleInteraction);

      return () => {
        map.off('zoomstart', handleInteraction);
        map.off('dragstart', handleInteraction);
      };
    }, [map]);

    return null;
  };

  return (
    <div className='glassmorphism-strong rounded-4xl backdrop-blur-lg shadow-lg p-4 max-w-4xl w-full mx-4'>
      <MapContainer
        center={position}
        zoom={18}
        style={{ height: '45rem', width: '100%', borderRadius: '1rem' }}
      >
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        />
        
        {/* Renderizar marcadores circulares para CADA dispositivo activo */}
        {locations.map((location, index) => {
          const markerPosition = [parseFloat(location.latitude), parseFloat(location.longitude)];
          const activeDeviceIds = locations.map(loc => loc.device_id);
          const deviceColor = getColorForDevice(location.device_id, activeDeviceIds);
          
          return (
            <CircleMarker 
              key={location.device_id || index} 
              center={markerPosition}
              radius={12}
              pathOptions={{
                fillColor: deviceColor,
                fillOpacity: 0.9,
                color: deviceColor,
                weight: 3,
                opacity: 1
              }}
            >
              <Popup>
                <div className="text-center">
                  <strong>{location.device_id || 'Device'}</strong><br />
                  <small>Updated: {formatTimestamp(location.timestamp_value)}</small><br />
                  <small>Lat: {parseFloat(location.latitude).toFixed(6)}</small><br />
                  <small>Lng: {parseFloat(location.longitude).toFixed(6)}</small>
                </div>
              </Popup>
            </CircleMarker>
          );
        })}

        {/* Renderizar polilíneas para cada dispositivo con su color */}
        {Object.entries(paths).map(([deviceId, devicePath]) => {
          if (devicePath.length === 0) return null;
          const activeDeviceIds = locations.map(loc => loc.device_id);
          return (
            <Polyline
              key={deviceId}
              pathOptions={{ 
                color: getColorForDevice(deviceId, activeDeviceIds), 
                weight: 4 
              }}
              positions={devicePath}
            />
          );
        })}

        <MapUpdater bounds={bounds} hasUserInteracted={hasUserInteracted} />
        <InteractionDetector />
      </MapContainer>

      {/* Leyenda de dispositivos activos */}
      {locations.length > 1 && (
        <div className="mt-4 p-4 bg-white/10 rounded-xl">
          <h3 className="text-white font-bold mb-2">Active Devices:</h3>
          <div className="flex flex-wrap gap-2">
            {locations.map((location) => (
              <div key={location.device_id} className="flex items-center gap-2">
                <div 
                  className="w-4 h-4 rounded-full"
                  style={{ backgroundColor: getColorForDevice(location.device_id, locations.map(loc => loc.device_id)) }}
                />
                <span className="text-white text-sm">{location.device_id}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

// --- Componente Principal ---
function App() {
  const [locationsData, setLocationsData] = useState([]); // Array de ubicaciones activas
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [paths, setPaths] = useState({});
  const [allDevices, setAllDevices] = useState([]); // Todos los dispositivos registrados
  const [activeDeviceIds, setActiveDeviceIds] = useState([]); // IDs de dispositivos activos
  const [isDateSearchModalOpen, setIsDateSearchModalOpen] = useState(false);
  const [isLiveMode, setIsLiveMode] = useState(true);

  // Obtener lista de TODOS los dispositivos registrados en la plataforma
  const fetchAllDevices = async () => {
    try {
      const response = await fetch(`${config.API_BASE_URL}/api/devices`);
      if (response.ok) {
        const data = await response.json();
        // Asegurarse de que data sea un array de objetos con device_id
        const devicesArray = Array.isArray(data) 
          ? data.map(d => typeof d === 'string' ? { device_id: d } : d)
          : [];
        setAllDevices(devicesArray);
      }
    } catch (err) {
      console.error('Error fetching devices:', err);
    }
  };

  // Filtrar dispositivos activos (últimos 20 segundos)
  const filterActiveDevices = (locations) => {
    return locations.filter(location => isDeviceActive(location.timestamp_value));
  };

  // Limpiar paths de dispositivos inactivos
  const cleanInactivePaths = (activeDeviceIds) => {
    setPaths(prevPaths => {
      const newPaths = {};
      activeDeviceIds.forEach(deviceId => {
        if (prevPaths[deviceId]) {
          newPaths[deviceId] = prevPaths[deviceId];
        }
      });
      return newPaths;
    });
  };

  // MODIFICADO: Obtener ubicaciones de TODOS los dispositivos y filtrar activos
  const fetchLatestLocations = async () => {
    try {
      const response = await fetch(`${config.API_BASE_URL}/api/location/latest-by-devices`);

      if (!response.ok) {
        if (response.status === 404) {
          setLocationsData([]);
          setActiveDeviceIds([]);
        } else {
          throw new Error('Error al obtener datos');
        }
      } else {
        const data = await response.json();
        
        // Filtrar solo dispositivos activos (últimos 20 segundos)
        const activeLocations = filterActiveDevices(data);
        setLocationsData(activeLocations);

        // Actualizar lista de dispositivos activos (solo IDs)
        const activeIds = activeLocations.map(loc => loc.device_id || 'unknown');
        setActiveDeviceIds(activeIds);

        // Limpiar paths de dispositivos inactivos
        cleanInactivePaths(activeIds);

        // Actualizar paths solo para dispositivos activos
        setPaths(prevPaths => {
          const newPaths = { ...prevPaths };
          
          activeLocations.forEach(location => {
            const deviceId = location.device_id || 'unknown';
            const newPosition = [parseFloat(location.latitude), parseFloat(location.longitude)];
            const devicePath = newPaths[deviceId] || [];
            const lastPoint = devicePath[devicePath.length - 1];
            
            if (!lastPoint || lastPoint[0] !== newPosition[0] || lastPoint[1] !== newPosition[1]) {
              newPaths[deviceId] = [...devicePath, newPosition];
            }
          });
          
          return newPaths;
        });

        setError(null);
      }
    } catch (err) {
      setError('Error de conexión con el servidor');
      console.error('Error fetching locations:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleDateSearch = async (searchData) => {
    console.log('Búsqueda por fecha iniciada:', searchData);
    setLoading(true);
    setIsLiveMode(false);
    setError(null);

    try {
      const { startDate, endDate, deviceId } = searchData;
      const url = deviceId 
        ? `${config.API_BASE_URL}/api/location/range?startDate=${startDate}&endDate=${endDate}&device_id=${deviceId}`
        : `${config.API_BASE_URL}/api/location/range?startDate=${startDate}&endDate=${endDate}`;

      const response = await fetch(url);

      if (!response.ok) {
        throw new Error('Error al obtener el historial de ubicaciones');
      }

      const historicalData = await response.json();

      if (historicalData.length > 0) {
        // Agrupar datos por device_id
        const pathsByDevice = {};
        const locationsByDevice = {};
        
        historicalData.forEach(point => {
          const devId = point.device_id || 'unknown';
          if (!pathsByDevice[devId]) {
            pathsByDevice[devId] = [];
          }
          pathsByDevice[devId].push([
            parseFloat(point.latitude),
            parseFloat(point.longitude)
          ]);
          
          // Guardar la última ubicación de cada dispositivo
          locationsByDevice[devId] = point;
        });

        setPaths(pathsByDevice);
        
        // Convertir a array para mostrar todos los dispositivos
        const allLocations = Object.values(locationsByDevice);
        setLocationsData(allLocations);
        
        // Actualizar active devices con los del historial
        setActiveDeviceIds(Object.keys(locationsByDevice));

      } else {
        setPaths({});
        setError('No hay datos de ubicación en este tiempo.');
        setLocationsData([]);
        setActiveDeviceIds([]);
      }

    } catch (err) {
      setError('Error de conexión al buscar el historial.');
      console.error('Error fetching date range:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAllDevices();
  }, []);

  useEffect(() => {
    let interval;
    if (isLiveMode) {
      fetchLatestLocations();
      interval = setInterval(() => {
        fetchLatestLocations();
        fetchAllDevices(); // Actualizar lista de todos los dispositivos
      }, config.POLLING_INTERVAL);
    }

    return () => {
      if (interval) {
        clearInterval(interval);
      }
    };
  }, [isLiveMode]);

  const formatTimestamp = (timestamp) => {
    const date = new Date(parseInt(timestamp));
    return date.toLocaleString('es-ES', {
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit'
    });
  };

  return (
    <div className="min-h-screen transition-all duration-500 dark">
      <div className="fixed inset-0 -z-10 transition-all duration-500">
        <div className="absolute inset-0 animated-gradient"></div>
        <div className="absolute inset-0 opacity-30">
          <div className="absolute top-20 left-10 w-72 h-72 md:w-96 md:h-96 bg-black rounded-full filter blur-3xl opacity-40 animate-float"></div>
          <div className="absolute bottom-20 right-10 w-64 h-64 md:w-80 md:h-80 bg-black rounded-full filter blur-3xl opacity-30 animate-float"></div>
          <div className="absolute top-1/2 left-1/2 w-48 h-48 md:w-64 md:h-64 bg-black rounded-full filter blur-3xl opacity-20 animate-float"></div>
        </div>
      </div>

      <main className='flex flex-col md:flex-row items-center justify-center gap-8 max-w-[90%] mx-auto min-h-screen py-10'>
        {loading ? (
          <LoadingSpinner />
        ) : error ? (
          <ErrorMessage error={error} onRetry={isLiveMode ? fetchLatestLocations : () => window.location.reload()} />
        ) : (
          <>
            {!isLiveMode && (
              <div className="absolute top-40 left-1/2 -translate-x-1/2 z-40">
                <button
                  onClick={() => {
                    setIsLiveMode(true);
                    setPaths({});
                    setError(null);
                    setLoading(true);
                  }}
                  className="flex items-left gap-2 px-6 py-3 bg-gradient-to-r from-sky-500 to-sky-600 hover:from-sky-600 hover:to-sky-700 text-white rounded-xl shadow-lg transition-all font-medium"
                >
                  Return to live mode
                </button>
              </div>
            )}
            <div className="w-full md:w-3/4 animate-slide-in-left interactive-glow rounded-4xl">
              <LocationMap 
                locations={locationsData}
                formatTimestamp={formatTimestamp} 
                paths={paths}
                allDevices={allDevices}
              />
            </div>
            <div className="w-full md:w-1/4 flex flex-col gap-8 text-center animate-slide-in-right">
              <h1 className="font-bold text-7xl bg-gradient-to-r from-sky-400 to-cyan-300 text-transparent bg-clip-text" style={{ fontFamily: 'Poppins, sans-serif' }}>
                {config.APP_NAME}
              </h1>
              <DevicesList
                allDevices={allDevices}
                activeDeviceIds={activeDeviceIds}
                onOpenDateSearch={() => setIsDateSearchModalOpen(true)}
              />
            </div>
          </>
        )}
      </main>

      <DateSearchModal
        isOpen={isDateSearchModalOpen}
        onClose={() => setIsDateSearchModalOpen(false)}
        onSearch={handleDateSearch}
        devices={allDevices}
      />
    </div>
  );
}

export default App;