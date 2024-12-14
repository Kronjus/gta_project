// Initialisiere die Karte und setze den Fokus auf Zürich
const map = L.map('map').setView([47.3769, 8.5417], 13);

// Füge OpenStreetMap-Tiles hinzu
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '© OpenStreetMap contributors'
}).addTo(map);


// Benutzerdefiniertes Icon laden
const obstacleIcon = L.icon({
    iconUrl: "./static/obstacle_icon.svg", // Icon-Pfad im selben Verzeichnis
    iconSize: [25, 25],          // Größe des Icons
    iconAnchor: [12, 12]         // Position des Ankers
});

document.getElementById('navigation-button').addEventListener('click', () => {
    getLocations();
});

// Get the modal
const modal = document.getElementById('obstacle-modal');

// Get the button that opens the modal
const obstacleBtn = document.getElementById('obstacle');

// Get the <span> element that closes the modal
const span = document.getElementsByClassName('close')[0];

// Get the submit button
const submitBtn = document.getElementById('submit-obstacle');

// When the user clicks on <span> (x), close the modal
span.onclick = function () {
    modal.style.display = 'none';
};

// When the user clicks on the button, open the modal
obstacleBtn.onclick = function () {
    modal.style.display = 'block';
};

// When the user clicks anywhere outside of the modal, close it
window.onclick = function (event) {
    if (event.target === modal) {
        modal.style.display = 'none';
    }
};

// When the user clicks on the submit button, record the obstacle
submitBtn.addEventListener('click', () => {
    const severity = document.getElementById('severity').value;
    if (severity < 1 || severity > 5) {
        alert('Bitte wähle eine Schweregrad zwischen 1 und 5 aus.');
        return;
    }
    recordObstacle(severity);
    modal.style.display = 'none';
});

// Hindernis hinzufügen
function recordObstacle(severity) {
    if ("geolocation" in navigator) {
        navigator.geolocation.getCurrentPosition(
            (position) => {
                const lat = position.coords.latitude;
                const lon = position.coords.longitude;

                // Send the obstacle location to the server
                fetch('/save-obstacle', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        lat: lat,
                        lon: lon,
                        severity: severity,
                    }),
                }).then(response => {
                    if (!response.ok) {
                        throw new Error('Network response was not ok');
                    }
                    return response.json();
                }).then(data => {
                    if (data.error) {
                        console.error('Error saving obstacle:', data.error);
                        alert('Error saving obstacle: ' + data.error);
                    } else {
                        // Add a marker for the obstacle
                        L.marker([lat, lon], {icon: obstacleIcon}).addTo(map).bindPopup('Hindernis').openPopup();
                    }
                }).catch(error => {
                    console.error('Error saving obstacle:', error);
                    alert('Error saving obstacle: ' + error.message);
                });
            },
            (error) => {
                console.error('Error getting current location:', error.message);
            },
            {
                enableHighAccuracy: false,
                maximumAge: 0,
                timeout: Infinity, // Set a timeout of 5 seconds
            }
        );
    } else {
        console.warn('Geolocation is not supported by this browser.');
    }
}

// Function to calculate the distance between two coordinates in meters
function calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371e3; // Earth radius in meters
    const φ1 = lat1 * Math.PI / 180;
    const φ2 = lat2 * Math.PI / 180;
    const Δφ = (lat2 - lat1) * Math.PI / 180;
    const Δλ = (lon2 - lon1) * Math.PI / 180;

    const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
        Math.cos(φ1) * Math.cos(φ2) *
        Math.sin(Δλ / 2) * Math.sin(Δλ / 2);

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c; // Distance in meters
}

let watchId = null;
let isNavigating = false;

document.getElementById('navigation-button').addEventListener('click', () => {
    if (!isNavigating) {
        isNavigating = true;
        startNavigation();
    }
});

document.getElementById('stop-navigation').addEventListener('click', () => {
    if (isNavigating) {
        isNavigating = false;
        stopNavigation();
    }
});

