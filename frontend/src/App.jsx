import { useState, useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap, Polyline } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L, { Icon } from 'leaflet';
import { ThreeDot } from 'react-loading-indicators';

// --- MUI Date Picker Imports ---
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { StaticDateTimePicker } from '@mui/x-date-pickers/StaticDateTimePicker';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import dayjs from 'dayjs';

import './App.css';

// --- Configuración Básica ---
const config = {
  API_BASE_URL: import.meta.env.VITE_API_URL || 'http://localhost:3001',
  APP_NAME: 'Pantera track',
  APP_SUBTITLE: 'Just UDP Location Service',
  APP_VERSION: '2.0.0',
  POLLING_INTERVAL: import.meta.env.VITE_POLLING_INTERVAL || 5000,
  // Ya no se necesitan las claves de Jawg
};

// Arreglo para el ícono por defecto de Leaflet en Vite
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

// --- Componentes de UI ---

const LoadingSpinner = () => (
  <div className="flex items-center mx-auto justify-center p-8">
    <ThreeDot color="#FFFFFF" size="medium" text="" textColor="" />
  </div>
);

const ErrorMessage = ({ error, onRetry }) => (
  <div className="glassmorphism-strong mt-40 md:-mt-60 rounded-4xl min-w-[90%] mx-auto p-8 text-center">
    <div className="text-red-400 mb-4">
      <svg className="w-12 h-12 mx-auto mb-2" fill="currentColor" viewBox="0 0 20 20">
        <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
      </svg>
      <h3 className="text-xl font-bold">Error de Conexión</h3>
    </div>
    <p className="text-white/70 mb-4">{error}</p>
    <button onClick={onRetry} className="px-4 py-2 bg-sky-600 hover:bg-sky-700 text-white rounded-lg transition-colors">
      Reintentar
    </button>
  </div>
);

