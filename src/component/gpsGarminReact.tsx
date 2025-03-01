import React, { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { Map as MapIcon, Layers, Navigation, Save, List, Download, Menu, X, Search, Copy, RotateCcw, Compass, Zap } from 'lucide-react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import './gpsGarminReact.css';

//
// Type definitions
interface SavedPoint {
  id: string;
  name: string;
  lat: number;
  lng: number;
  timestamp: number;
}

interface Coordinates {
  lat: number;
  lng: number;
}

interface UTMCoordinates {
  zone: number;
  letter: string;
  easting: string;
  northing: string;
}

// Constants
const STORAGE_KEYS = {
  COORD_SYSTEM: 'coordSystem',
  MAP_LAYER: 'mapLayer',
  SAVED_POINTS: 'savedPoints',
  TRACK_POINTS: 'trackPoints'
};

const MAP_LAYERS = {
  STREETS: 'streets',
  SATELLITE: 'satellite'
};

const COORD_SYSTEMS = {
  DECIMAL: 'dd',
  DMS: 'dms',
  UTM: 'utm'
};

function App() {
  // ===== STATE MANAGEMENT =====
  // User preferences
  const [coordSystem, setCoordSystem] = useState(() => {
    return localStorage.getItem(STORAGE_KEYS.COORD_SYSTEM) || COORD_SYSTEMS.DECIMAL;
  });
  
  const [activeLayer, setActiveLayer] = useState<'streets' | 'satellite'>(() => {
    return (localStorage.getItem(STORAGE_KEYS.MAP_LAYER) as 'streets' | 'satellite') || MAP_LAYERS.STREETS;
  });
  
  // Location data
  const [currentCoords, setCurrentCoords] = useState<Coordinates | null>(null);
  const [elevation, setElevation] = useState<number | null>(null);
  const [accuracy, setAccuracy] = useState<number | null>(null);
  const [isFirstLocation, setIsFirstLocation] = useState(true);
  const [isFollowingLocation, setIsFollowingLocation] = useState(true);
  
  // Tracking
  const [trackingEnabled, setTrackingEnabled] = useState(false);
  const [trackPoints, setTrackPoints] = useState<[number, number][]>([]);
  
  // UI state
  const [showMenu, setShowMenu] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [showPointsList, setShowPointsList] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [copyFeedback, setCopyFeedback] = useState<string | null>(null);
  const [savedPoints, setSavedPoints] = useState<SavedPoint[]>([]);
  
  // ===== REFS =====
  const mapRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);
  const markersLayerRef = useRef<L.LayerGroup>(L.layerGroup());
  const trackLineRef = useRef<L.Polyline | null>(null);
  const searchMarkerRef = useRef<L.Marker | null>(null);
  const copyTimeoutRef = useRef<number | null>(null);

  // ===== EFFECTS =====
  // Load saved data from localStorage
  useEffect(() => {
    const loadSavedData = () => {
      // Load saved points
      const loadedPoints = localStorage.getItem(STORAGE_KEYS.SAVED_POINTS);
      if (loadedPoints) {
        setSavedPoints(JSON.parse(loadedPoints));
      }
      
      // Load track points
      const loadedTrack = localStorage.getItem(STORAGE_KEYS.TRACK_POINTS);
      if (loadedTrack) {
        setTrackPoints(JSON.parse(loadedTrack));
      }
    };
    
    loadSavedData();
  }, []);

  // Save preferences to localStorage
  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.COORD_SYSTEM, coordSystem);
  }, [coordSystem]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.MAP_LAYER, activeLayer);
  }, [activeLayer]);

  // Initialize map
  useEffect(() => {
    // Initialize map if it doesn't exist
    if (!mapRef.current) {
      mapRef.current = L.map('map', {
        zoomControl: false,
        attributionControl: false
      }).setView([0, 0], 2);

      // Add zoom control
      L.control.zoom({
        position: 'topright'
      }).addTo(mapRef.current);

      // Add attribution
      L.control.attribution({
        position: 'bottomright',
        prefix: false
      }).addTo(mapRef.current).addAttribution('© OpenStreetMap | © Esri');

      // Add markers layer
      markersLayerRef.current.addTo(mapRef.current);

      // Add map event listeners
      mapRef.current.on('dragstart', () => {
        setIsFollowingLocation(false);
      });
    }

    // Define map layers
    const layers = {
      streets: L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19
      }),
      satellite: L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
        maxZoom: 19
      })
    };

    // Remove all layers first
    Object.values(layers).forEach(layer => layer.remove());
    
    // Add the active layer
    layers[activeLayer].addTo(mapRef.current);

    return () => {
      if (mapRef.current) {
        layers.streets.remove();
        layers.satellite.remove();
      }
    };
  }, [activeLayer]);

  // Update markers when saved points change
  useEffect(() => {
    markersLayerRef.current.clearLayers();
    
    savedPoints.forEach(point => {
      L.marker([point.lat, point.lng])
        .bindPopup(`
          <div style="color: black;">
            <strong>${point.name}</strong><br>
            ${formatCoordinates({ lat: point.lat, lng: point.lng })}
          </div>
        `)
        .addTo(markersLayerRef.current);
    });
  }, [savedPoints, coordSystem]);

  // Update track line when track points change
  useEffect(() => {
    if (mapRef.current) {
      // Remove existing track line
      if (trackLineRef.current) {
        trackLineRef.current.remove();
      }
      
      // Create new track line if there are points
      if (trackPoints.length > 0) {
        trackLineRef.current = L.polyline(trackPoints, {
          color: '#22c55e',
          weight: 3,
          opacity: 0.7,
          lineJoin: 'round'
        }).addTo(mapRef.current);
      }
    }
    
    // Save track points to localStorage
    localStorage.setItem(STORAGE_KEYS.TRACK_POINTS, JSON.stringify(trackPoints));
  }, [trackPoints]);

  // Geolocation tracking
  useEffect(() => {
    if (!('geolocation' in navigator)) {
      console.error('Geolocation is not supported by this browser');
      return;
    }
    
    const handlePositionUpdate = (position: GeolocationPosition) => {
      const { latitude, longitude, accuracy, altitude } = position.coords;
      
      // Update state with new coordinates
      setCurrentCoords({ lat: latitude, lng: longitude });
      setAccuracy(accuracy);
      setElevation(altitude || null);

      if (mapRef.current) {
        // Create or update position marker
        if (!markerRef.current) {
          // Create new marker for current position
          markerRef.current = L.marker([latitude, longitude], {
            icon: L.divIcon({
              className: 'current-location-marker',
              html: '<div class="pulse"></div>',
              iconSize: [20, 20],
              iconAnchor: [10, 10]
            })
          }).addTo(mapRef.current);
          
          // Center map on first location
          if (isFirstLocation) {
            mapRef.current.setView([latitude, longitude], 18);
            setIsFirstLocation(false);
          }
        } else {
          // Update existing marker position
          markerRef.current.setLatLng([latitude, longitude]);
          
          // Follow location if enabled
          if (isFollowingLocation) {
            mapRef.current.panTo([latitude, longitude], { animate: true });
          }
        }
        
        // Add point to track if tracking is enabled
        if (trackingEnabled && latitude && longitude) {
          setTrackPoints(prev => {
            // Only add point if it's different from the last one or if accuracy is good
            const isNewPoint = prev.length === 0 || 
                (prev[prev.length - 1][0] !== latitude || 
                 prev[prev.length - 1][1] !== longitude);
            const isAccurateEnough = accuracy < 20;
            
            if (isNewPoint && isAccurateEnough) {
              return [...prev, [latitude, longitude]];
            }
            return prev;
          });
        }
      }
    };
    
    const handlePositionError = (error: GeolocationPositionError) => {
      console.error('Error getting location:', error.message);
    };
    
    // Start watching position
    const watchId = navigator.geolocation.watchPosition(
      handlePositionUpdate,
      handlePositionError,
      {
        enableHighAccuracy: true,
        timeout: 5000,
        maximumAge: 0
      }
    );

    // Clean up
    return () => {
      navigator.geolocation.clearWatch(watchId);
    };
  }, [isFirstLocation, trackingEnabled, isFollowingLocation]);

  // ===== HELPER FUNCTIONS =====
  
  /**
   * Saves the current location as a named point
   */
  const saveCurrentPoint = useCallback(() => {
    if (!currentCoords) return;
    
    const name = prompt('Enter a name for this point:');
    if (!name) return;
    
    const newPoint = {
      id: crypto.randomUUID(),
      name,
      lat: currentCoords.lat,
      lng: currentCoords.lng,
      timestamp: Date.now()
    };
    
    const updatedPoints = [...savedPoints, newPoint];
    setSavedPoints(updatedPoints);
    localStorage.setItem(STORAGE_KEYS.SAVED_POINTS, JSON.stringify(updatedPoints));
    setShowMenu(false);
  }, [currentCoords, savedPoints]);

  /**
   * Deletes a saved point by ID
   */
  const deletePoint = useCallback((id: string) => {
    if (!confirm('Are you sure you want to delete this point?')) return;
    
    const updatedPoints = savedPoints.filter(point => point.id !== id);
    setSavedPoints(updatedPoints);
    localStorage.setItem(STORAGE_KEYS.SAVED_POINTS, JSON.stringify(updatedPoints));
  }, [savedPoints]);

  /**
   * Exports saved points and track as GPX file
   */
  const exportGPX = useCallback(() => {
    const gpx = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="GPS Tracker" xmlns="http://www.topografix.com/GPX/1/1">
  ${savedPoints.map(point => `
  <wpt lat="${point.lat}" lon="${point.lng}">
    <name>${point.name}</name>
    <time>${new Date(point.timestamp).toISOString()}</time>
  </wpt>`).join('')}
  ${trackPoints.length > 0 ? `
  <trk>
    <name>Track ${new Date().toISOString().split('T')[0]}</name>
    <trkseg>
      ${trackPoints.map(point => `
      <trkpt lat="${point[0]}" lon="${point[1]}"></trkpt>`).join('')}
    </trkseg>
  </trk>` : ''}
</gpx>`;
    
    downloadFile(gpx, 'gps_data.gpx', 'application/gpx+xml');
  }, [savedPoints, trackPoints]);

  /**
   * Exports saved points as TXT file
   */
  const exportTXT = useCallback(() => {
    const txt = savedPoints.map(point => {
      const utm = convertToUTM(point.lat, point.lng);
      return `${point.name}\t${utm.zone}${utm.letter} ${parseFloat(utm.easting).toFixed(4)}E ${parseFloat(utm.northing).toFixed(4)}N\t${new Date(point.timestamp).toLocaleString()}`;
    }).join('\n');
    
    downloadFile(txt, 'waypoints.txt', 'text/plain');
  }, [savedPoints]);

  /**
   * Helper function to download a file
   */
  const downloadFile = (content: string, filename: string, type: string) => {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  /**
   * Converts lat/lng to UTM coordinates
   */
  const convertToUTM = (lat: number, lng: number): UTMCoordinates => {
    // Constants for UTM conversion
    const a = 6378137; // WGS84 semi-major axis
    const f = 1/298.257223563; // WGS84 flattening
    const k0 = 0.9996; // UTM scale factor
    const e = Math.sqrt(2*f - f*f); // Eccentricity

    const latRad = lat * Math.PI/180;
    const lngRad = lng * Math.PI/180;

    // Calculate zone number and letter
    const zoneNumber = Math.floor((lng + 180)/6) + 1;
    
    // Determine UTM zone letter
    const zoneLetter = lat >= 84 ? 'X' :
                      lat >= 72 ? 'W' :
                      lat >= 64 ? 'V' :
                      lat >= 56 ? 'U' :
                      lat >= 48 ? 'T' :
                      lat >= 40 ? 'S' :
                      lat >= 32 ? 'R' :
                      lat >= 24 ? 'Q' :
                      lat >= 16 ? 'P' :
                      lat >= 8 ? 'N' :
                      lat >= 0 ? 'M' :
                      lat >= -8 ? 'L' :
                      lat >= -16 ? 'K' :
                      lat >= -24 ? 'J' :
                      lat >= -32 ? 'H' :
                      lat >= -40 ? 'G' :
                      lat >= -48 ? 'F' :
                      lat >= -56 ? 'E' :
                      lat >= -64 ? 'D' :
                      lat >= -72 ? 'C' : 'B';

    // Calculate central meridian of zone
    const lambda0 = ((zoneNumber - 1) * 6 - 180 + 3) * Math.PI/180;

    // Calculate UTM parameters
    const N = a/Math.sqrt(1 - e*e*Math.sin(latRad)*Math.sin(latRad));
    const T = Math.tan(latRad)*Math.tan(latRad);
    const C = e*e*Math.cos(latRad)*Math.cos(latRad)/(1 - e*e);
    const A = Math.cos(latRad)*(lngRad - lambda0);

    // Calculate meridional arc
    const M = a*((1 - e*e/4 - 3*e*e*e*e/64 - 5*e*e*e*e*e*e/256)*latRad
                - (3*e*e/8 + 3*e*e*e*e/32 + 45*e*e*e*e*e*e/1024)*Math.sin(2*latRad)
                + (15*e*e*e*e/256 + 45*e*e*e*e*e*e/1024)*Math.sin(4*latRad)
                - (35*e*e*e*e*e*e/3072)*Math.sin(6*latRad));

    // Calculate easting
    const easting = k0*N*(A + (1 - T + C)*A*A*A/6
                        + (5 - 18*T + T*T + 72*C - 58)*A*A*A*A*A/120)
                        + 500000; // 500,000 meter offset for easting

    // Calculate northing
    const northing = k0*(M + N*Math.tan(latRad)*(A*A/2
                        + (5 - T + 9*C + 4*C*C)*A*A*A*A/24
                        + (61 - 58*T + T*T + 600*C - 330)*A*A*A*A*A*A/720));

    // Add 10,000,000 meter offset for southern hemisphere
    const finalNorthing = lat < 0 ? northing + 10000000 : northing;

    return {
      zone: zoneNumber,
      letter: zoneLetter,
      easting: easting.toFixed(4),
      northing: finalNorthing.toFixed(4)
    };
  };

  /**
   * Converts decimal degrees to degrees, minutes, seconds format
   */
  const convertToDMS = (coord: number, type: 'lat' | 'lng') => {
    const absolute = Math.abs(coord);
    const degrees = Math.floor(absolute);
    const minutesNotTruncated = (absolute - degrees) * 60;
    const minutes = Math.floor(minutesNotTruncated);
    const seconds = ((minutesNotTruncated - minutes) * 60).toFixed(2);
    
    const direction = type === 'lat' 
      ? (coord >= 0 ? 'N' : 'S')
      : (coord >= 0 ? 'E' : 'W');
    
    return `${degrees}°${minutes}'${seconds}"${direction}`;
  };

  /**
   * Formats coordinates according to selected coordinate system
   */
  const formatCoordinates = useCallback((coords: Coordinates | null) => {
    if (!coords) return 'Waiting for GPS...';

    switch (coordSystem) {
      case COORD_SYSTEMS.DECIMAL:
        return `${coords.lat.toFixed(6)}°, ${coords.lng.toFixed(6)}°`;
      case COORD_SYSTEMS.DMS:
        return `${convertToDMS(coords.lat, 'lat')} ${convertToDMS(coords.lng, 'lng')}`;
      case COORD_SYSTEMS.UTM: {
        const utm = convertToUTM(coords.lat, coords.lng);
        return `${utm.zone}${utm.letter} ${utm.easting}E ${utm.northing}N`;
      }
      default:
        return `${coords.lat.toFixed(6)}°, ${coords.lng.toFixed(6)}°`;
    }
  }, [coordSystem]);

  /**
   * Copies coordinates to clipboard
   */
  const copyCoordinates = useCallback((coords: Coordinates) => {
    const coordText = formatCoordinates(coords);
    
    navigator.clipboard.writeText(coordText)
      .then(() => {
        setCopyFeedback('Copied!');
        
        // Clear any existing timeout
        if (copyTimeoutRef.current) {
          window.clearTimeout(copyTimeoutRef.current);
        }
        
        // Set new timeout to clear feedback
        copyTimeoutRef.current = window.setTimeout(() => {
          setCopyFeedback(null);
          copyTimeoutRef.current = null;
        }, 2000);
      })
      .catch(err => {
        console.error('Could not copy text: ', err);
        setCopyFeedback('Failed to copy');
      });
  }, [formatCoordinates]);

  /**
   * Searches for coordinates and centers map on them
   */
  const searchCoordinates = useCallback(() => {
    // Parse different coordinate formats
    try {
      let lat, lng;
      
      // Check if it's a decimal degrees format (e.g., 40.7128, -74.0060)
      if (searchQuery.includes(',')) {
        const parts = searchQuery.split(',').map(part => parseFloat(part.trim()));
        if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
          [lat, lng] = parts;
        }
      } 
      // Check if it's a UTM format (e.g., 18T 585628E 4511322N)
      else if (/\d+[A-Z]\s+\d+(\.\d+)?E\s+\d+(\.\d+)?N/i.test(searchQuery)) {
        setCopyFeedback('UTM format search is not supported yet');
        return;
      }
      // Check if it's a DMS format (e.g., 40°42'46"N 74°00'21"W)
      else if (searchQuery.includes('°')) {
        setCopyFeedback('DMS format search is not supported yet');
        return;
      }
      
      if (lat !== undefined && lng !== undefined) {
        if (mapRef.current) {
          // Remove previous search marker if exists
          if (searchMarkerRef.current) {
            searchMarkerRef.current.remove();
          }
          
          // Add new marker
          searchMarkerRef.current = L.marker([lat, lng], {
            icon: L.divIcon({
              className: 'search-marker',
              html: '<div class="search-pin"></div>',
              iconSize: [24, 24],
              iconAnchor: [12, 24]
            })
          }).addTo(mapRef.current);
          
          // Fly to location
          mapRef.current.flyTo([lat, lng], 16);
          
          // Disable location following
          setIsFollowingLocation(false);
          
          // Close search
          setShowSearch(false);
        }
      } else {
        setCopyFeedback('Invalid format. Use: lat, lng');
      }
    } catch (error) {
      console.error('Search error:', error);
      setCopyFeedback('Invalid format. Use: lat, lng');
    }
  }, [searchQuery]);

  /**
   * Clears the current track
   */
  const clearTrack = useCallback(() => {
    if (!confirm('Are you sure you want to clear the current track?')) return;
    
    setTrackPoints([]);
    if (trackLineRef.current && mapRef.current) {
      trackLineRef.current.remove();
      trackLineRef.current = null;
    }
  }, []);

  /**
   * Centers the map on current location
   */
  const centerOnCurrentLocation = useCallback(() => {
    if (!currentCoords || !mapRef.current) return;
    
    mapRef.current.flyTo([currentCoords.lat, currentCoords.lng], 18, {
      duration: 1
    });
    setIsFollowingLocation(true);
  }, [currentCoords]);

  // ===== MEMOIZED UI ELEMENTS =====
  
  /**
   * Accuracy indicator with color based on GPS accuracy
   */
  const accuracyIndicator = useMemo(() => {
    return (
      <div className={`w-2 h-2 rounded-full ${
        accuracy === null ? 'bg-red-500' :
        accuracy <= 5 ? 'bg-green-500' :
        accuracy <= 10 ? 'bg-yellow-500' :
        'bg-red-500'
      }`} />
    );
  }, [accuracy]);

  /**
   * Renders the mobile menu
   */
  const renderMobileMenu = () => (
    showMenu && (
      <div className="absolute top-0 left-0 z-10 h-screen w-64 bg-black bg-opacity-95 p-4 md:hidden">
        <div className="mt-12 space-y-4">
          <h1 className="text-xl flex items-center gap-2 mb-6">
            <Navigation className="w-5 h-5" />
            GPS Tracker
          </h1>
          
          {/* Coordinate System Selector */}
          <div className="space-y-2">
            <label className="block text-sm">Coordinate System</label>
            <select 
              className="w-full bg-black border border-green-500 px-2 py-1 text-sm rounded"
              value={coordSystem}
              onChange={(e) => setCoordSystem(e.target.value)}
            >
              <option value={COORD_SYSTEMS.DECIMAL}>Decimal</option>
              <option value={COORD_SYSTEMS.DMS}>DMS</option>
              <option value={COORD_SYSTEMS.UTM}>UTM</option>
            </select>
          </div>
          
          {/* Map Layer Toggle */}
          <button
            className="w-full flex items-center justify-center gap-2 border border-green-500 px-3 py-2 text-sm rounded"
            onClick={() => {
              setActiveLayer(activeLayer === MAP_LAYERS.STREETS ? MAP_LAYERS.SATELLITE : MAP_LAYERS.STREETS);
              setShowMenu(false);
            }}
          >
            <Layers className="w-4 h-4" />
            {activeLayer === MAP_LAYERS.STREETS ? 'Streets' : 'Satellite'}
          </button>
          
          {/* Save Point Button */}
          <button
            className="w-full flex items-center justify-center gap-2 border border-green-500 px-3 py-2 text-sm rounded"
            onClick={() => {
              saveCurrentPoint();
              setShowMenu(false);
            }}
          >
            <Save className="w-4 h-4" />
            Save Point
          </button>
          
          {/* Points List Button */}
          <button
            className="w-full flex items-center justify-center gap-2 border border-green-500 px-3 py-2 text-sm rounded"
            onClick={() => {
              setShowPointsList(!showPointsList);
              setShowMenu(false);
            }}
          >
            <List className="w-4 h-4" />
            Points List
          </button>
          
          {/* Track Path Toggle */}
          <button
            className={`w-full flex items-center justify-center gap-2 border border-green-500 px-3 py-2 text-sm rounded ${trackingEnabled ? 'bg-green-900' : ''}`}
            onClick={() => {
              setTrackingEnabled(!trackingEnabled);
              setShowMenu(false);
            }}
          >
            <MapIcon className="w-4 h-4" />
            {trackingEnabled ? 'Tracking On' : 'Track Path'}
          </button>
          
          {/* Clear Track Button (only shown if there are track points) */}
          {trackPoints.length > 0 && (
            <button
              className="w-full flex items-center justify-center gap-2 border border-green-500 px-3 py-2 text-sm rounded"
              onClick={() => {
                clearTrack();
                setShowMenu(false);
              }}
            >
              <RotateCcw className="w-4 h-4" />
              Clear Track
            </button>
          )}
          
          {/* Center on Location Button */}
          <button
            className={`w-full flex items-center justify-center gap-2 border border-green-500 px-3 py-2 text-sm rounded ${isFollowingLocation ? 'bg-green-900' : ''}`}
            onClick={() => {
              centerOnCurrentLocation();
              setShowMenu(false);
            }}
          >
            <Compass className="w-4 h-4" />
            Center on Location
          </button>
          
          {/* Current Position Display */}
          <div className="border-t border-green-500 pt-4 mt-4">
            <div className="text-sm mb-2">Current Position:</div>
            <div className="text-sm font-bold break-all flex items-center justify-between">
              <span className="mr-2">{formatCoordinates(currentCoords)}</span>
              <button 
                onClick={() => currentCoords && copyCoordinates(currentCoords)}
                className="p-1 hover:bg-green-900 rounded"
                title="Copy coordinates"
              >
                <Copy className="w-4 h-4" />
              </button>
            </div>
            <div className="flex items-center gap-2 mt-2 text-sm">
              <span>{elevation !== null ? `${elevation.toFixed(1)}m` : 'N/A'}</span>
              {accuracyIndicator}
              <span>{accuracy !== null ? `±${accuracy.toFixed(1)}m` : 'No GPS'}</span>
            </div>
          </div>
        </div>
      </div>
    )
  );

  /**
   * Renders the desktop toolbar
   */
  const renderDesktopToolbar = () => (
    <div className="absolute top-0 left-0 right-0 z-10 bg-black bg-opacity-90 p-4 hidden md:flex items-center justify-between">
      <div className="flex items-center gap-4">
        {/* App Title */}
        <h1 className="text-xl flex items-center gap-2">
          <Navigation className="w-5 h-5" />
          GPS Tracker
        </h1>
        
        {/* Coordinate System Selector */}
        <select 
          className="bg-black border border-green-500 px-2 py-1 text-sm"
          value={coordSystem}
          onChange={(e) => setCoordSystem(e.target.value)}
        >
          <option value={COORD_SYSTEMS.DECIMAL}>Decimal</option>
          <option value={COORD_SYSTEMS.DMS}>DMS</option>
          <option value={COORD_SYSTEMS.UTM}>UTM</option>
        </select>
        
        {/* Map Layer Toggle */}
        <button
          className="flex items-center gap-1 border border-green-500 px-2 py-1 text-sm"
          onClick={() => setActiveLayer(activeLayer === MAP_LAYERS.STREETS ? MAP_LAYERS.SATELLITE : MAP_LAYERS.STREETS)}
        >
          <Layers className="w-4 h-4" />
          {activeLayer === MAP_LAYERS.STREETS ? 'Streets' : 'Satellite'}
        </button>
        
        {/* Save Point Button */}
        <button
          className="flex items-center gap-1 border border-green-500 px-2 py-1 text-sm"
          onClick={saveCurrentPoint}
        >
          <Save className="w-4 h-4" />
          Save Point
        </button>
        
        {/* Points List Button */}
        <button
          className="flex items-center gap-1 border border-green-500 px-2 py-1 text-sm"
          onClick={() => setShowPointsList(!showPointsList)}
        >
          <List className="w-4 h-4" />
          Points List
        </button>
        
        {/* Track Path Toggle */}
        <button
          className={`flex items-center gap-1 border border-green-500 px-2 py-1 text-sm ${trackingEnabled ? 'bg-green-900' : ''}`}
          onClick={() => setTrackingEnabled(!trackingEnabled)}
        >
          <MapIcon className="w-4 h-4" />
          {trackingEnabled ? 'Tracking On' : 'Track Path'}
        </button>
        
        {/* Clear Track Button (only shown if there are track points) */}
        {trackPoints.length > 0 && (
          <button
            className="flex items-center gap-1 border border-green-500 px-2 py-1 text-sm"
            onClick={clearTrack}
          >
            <RotateCcw className="w-4 h-4" />
            Clear Track
          </button>
        )}
        
        {/* Center on Location Button */}
        <button
          className={`flex items-center gap-1 border border-green-500 px-2 py-1 text-sm ${isFollowingLocation ? 'bg-green-900' : ''}`}
          onClick={centerOnCurrentLocation}
        >
          <Compass className="w-4 h-4" />
          Center
        </button>
      </div>
      
      {/* Current Position Display */}
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <MapIcon className="w-4 h-4" />
          <span className="text-sm font-bold">{formatCoordinates(currentCoords)}</span>
          <button 
            onClick={() => currentCoords && copyCoordinates(currentCoords)}
            className="p-1 hover:bg-green-900 rounded"
            title="Copy coordinates"
          >
            <Copy className="w-4 h-4" />
          </button>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <span>{elevation !== null ? `${elevation.toFixed(1)}m` : 'N/A'}</span>
          {accuracyIndicator}
          <span>{accuracy !== null ? `±${accuracy.toFixed(1)}m` : 'No GPS'}</span>
        </div>
      </div>
    </div>
  );

  /**
   * Renders the points list panel
   */
  const renderPointsList = () => (
    showPointsList && (
      <div className="absolute top-0 right-0 bottom-0 z-10 bg-black bg-opacity-90 p-4 border-l border-green-500 w-80 md:top-20 md:bottom-auto md:rounded-lg md:border overflow-hidden flex flex-col">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-lg">Saved Points</h2>
          <div className="flex gap-2">
            {/* Export Buttons */}
            <button
              className="flex items-center gap-1 border border-green-500 px-2 py-1 text-sm"
              onClick={exportGPX}
            >
              <Download className="w-4 h-4" />
              GPX
            </button>
            <button
              className="flex items-center gap-1 border border-green-500 px-2 py-1 text-sm"
              onClick={exportTXT}
            >
              <Download className="w-4 h-4" />
              TXT
            </button>
            {/* Close Button (Mobile Only) */}
            <button
              onClick={() => setShowPointsList(false)}
              className="md:hidden p-1 border border-green-500 rounded"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
        
        {/* Points List */}
        <div className="flex-1 overflow-y-auto">
          {savedPoints.length === 0 ? (
            <div className="text-center py-4 text-green-400 opacity-70">
              No saved points yet
            </div>
          ) : (
            savedPoints.map((point) => (
              <div key={point.id} className="border-t border-green-500 first:border-t-0 py-2">
                {/* Point Name and Delete Button */}
                <div className="font-bold flex justify-between">
                  <span>{point.name}</span>
                  <button 
                    onClick={() => deletePoint(point.id)}
                    className="text-red-500 hover:text-red-400 p-1"
                    title="Delete point"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
                
                {/* Point Coordinates and Copy Button */}
                <div className="text-sm flex justify-between items-center">
                  <span className="truncate mr-2">{formatCoordinates({ lat: point.lat, lng: point.lng })}</span>
                  <button 
                    onClick={() => copyCoordinates({ lat: point.lat, lng: point.lng })}
                    className="p-1 hover:bg-green-900 rounded flex-shrink-0"
                    title="Copy coordinates"
                  >
                    <Copy className="w-4 h-4" />
                  </button>
                </div>
                
                {/* Timestamp */}
                <div className="text-xs opacity-75">
                  {new Date(point.timestamp).toLocaleString()}
                </div>
                
                {/* Go to Button */}
                <div className="mt-1 flex gap-1">
                  <button 
                    onClick={() => {
                      if (mapRef.current) {
                        mapRef.current.flyTo([point.lat, point.lng], 18);
                        setIsFollowingLocation(false);
                        setShowPointsList(false);
                      }
                    }}
                    className="text-xs border border-green-500 px-2 py-1 rounded hover:bg-green-900"
                  >
                    Go to
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    )
  );

  return (
    <div className="h-screen flex flex-col bg-black text-green-500 font-mono relative container">
      {/* Mobile Menu Button */}
      <button
        onClick={() => setShowMenu(!showMenu)}
        className="absolute top-4 left-4 z-20 md:hidden bg-black bg-opacity-90 p-2 rounded-full border border-green-500"
      >
        {showMenu ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
      </button>

      {/* Search Button */}
      <button
        onClick={() => setShowSearch(!showSearch)}
        className="searchButton"
      >
        <Search className="w-6 h-6" />
      </button>

      {/* Center on Location Button (Mobile) */}
      <button
        onClick={centerOnCurrentLocation}
        className={`absolute bottom-24 right-4 z-20 bg-black bg-opacity-90 p-3 rounded-full border ${isFollowingLocation ? 'border-green-500 bg-green-900' : 'border-green-500'}`}
        title="Center on current location"
      >
        <Compass className="w-6 h-6" />
      </button>

      {/* Quick Save Button (Mobile) */}
      <button
        onClick={saveCurrentPoint}
        className="absolute bottom-8 right-4 z-20 bg-black bg-opacity-90 p-3 rounded-full border border-green-500"
        title="Save current point"
      >
        <Zap className="w-6 h-6" />
      </button>

      {/* Search Panel */}
      {showSearch && (
        <div className="absolute top-16 left-4 right-4 z-20 bg-black bg-opacity-90 p-4 rounded-lg border border-green-500">
          <div className="flex items-center gap-2">
            <input
              type="text"
              placeholder="Enter coordinates (e.g., 40.7128, -74.0060)"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="flex-1 bg-black border border-green-500 px-3 py-2 text-sm rounded"
              onKeyDown={(e) => e.key === 'Enter' && searchCoordinates()}
              autoFocus
            />
            <button
              onClick={searchCoordinates}
              className="bg-green-900 border border-green-500 px-3 py-2 rounded"
            >
              <Search className="w-5 h-5" />
            </button>
          </div>
        </div>
      )}

      {/* Feedback Toast */}
      {copyFeedback && (
        <div className="absolute top-20 left-1/2 transform -translate-x-1/2 z-50 bg-green-900 text-green-100 px-4 py-2 rounded-lg border border-green-500">
          {copyFeedback}
        </div>
      )}

      {/* Desktop Toolbar */}
      {renderDesktopToolbar()}

      {/* Mobile Menu */}
      {renderMobileMenu()}

      {/* Mobile Status Bar */}
      <div className="absolute bottom-0 left-0 right-0 z-10 bg-black bg-opacity-90 p-2 border-t border-green-500 md:hidden flex items-center justify-between">
        <div className="flex items-center gap-2 text-xs">
          <MapIcon className="w-3 h-3" />
          <span className="truncate max-w-[150px]">{formatCoordinates(currentCoords)}</span>
        </div>
        <div className="flex items-center gap-2 text-xs">
          {accuracyIndicator}
          <span>{accuracy !== null ? `±${accuracy.toFixed(1)}m` : 'No GPS'}</span>
        </div>
      </div>

      {/* Points List Panel */}
      {renderPointsList()}

      {/* Map */}
      <div id="map" className="flex-1 z-0" />
    </div>
  );
}

export default App;