function startNavigation() {
    const searchInput = document.getElementById('search-input');
    const destination = searchInput.value.trim();

    if (!destination) {
        alert("Please enter a destination.");
        return;
    }

    if ("geolocation" in navigator) {
        navigator.geolocation.getCurrentPosition(
            (position) => {
                const startLat = position.coords.latitude;
                const startLon = position.coords.longitude;

                const geocodeUrl = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(destination)}`;

                fetch(geocodeUrl)
                    .then(response => response.json())
                    .then(data => {
                        if (data.length > 0) {
                            const targetLat = data[0].lat;
                            const targetLon = data[0].lon;
                            updatePath(startLat, startLon, targetLat, targetLon);
                        }
                    })
                    .catch(error => {
                        console.error("Error fetching geocode data:", error);
                        alert("There was a problem searching for the destination.");
                    });
            },
            (error) => {
                console.error('Error getting current location:', error.message);
            },
            {
                enableHighAccuracy: true,
                maximumAge: 0,
                timeout: Infinity,
            }
        );
    } else {
        console.warn('Geolocation is not supported by this browser.');
    }
}

function updatePath(startLat, startLon, endLat, endLon) {
    fetch('/shortest-path', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            start_lat: startLat,
            start_lon: startLon,
            end_lat: endLat,
            end_lon: endLon,
            accessibility: document.getElementById('accessibility-switch').checked,
        }),
    })
        .then(response => {
            if (!response.ok) {
                throw new Error('Network response was not ok');
            }
            return response.json();
        })
        .then(data => {
            if (data.error) {
                console.error('Error fetching shortest path:', data.error);
                alert('Error fetching shortest path: ' + data.error);
                return;
            }

            const path = data.path;
            if (!Array.isArray(path) || path.length === 0) {
                throw new Error('Invalid path data');
            }

            // Use the path data to create a polyline on the map
            const latlngs = path.map(node => [node.lat, node.lon]);
            L.polyline(latlngs, {color: 'blue'}).addTo(map);

            // Start recording the user's trajectory
            startRecordingTrajectory();
        })
        .catch(error => {
            console.error('Error fetching shortest path:', error);
            alert('Error fetching shortest path: ' + error.message);
        });
}

function startRecordingTrajectory() {
    if ("geolocation" in navigator) {
        watchId = navigator.geolocation.watchPosition(
            (position) => {
                const lat = position.coords.latitude;
                const lon = position.coords.longitude;

                fetch('/save-location', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        lat: lat,
                        lon: lon,
                    }),
                }).catch(error => {
                    console.error('Error saving location:', error);
                });

                // Marker for the current location
                if (!map.currentLocationMarker) {
                    map.currentLocationMarker = L.marker([lat, lon], {icon: locationIcon}).addTo(map);
                    map.setView([lat, lon], 15);
                } else {
                    map.currentLocationMarker.setLatLng([lat, lon]);
                }
            },
            (error) => {
                console.error('Error getting current location:', error.message);
            },
            {
                enableHighAccuracy: true,
                maximumAge: 0,
                timeout: 10000,
            }
        );
    } else {
        console.warn("Geolocation is not supported by this browser.");
    }
}

function stopRecordingTrajectory() {
    if (watchId !== null) {
        navigator.geolocation.clearWatch(watchId);
        watchId = null;
    }
}

function stopNavigation() {
    stopRecordingTrajectory();
    // Additional logic to handle stopping navigation, e.g., clearing the map
    if (map.currentLocationMarker) {
        map.removeLayer(map.currentLocationMarker);
        map.currentLocationMarker = null;
    }

    // Call the stop-navigation endpoint
    fetch('/stop-navigation', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
    }).then(response => {
        if (!response.ok) {
            throw new Error('Network response was not ok');
        }
        return response.json();
    }).then(data => {
        if (data.status !== 'success') {
            console.error('Error stopping navigation:', data);
            alert('Error stopping navigation: ' + data.status);
        }
    }).catch(error => {
        console.error('Error stopping navigation:', error);
        alert('Error stopping navigation: ' + error.message);
    });
}

let targetLat = null;
let targetLon = null;


let currentPathLayer = null; // Store the current path layer
// Hole aktuelle Position und Zielort
function getLocations() {
    console.log('Getting current location and destination...');
    const searchInput = document.getElementById('search-input');
    const destination = searchInput.value.trim();
    console.log('Destination:', destination);

    if (!destination) {
        alert("Please enter a destination.");
        return;
    }

    if ("geolocation" in navigator) {
        navigator.geolocation.getCurrentPosition(
            (position) => {
                const startLat = position.coords.latitude;
                const startLon = position.coords.longitude;
                console.log('Current location coordinates:', startLat, startLon);

                // Geocode the destination to get its coordinates
                const geocodeUrl = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(destination)}`;
                console.log('Geocode URL:', geocodeUrl);

                fetch(geocodeUrl)
                    .then(response => response.json())
                    .then(data => {
                        if (data.length > 0) {
                            targetLat = data[0].lat;
                            targetLon = data[0].lon;
                            console.log('Destination coordinates:', targetLat, targetLon);
                            updatePath(startLat, startLon, targetLat, targetLon);
                        }
                    })
                    .catch(error => {
                        console.error("Error fetching geocode data:", error);
                        alert("There was a problem searching for the destination.");
                    });
            },
            (error) => {
                console.error('Error getting current location:', error.message);
            },
            {
                enableHighAccuracy: true,
                maximumAge: 0,
                timeout: Infinity,
            }
        );
    } else {
        console.warn('Geolocation is not supported by this browser.');
    }
}