// --- NUEVO Modal de Búsqueda con MUI DateTimePicker ---
const DateSearchModal = ({ isOpen, onClose, onSearch }) => {
  const [startDate, setStartDate] = useState(null);
  const [endDate, setEndDate] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  // Tema oscuro para los componentes de MUI
  const darkTheme = createTheme({
    palette: {
      mode: 'dark',
      primary: {
        main: '#0d47a1', // sky-500
      },
      background: {
        paper: 'rgba(255, 255, 255, 0.1)',
      },
      text: {
        primary: '#FFFFFF',
        secondary: '#E5E7EB', // gray-200
      },
      typography: {
        fontFamily: 'Poppins, sans-serif',
      },
    },
    components: {
      MuiPickersToolbar: {
        styleOverrides: {
          root: {
            backgroundColor: 'rgba(13, 71, 161, 0.2)',
          },
        },
      },
    },
  });

  const handleSearch = async () => {
    // Verificación de que ambas fechas estén seleccionadas
    if (!startDate || !endDate) {
      setError('Please select both a start and end date.');
      return;
    }
    // Verificación de que la fecha de fin sea posterior a la de inicio
    if (endDate.isBefore(startDate)) {
      setError('End date must be after the start date.');
      return;
    }

    setError(''); // Limpiar errores previos
    setIsLoading(true);

    try {
      // Simular búsqueda
      await new Promise(resolve => setTimeout(resolve, 1500));

      const searchData = {
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString()
      };

      onSearch(searchData);
      onClose(); // Cerrar el modal al finalizar
    } catch (err) {
      console.error('Error en búsqueda:', err);
      setError('An unexpected error occurred during the search.');
    } finally {
      setIsLoading(false);
    }
  };

  const resetForm = () => {
    setStartDate(null);
    setEndDate(null);
    setError('');
  };

  // Resetea el formulario cuando el modal se cierra
  useEffect(() => {
    if (!isOpen) {
      resetForm();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Overlay */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal - Aumentado de tamaño para los pickers */}
      <div className="relative glassmorphism-strong rounded-4xl p-8 mx-4 w-full max-w-5xl transform">
        {/* Header */}
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-bold text-white">Select Date Range</h2>
          <button onClick={onClose} className="text-white/60 cursor-pointer hover:text-white p-1">
          </button>
        </div>

        <ThemeProvider theme={darkTheme}>
          <LocalizationProvider dateAdapter={AdapterDayjs}>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              {/* Start Date Picker */}
              <div>
                <label className="block text-white text-lg font-medium mb-4 text-center">
                  Start Date
                </label>
                <StaticDateTimePicker
                  orientation="landscape"
                  value={startDate}
                  onChange={(newValue) => setStartDate(newValue)}
                  maxDate={dayjs()} // No se pueden seleccionar fechas futuras
                  timeSteps={{ minutes: 1 }} // cualquier minuto se puede seleccionar
                  sx={{
                    backgroundColor: 'rgba(0, 0, 0, 0.2)', // Fondo un poco más oscuro
                    borderRadius: '2rem', // Bordes más redondeados
                    color: '#FFFFFF', // Texto blanco
                  }}
                />
              </div>

              {/* End Date Picker */}
              <div>
                <label className="block text-white text-lg font-medium mb-4 text-center">
                  End Date
                </label>
                <StaticDateTimePicker
                  orientation="landscape"
                  value={endDate}
                  onChange={(newValue) => setEndDate(newValue)}
                  minDate={startDate} // No se puede seleccionar antes de la fecha de inicio
                  disabled={!startDate} // Deshabilitado hasta que se elija fecha de inicio
                  timeSteps={{ minutes: 1 }} //cualquier minuto se puede seleccionar
                  sx={{
                    backgroundColor: 'rgba(0, 0, 0, 0.2)', // Fondo un poco más oscuro
                    borderRadius: '2rem', // Bordes más redondeados
                    color: '#FFFFFF', // Texto blanco
                  }}
                />
              </div>
            </div>
          </LocalizationProvider>
        </ThemeProvider>

        {/* Error Message */}
        {error && (
          <div className="mt-4 text-center text-red-400 bg-red-900/50 p-3 rounded-xl">
            {error}
          </div>
        )}

        {/* Botones */}
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
            {isLoading ? (
              <>
                Searching...
              </>
            ) : (
              <>
                Search
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};


const LocationInfo = ({ location, formatTimestamp, onOpenDateSearch }) => (
  <>
    <div className='flex flex-col p-8 rounded-4xl glassmorphism-strong '>
      <div className=' rounded-4xl h-auto'>
        <h2 className='text-2xl font-bold text-white text-center rounded-4xl mb-8'>Last Location Received</h2>

        <div className='flex flex-row justify-between gap-4 rounded-xl mb-3 pl-2 pr-6 py-2'>
          <div className='flex flex-row gap-2 justify-left'>
            <h3 className='text-l text-white rounded-xl inline-block'>Latitude:</h3>
          </div>
          <div className="flex flex-col items-end">
            <span className='text-white/80 font-mono'>{parseFloat(location.latitude).toFixed(8)}</span>
          </div>
        </div>

        <div className='flex flex-row justify-between gap-4 rounded-xl mb-3 pl-2 pr-6 py-2'>
          <div className='flex flex-row gap-2 justify-left'>
            <h3 className='text-l text-white rounded-xl inline-block'>Longitude:</h3>
          </div>
          <div className="flex flex-col items-end">
            <span className='text-white/80 font-mono'>{parseFloat(location.longitude).toFixed(8)}</span>
          </div>
        </div>

        <div className='flex flex-row justify-between gap-4 rounded-xl mb-3 pl-2 pr-6 py-2'>
          <div className='flex flex-row gap-2 group justify-left'>
            <h3 className='text-l text-white rounded-xl inline-block'>Timestamp:</h3>
          </div>
          <div className="flex flex-col items-end">
            <span className='text-white/80 font-mono'>{location.timestamp_value}</span>
            <span className='text-white/50 text-sm'>{formatTimestamp(location.timestamp_value)}</span>
          </div>
        </div>
      </div>
      <button
        onClick={onOpenDateSearch}
        className='button-hover inline-flex items-center justify-center gap-2 font-semibold rounded-full transition-all duration-300 cursor-pointer focus:outline-none focus:ring-2 focus:ring-sky-800 disabled:opacity-50 disabled:cursor-not-allowed bg-gradient-to-r from-sky-600 to-sky-700 text-white hover:from-sky-700 hover:to-sky-800 px-20 py-3 md:px-20 md:py-2 text-base md:text-lg mt-2 mx-auto'
      >
        <span className='group-hover:text-white/90 duration-300'>Search by Date</span>
      </button>
    </div>
  </>
);

// --- Componente que actualiza la vista del mapa ---
const MapUpdater = ({ position }) => {
  const map = useMap();
  useEffect(() => {
    map.flyTo(position, map.getZoom(), {
      duration: 1.5,
      easeLinearity: 0.25
    });
  }, [position, map]);
  return null;
};

// --- Componente del Mapa ---
const LocationMap = ({ location, formatTimestamp, path }) => {
  const position = [parseFloat(location.latitude), parseFloat(location.longitude)];

  const customIcon = new Icon({
    iconUrl: "/icon.png",
    iconSize: [70, 70]
  });

  const polylineOptions = { color: '#110394', weight: 4 };

  return (
    <div className='glassmorphism-strong rounded-4xl backdrop-blur-lg shadow-lg p-4 max-w-4xl w-full mx-4'>
      <MapContainer
        center={position}
        zoom={18}
        style={{ height: '35rem', width: '100%', borderRadius: '1rem' }}
      >
        {/* --- CAMBIO AQUÍ --- */}
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        />
        <Marker position={position} icon={customIcon}>
          <Popup>
            <div className="text-center">
              <strong>Ubicación actual</strong><br />
              <small>Recibida: {formatTimestamp(location.timestamp_value)}</small><br />
              <small>Lat: {parseFloat(location.latitude).toFixed(6)}</small><br />
              <small>Lng: {parseFloat(location.longitude).toFixed(6)}</small>
            </div>
          </Popup>
        </Marker>
        <Polyline pathOptions={polylineOptions} positions={path} />
        <MapUpdater position={position} />
      </MapContainer>
    </div>
  );
};

// --- Componente Principal ---
function App() {
  const [locationData, setLocationData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [path, setPath] = useState([]);
  const [isDateSearchModalOpen, setIsDateSearchModalOpen] = useState(false);
  const [isLiveMode, setIsLiveMode] = useState(true);

  const fetchLatestLocation = async () => {
    try {
      const response = await fetch(`${config.API_BASE_URL}/api/location/latest`);

      if (!response.ok) {
        if (response.status === 404) {
          setError('No hay datos de ubicación disponibles');
          setLocationData(null);
        } else {
          throw new Error('Error al obtener datos');
        }
      } else {
        const data = await response.json();
        setLocationData(data);

        // --- LÓGICA PARA ACTUALIZAR LA TRAYECTORIA ---
        const newPosition = [parseFloat(data.latitude), parseFloat(data.longitude)];
        // Evita añadir puntos duplicados si la ubicación no ha cambiado
        setPath(prevPath => {
          const lastPoint = prevPath[prevPath.length - 1];
          if (!lastPoint || lastPoint[0] !== newPosition[0] || lastPoint[1] !== newPosition[1]) {
            return [...prevPath, newPosition];
          }
          return prevPath;
        });

        setError(null);
      }
    } catch (err) {
      setError('Error de conexión con el servidor');
      console.error('Error fetching location:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleDateSearch = async (searchData) => {
    console.log('Búsqueda por fecha iniciada:', searchData);
    setLoading(true);
    setIsLiveMode(false); // Detenemos el modo en vivo
    setError(null);

    try {
      const { startDate, endDate } = searchData;
      // Construimos la URL con los parámetros de fecha
      const response = await fetch(`${config.API_BASE_URL}/api/location/range?startDate=${startDate}&endDate=${endDate}`);

      if (!response.ok) {
        throw new Error('Error al obtener el historial de ubicaciones');
      }

      const historicalData = await response.json();

      if (historicalData.length > 0) {
        // Creamos la nueva ruta para la polilínea
        const newPath = historicalData.map(point => [
          parseFloat(point.latitude),
          parseFloat(point.longitude)
        ]);
        setPath(newPath);

        // Actualizamos la ubicación principal a la última del rango para centrar el mapa
        const lastLocationInRange = historicalData[historicalData.length - 1];
        setLocationData({
          latitude: lastLocationInRange.latitude,
          longitude: lastLocationInRange.longitude,
          timestamp_value: lastLocationInRange.timestamp_value
        });

      } else {
        // Si no hay datos, limpiamos la ruta y mostramos un mensaje
        setPath([]);
        setError('No se encontraron datos de ubicación para el rango seleccionado.');
        setLocationData(null); // Opcional: limpiar la última ubicación conocida
      }

    } catch (err) {
      setError('Error de conexión al buscar el historial.');
      console.error('Error fetching date range:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // Iniciar la primera carga
    fetchLatestLocation();

    let interval;
    if (isLiveMode) {
      // Solo activar el polling si estamos en modo "en vivo"
      interval = setInterval(fetchLatestLocation, config.POLLING_INTERVAL);
    }

    // Limpiar el intervalo cuando el componente se desmonte o cuando cambie el modo
    return () => {
      if (interval) {
        clearInterval(interval);
      }
    };
  }, [isLiveMode]); // <-- Añade isLiveMode como dependencia

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
        <div className="absolute inset-0 bg-gradient-to-br from-black via-black to-black"></div>
        <div className="absolute inset-0 opacity-30">
          <div className="absolute top-20 left-10 w-72 h-72 md:w-96 md:h-96 bg-black rounded-full filter blur-3xl opacity-40 animate-float"></div>
          <div className="absolute bottom-20 right-10 w-64 h-64 md:w-80 md:h-80 bg-black rounded-full filter blur-3xl opacity-30 animate-float"></div>
          <div className="absolute top-1/2 left-1/2 w-48 h-48 md:w-64 md:h-64 bg-black rounded-full filter blur-3xl opacity-20 animate-float"></div>
        </div>
      </div>

      <header className="fixed top-4 left-1/2 -translate-x-1/2 z-50 min-w-[80%] md:min-w-[90%] py-3 px-4 rounded-4xl">
        <div className="flex flex-col items-center gap-2">
          <h1 className="py-1 px-3 text-center font-bold text-white/80 text-7xl">
            {config.APP_NAME}
          </h1>
        </div>
      </header>

      <main className='flex flex-col md:flex-row items-center mt-50 md:mt-15 justify-between gap-2 max-w-[90%] mx-auto min-h-screen'>
        {loading ? (
          <LoadingSpinner />
        ) : error ? (
          <ErrorMessage error={error} onRetry={isLiveMode ? fetchLatestLocation : () => setError(null)} />
        ) : locationData ? (
          <>
            {/* --- BOTÓN PARA VOLVER A MODO EN VIVO --- */}
            {!isLiveMode && (
              <div className="absolute top-40 left-1/2 -translate-x-1/2 z-40">
                <button
                  onClick={() => {
                    setIsLiveMode(true);
                    setPath([]); // Limpiamos la ruta histórica
                    setError(null);
                    setLoading(true); // Mostramos spinner mientras carga la última ubicación
                  }}
                  className="flex items-left gap-2 px-6 py-3 bg-gradient-to-r from-sky-500 to-sky-600 hover:from-sky-600 hover:to-sky-700 text-white rounded-xl shadow-lg transition-all font-medium"
                >
                  Volver a Tiempo Real
                </button>
              </div>
            )}
            <LocationMap location={locationData} formatTimestamp={formatTimestamp} path={path} />
            <LocationInfo
              location={locationData}
              formatTimestamp={formatTimestamp}
              onOpenDateSearch={() => setIsDateSearchModalOpen(true)}
            />
          </>
        ) : (
          <div className="glassmorphism-strong min-w-[90%] mx-auto rounded-4xl p-8 text-center">
            <p className="text-white/70 mb-4">Esperando datos de ubicación...</p>
          </div>
        )}
      </main>

      <DateSearchModal
        isOpen={isDateSearchModalOpen}
        onClose={() => setIsDateSearchModalOpen(false)}
        onSearch={handleDateSearch}
      />
    </div>
  );
}

export default App;