function updatePath(startLat, startLon, endLat, endLon) {
    fetch('/shortest-path', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            start_lat: startLat,
            start_lon: startLon,
            end_lat: endLat,
            end_lon: endLon,
            accessibility: document.getElementById('accessibility-switch').checked,
        }),
    })
        .then(response => {
            if (!response.ok) {
                throw new Error('Network response was not ok');
            }
            return response.json();
        })
        .then(data => {
            if (data.error) {
                console.error('Error fetching shortest path:', data.error);
                alert('Error fetching shortest path: ' + data.error);
                return;
            }

            const path = data.path;
            if (!Array.isArray(path) || path.length === 0) {
                throw new Error('Invalid path data');
            }

            // Clear the existing path if any
            if (currentPathLayer) {
                map.removeLayer(currentPathLayer);
            }

            // Use the path data to create a polyline on the map
            const latlngs = path.map(node => [node.lat, node.lon]);
            currentPathLayer = L.polyline(latlngs, {color: 'blue'}).addTo(map);
        })
        .catch(error => {
            console.error('Error fetching shortest path:', error);
            alert('Error fetching shortest path: ' + error.message);
        });
}

// Watch the user's position and update the path if necessary
navigator.geolocation.watchPosition(
    (position) => {
        const currentLat = position.coords.latitude;
        const currentLon = position.coords.longitude;

        if (targetLat !== null && targetLon !== null) {
            const distanceToTarget = calculateDistance(currentLat, currentLon, targetLat, targetLon);
            if (distanceToTarget > 5) {
                updatePath(currentLat, currentLon, targetLat, targetLon);
            }
        }
    },
    (error) => {
        console.error('Error getting current location:', error.message);
    },
    {
        enableHighAccuracy: true,
        maximumAge: 0,
        timeout: 10000,
    }
);

document.getElementById('stop-navigation').addEventListener('click', () => {
    if (currentPathLayer) {
        map.removeLayer(currentPathLayer);
    }
});

// Zeige Route auf Karte an
function displayPathOnMap(path) {
    if (!path) {
        alert("No path found.");
        return;
    }

    // Clear existing path if any
    if (window.currentPathLayer) {
        map.removeLayer(window.currentPathLayer);
    }

    // Convert path to LatLng coordinates
    const latLngs = path.map(node => [node.lat, node.lon]);

    // Create a polyline and add it to the map
    window.currentPathLayer = L.polyline(latLngs, {color: 'blue'}).addTo(map);

    // Fit the map to the polyline bounds
    map.fitBounds(window.currentPathLayer.getBounds());
}

// Menü-Interaktion sicherstellen
const menuToggle = document.getElementById('menu-toggle');
const sideMenu = document.getElementById('side-menu');
const closeMenu = document.getElementById('close-menu');

menuToggle.addEventListener('click', () => {
    sideMenu.style.width = "250px";
});

closeMenu.addEventListener('click', () => {
    sideMenu.style.width = "0";
});

// Suchleiste - Zielort eingeben
const searchBtn = document.getElementById('search-btn');
const searchInput = document.getElementById('search-input');

searchBtn.addEventListener('click', (event) => {
    const destination = searchInput.value.trim();
    if (destination) {
        findLocation(destination);
    } else {
        alert("Bitte gib einen Zielort ein.");
    }
});

// Add event listener for the Enter key press in the search input field
searchInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
        event.preventDefault(); // Prevent the default action
        const destination = searchInput.value.trim();
        if (destination) {
            findLocation(destination);
        } else {
            alert("Bitte gib einen Zielort ein.");
        }
    }
});
// Add event listener to the search input field
searchInput.addEventListener('input', () => {
    const query = searchInput.value.trim();
    if (query.length > 2) { // Fetch suggestions if input length is greater than 2
        fetchSuggestions(query);
    } else {
        clearSuggestions();
    }
});

// Fetch location suggestions from the Nominatim API
function fetchSuggestions(query) {
    const zurichViewbox = '8.455,47.323,8.617,47.434'; // Bounding box for Zurich (minLon, minLat, maxLon, maxLat)
    const geocodeUrl = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&addressdetails=1&limit=5&viewbox=${zurichViewbox}&bounded=1`;

    fetch(geocodeUrl)
        .then(response => response.json())
        .then(data => {
            displaySuggestions(data);
        })
        .catch(error => {
            console.error("Error fetching location suggestions:", error);
        });
}

// Display the suggestions in a dropdown list
function displaySuggestions(suggestions) {
    clearSuggestions();
    const suggestionsContainer = document.createElement('div');
    suggestionsContainer.id = 'suggestions-container';
    suggestionsContainer.style.position = 'absolute';
    suggestionsContainer.style.backgroundColor = 'white';
    suggestionsContainer.style.border = '1px solid #ccc';
    suggestionsContainer.style.zIndex = '1000';

    // Get the height of the search bar and set the top property
    const searchBarHeight = searchInput.offsetHeight;
    suggestionsContainer.style.top = `${searchBarHeight}px`;

    suggestions.forEach(suggestion => {
        const suggestionItem = document.createElement('div');
        suggestionItem.className = 'suggestion-item';
        suggestionItem.style.padding = '8px';
        suggestionItem.style.cursor = 'pointer';
        suggestionItem.textContent = suggestion.display_name;
        suggestionItem.addEventListener('click', () => {
            searchInput.value = suggestion.display_name;
            clearSuggestions();
        });
        suggestionsContainer.appendChild(suggestionItem);
    });

    searchInput.parentNode.appendChild(suggestionsContainer);
}

// Clear the suggestions dropdown
function clearSuggestions() {
    const existingContainer = document.getElementById('suggestions-container');
    if (existingContainer) {
        existingContainer.remove();
    }
}

let currentMarker = null; // Store the current marker

function findLocation(location) {
    // Geocoding-API verwenden, um den Ort zu suchen (z. B. Nominatim OpenStreetMap API)
    const geocodeUrl = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(location)}`;

    fetch(geocodeUrl)
        .then(response => response.json())
        .then(data => {
            if (data.length > 0) {
                const lat = data[0].lat;
                const lon = data[0].lon;

                // Setze die Karte auf die gefundene Position
                map.setView([lat, lon], 15);

                // Entferne den vorherigen Marker, falls vorhanden
                if (currentMarker) {
                    map.removeLayer(currentMarker);
                }

                // Markiere den Zielort
                currentMarker = L.marker([lat, lon]).addTo(map).bindPopup(`Ziel: ${location}`).openPopup();
            } else {
                alert("Ort nicht gefunden. Bitte überprüfe deine Eingabe.");
            }
        })
        .catch(error => {
            console.error("Fehler beim Abrufen der Geodaten:", error);
            alert("Es gab ein Problem bei der Suche nach dem Zielort.");
        });
}


// Erstelle eine MarkerClusterGroup mit angepassten Cluster-Icons
const markers = L.markerClusterGroup({
    spiderfyOnMaxZoom: false,
    showCoverageOnHover: false,
    zoomToBoundsOnClick: false,
    iconCreateFunction: function (cluster) {
        // Benutzerdefiniertes Cluster-Icon
        return L.divIcon({
            html: `
        <img src="./static/obstacle_icon.svg" style="width: 30px; height: 30px;" />
        <span style="position: absolute; top: 5px; left: 5px; color: white; font-size: 14px;">${cluster.getChildCount()}</span>
      `,
            className: 'custom-cluster-icon',
            iconSize: [40, 40],
            iconAnchor: [20, 20]
        });
    }
});

// Lade die ZueriACT GeoJSON-Daten
fetch('https://www.ogd.stadt-zuerich.ch/wfs/geoportal/ZueriACT_barrierefreie_Mobilitaet?service=WFS&version=1.1.0&request=GetFeature&outputFormat=GeoJSON&typename=zueriact_daten_aufbereitet')
    .then(response => response.json())
    .then(data => {
        L.geoJSON(data, {
            pointToLayer: function (feature, latlng) {
                // Benutze dein benutzerdefiniertes Icon für einzelne Marker
                return L.marker(latlng, {
                    icon: L.icon({
                        iconUrl: "./static/obstacle_icon.svg", // Pfad zu deinem SVG
                        iconSize: [25, 25],
                        iconAnchor: [12, 12]
                    })
                });
            }
        }).addTo(markers);
    })
    .catch(error => console.error('Fehler beim Laden der ZueriACT GeoJSON-Daten:', error));

// Füge den Cluster-Layer zur Karte hinzu
map.addLayer(markers);


//setInterval(updateInfo, 1000); // Aktualisiere jede Sekunde

// Benutzerdefiniertes ausgefülltes Standort-Icon
const locationIcon = L.divIcon({
    className: 'custom-location-icon',
    html: `
    <svg xmlns="http://www.w3.org/2000/svg" width="30" height="30" viewBox="0 0 24 24" fill="#007bff" stroke="#007bff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M12 2a9 9 0 0 1 9 9c0 5.25-9 11-9 11S3 16.25 3 11a9 9 0 0 1 9-9z"></path>
      <circle cx="12" cy="11" r="3" fill="white"></circle>
    </svg>
  `,
    iconSize: [30, 30],
    iconAnchor: [15, 30], // Ankerpunkt am unteren Ende des Symbols
});

// Geolocation aktivieren und Standort tracken
if ("geolocation" in navigator) {
    // Verfolge den Standort in Echtzeit
    navigator.geolocation.watchPosition(
        (position) => {
            const lat = position.coords.latitude;
            const lon = position.coords.longitude;

            // Send the current location to the server
            fetch('/save-location', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    lat: lat,
                    lon: lon,
                }),
            }).catch(error => {
                console.error('Error saving location:', error);
            });

            // Marker for the current location
            if (!map.currentLocationMarker) {
                map.currentLocationMarker = L.marker([lat, lon], {icon: locationIcon}).addTo(map);
                map.setView([lat, lon], 15);
            } else {
                map.currentLocationMarker.setLatLng([lat, lon]);
            }
        },
        (error) => {
            console.error('Error getting current location:', error.message);
        },
        {
            enableHighAccuracy: true,
            maximumAge: 0,
            timeout: 10000,
        }
    );
} else {
    console.warn("Geolocation wird von diesem Browser nicht unterstützt.");
    // Handle the lack of geolocation support silently
}
