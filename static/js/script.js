let watchId = null;
let isNavigating = false;
let targetLat = null;
let targetLon = null;
let currentPathLayer = null; // Store the current path layer
let currentMarker = null; // Store the current marker
let currentLat = null;
let currentLon = null;
let obstaclesLayer = null; // Store the obstacles layer
let pathCalculated = false; // Flag to track if the path has been created
let startTime = null; // Start time for the navigation
let wmsObstaclesLayer = null; // Store the WMS obstacles layer

// Initialize the map and set the view to Zurich
const map = L.map('map').setView([47.3769, 8.5417], 13);

// Add OpenStreetMap tiles
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '© OpenStreetMap contributors'
}).addTo(map);

// Create a MarkerClusterGroup with custom cluster icons
const markers = L.markerClusterGroup({
    spiderfyOnMaxZoom: false,
    showCoverageOnHover: false,
    zoomToBoundsOnClick: false,
    iconCreateFunction: function (cluster) {
        const childMarkers = cluster.getAllChildMarkers();
        const popupContent = childMarkers.map(marker => `<b>Severity:</b> ${marker.feature.properties.severity}`).join('<br>');

        const clusterIcon = L.divIcon({
            html: `
                <img src="./static/images/obstacle_icon.svg" style="width: 30px; height: 30px;" />
                <span style="position: absolute; top: 5px; left: 5px; color: white; font-size: 14px;">${cluster.getChildCount()}</span>
            `,
            className: 'custom-cluster-icon',
            iconSize: [40, 40],
            iconAnchor: [20, 20]
        });

        const clusterMarker = L.marker(cluster.getLatLng(), {icon: clusterIcon});
        clusterMarker.bindPopup(popupContent);

        return clusterIcon;
    }
});

// Benutzerdefiniertes Icon laden
const obstacleIcon = L.icon({
    iconUrl: "./static/images/obstacle_icon.svg", // Icon-Pfad im selben Verzeichnis
    iconSize: [25, 25],          // Größe des Icons
    iconAnchor: [12, 12]         // Position des Ankers
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
    console.log('Recording obstacle with severity:', severity);
    recordObstacle(severity);
    console.log('Obstacle recorded.');
    modal.style.display = 'none';
});

/**
 * Records an obstacle with the specified severity at the current location.
 *
 * This function sends the current latitude and longitude along with the severity
 * of the obstacle to the server. If the obstacle is successfully saved, a marker
 * is added to the map at the obstacle's location.
 *
 * @param {number} severity - The severity of the obstacle (1-5).
 */
function recordObstacle(severity) {
    console.log('Recording obstacle with severity:', severity);
    if (currentLat !== null && currentLon !== null) {
        console.log('Current location coordinates:', currentLat, currentLon);
        // Send the obstacle location to the server
        fetch('/gta_project/save-obstacle', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                lat: currentLat,
                lon: currentLon,
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
                L.marker([currentLat, currentLon], {icon: obstacleIcon}).addTo(map).bindPopup('Hindernis').openPopup();
            }
        }).catch(error => {
            console.error('Error saving obstacle:', error);
            alert('Error saving obstacle: ' + error.message);
        });
    } else {
        console.warn('Current location is not available.');
    }
}

/**
 * Calculates the distance between two coordinates in meters.
 *
 * This function uses the Haversine formula to calculate the great-circle distance
 * between two points on the Earth's surface specified by their latitude and longitude.
 *
 * @param {number} lat1 - The latitude of the first point in degrees.
 * @param {number} lon1 - The longitude of the first point in degrees.
 * @param {number} lat2 - The latitude of the second point in degrees.
 * @param {number} lon2 - The longitude of the second point in degrees.
 * @returns {number} The distance between the two points in meters.
 */
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

document.getElementById('navigation-button').addEventListener('click', () => {
    if (!isNavigating) {
        isNavigating = true;
        startTime = new Date().toISOString();
        startNavigation(startTime);
        startRecordingTrajectory();
        alert("Navigation started.");
    }
});

document.getElementById('stop-navigation').addEventListener('click', () => {
    if (isNavigating) {
        isNavigating = false;
        stopNavigation();
        stopRecordingTrajectory();
        alert("Navigation stopped.");
    }
});

/**
 * Starts the navigation to the specified destination.
 *
 * This function retrieves the destination from the search input field,
 * geocodes it to get the latitude and longitude, and then updates the path
 * from the current location to the destination. If the destination is not
 * provided or the current location is not available, it shows an alert.
 *
 * @param {string} startTime - The start time of the navigation in ISO format.
 */
function startNavigation(startTime) {
    isNavigating = true;
    const searchInput = document.getElementById('search-input');
    const destination = searchInput.value.trim();

    if (!destination) {
        alert("Please enter a destination.");
        return;
    }

    if (currentLat !== null && currentLon !== null) {
        const geocodeUrl = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(destination)}`;

        fetch(geocodeUrl)
            .then(response => response.json())
            .then(data => {
                if (data.length > 0) {
                    targetLat = data[0].lat;
                    targetLon = data[0].lon;
                    if (!pathCalculated) {
                        updatePath(currentLat, currentLon, targetLat, targetLon, startTime);
                    }
                }
            })
            .catch(error => {
                console.error("Error fetching geocode data:", error);
                alert("There was a problem searching for the destination.");
            });
    } else {
        console.warn('Current location is not available.');
    }
}

/**
 * Updates the path from the start location to the end location on the map.
 *
 * This function sends a request to the server to calculate the shortest path
 * between the start and end coordinates. If the path is successfully retrieved,
 * it clears any existing path on the map and draws the new path. If there is an
 * error during the fetch operation or if the server returns an error, an error
 * message is logged to the console and an alert is shown to the user.
 *
 * @param {number} startLat - The latitude of the start location.
 * @param {number} startLon - The longitude of the start location.
 * @param {number} endLat - The latitude of the end location.
 * @param {number} endLon - The longitude of the end location.
 * @param {string} startTime - The start time of the navigation in ISO format.
 */
function updatePath(startLat, startLon, endLat, endLon, startTime) {
    fetch('/gta_project/start-navigation', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            start_lat: startLat,
            start_lon: startLon,
            end_lat: endLat,
            end_lon: endLon,
            start_time: startTime, // Send the start time
            accessibility: document.getElementById('accessibility-switch').checked,
        }),
    })
        .then(response => {
            if (!response.ok) {
                return response.json().then(errorData => {
                    throw new Error(`Server error: ${errorData.message}`);
                });
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

            // Set the pathCalculated flag to true
            pathCalculated = true;
        })
        .catch(error => {
            console.error('Error fetching shortest path:', error);
            alert('Error fetching shortest path: ' + error.message);
        });
}

/**
 * Starts recording the user's trajectory using the Geolocation API.
 *
 * This function watches the user's position and updates the current latitude and longitude.
 * It sends the current location to the server and updates the marker on the map.
 * If the user reaches the destination, it stops the navigation and alerts the user.
 */
function startRecordingTrajectory() {
    if ("geolocation" in navigator) {
        watchId = navigator.geolocation.watchPosition(
            (position) => {
                currentLat = position.coords.latitude;
                currentLon = position.coords.longitude;

                fetch('/gta_project/save-location', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        lat: currentLat,
                        lon: currentLon,
                    }),
                }).catch(error => {
                    console.error('Error saving location:', error);
                });

                // Marker for the current location
                if (!map.currentLocationMarker) {
                    map.currentLocationMarker = L.marker([currentLat, currentLon], {icon: locationIcon}).addTo(map);
                    map.setView([currentLat, currentLon], 15);
                } else {
                    map.currentLocationMarker.setLatLng([currentLat, currentLon]);
                }

                // Check if the user has reached the destination
                if (targetLat !== null && targetLon !== null) {
                    const distanceToTarget = calculateDistance(currentLat, currentLon, targetLat, targetLon);
                    if (distanceToTarget < 5) { // Adjust the threshold as needed
                        stopNavigation(true);
                        alert("You have reached your destination.");
                    }
                }
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
        console.warn("Geolocation is not supported by this browser.");
    }
}

/**
 * Stops recording the user's trajectory using the Geolocation API.
 *
 * This function clears the watch on the user's position if it is currently active,
 * stopping the updates to the current latitude and longitude.
 */
function stopRecordingTrajectory() {
    if (watchId !== null) {
        navigator.geolocation.clearWatch(watchId);
        watchId = null;
    }
}

/**
 * Stops the navigation process and clears the current path on the map.
 *
 * This function resets the navigation state, clears the path calculated flag,
 * removes the current path layer from the map, and sends a request to the server
 * to stop the navigation. If the server responds with an error, it logs the error
 * and shows an alert to the user.
 *
 * @param {boolean} [reachedDestination=false] - Indicates whether the destination was reached.
 */
function stopNavigation(reachedDestination = false) {
    isNavigating = false;
    pathCalculated = false; // Reset the pathCalculated flag
    // Clear the navigation line
    if (currentPathLayer) {
        map.removeLayer(currentPathLayer);
        currentPathLayer = null;
    }

    // Call the stop-navigation endpoint
    fetch('/gta_project/stop-navigation', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            reachedDestination: reachedDestination,
            accessibility: document.getElementById('accessibility-switch').checked
        })
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

document.getElementById('stop-navigation').addEventListener('click', () => {
    if (currentPathLayer) {
        map.removeLayer(currentPathLayer);
    }
});

/**
 * Finds the location of the specified destination and updates the map view.
 *
 * This function takes a destination string, geocodes it to get the latitude and longitude,
 * and then updates the map view to center on the found location. If the location is found,
 * it adds a marker to the map at the location. If the location is not found or there is an error
 * during the geocoding process, it shows an alert to the user.
 *
 * @param {string} destination - The name or address of the destination to find.
 */
function findLocation(destination) {
    if (!destination) {
        alert("Please enter a destination.");
        return;
    }

    const geocodeUrl = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(destination)}`;

    fetch(geocodeUrl)
        .then(response => response.json())
        .then(data => {
            if (data.length > 0) {
                const lat = data[0].lat;
                const lon = data[0].lon;
                map.setView([lat, lon], 15);

                // Add a marker for the found location
                if (currentMarker) {
                    map.removeLayer(currentMarker);
                }
                currentMarker = L.marker([lat, lon]).addTo(map).bindPopup(destination).openPopup();
            } else {
                alert("Location not found.");
            }
        })
        .catch(error => {
            console.error("Error fetching geocode data:", error);
            alert("There was a problem searching for the destination.");
        });
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

/**
 * Fetches location suggestions from the Nominatim API based on the query.
 *
 * This function sends a request to the Nominatim API to search for locations
 * matching the provided query within the specified bounding box for Zurich.
 * The results are limited to 5 suggestions. If the fetch operation is successful,
 * the suggestions are displayed using the `displaySuggestions` function.
 * If there is an error during the fetch operation, an error message is logged to the console.
 *
 * @param {string} query - The search query for the location suggestions.
 */
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

/**
 * Displays the location suggestions in a dropdown list.
 *
 * This function creates a container for the suggestions and positions it
 * below the search input field. It iterates over the suggestions and creates
 * a clickable item for each suggestion. When a suggestion is clicked, it updates
 * the search input field with the selected suggestion and shows the location on the map.
 *
 * @param {Array} suggestions - An array of suggestion objects containing location data.
 */
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
            showLocationOnMap(suggestion);
        });
        suggestionsContainer.appendChild(suggestionItem);
    });

    searchInput.parentNode.appendChild(suggestionsContainer);
}

/**
 * Shows the location on the map based on the provided suggestion.
 *
 * This function takes a suggestion object containing latitude and longitude,
 * centers the map view on the specified location, and adds a marker at that location.
 * If a marker already exists, it removes the existing marker before adding the new one.
 *
 * @param {Object} suggestion - The suggestion object containing location data.
 * @param {number} suggestion.lat - The latitude of the location.
 * @param {number} suggestion.lon - The longitude of the location.
 * @param {string} suggestion.display_name - The display name of the location.
 */
function showLocationOnMap(suggestion) {
    const lat = suggestion.lat;
    const lon = suggestion.lon;
    map.setView([lat, lon], 15);

    // Add a marker for the found location
    if (currentMarker) {
        map.removeLayer(currentMarker);
    }
    currentMarker = L.marker([lat, lon]).addTo(map).bindPopup(suggestion.display_name).openPopup();
}

// Clear the suggestions dropdown
function clearSuggestions() {
    const existingContainer = document.getElementById('suggestions-container');
    if (existingContainer) {
        existingContainer.remove();
    }
}


// Add the markers cluster group to the map
map.addLayer(markers);


/**
 * Shows all obstacles on the map, including both ZueriACT and WMS obstacles.
 *
 * This function fetches and displays obstacles from both the ZueriACT GeoJSON data
 * and the WMS GeoJSON data. It removes any existing obstacles layer before adding
 * the new obstacles to the map.
 */
function showAllObstacles() {
    hideObstacles(); // Ensure any existing obstacles are removed

    // Load the ZueriACT GeoJSON data and add it to the map
    fetch('https://www.ogd.stadt-zuerich.ch/wfs/geoportal/ZueriACT_barrierefreie_Mobilitaet?service=WFS&version=1.1.0&request=GetFeature&outputFormat=GeoJSON&typename=zueriact_daten_aufbereitet')
        .then(response => response.json())
        .then(data => {
            obstaclesLayer = L.geoJSON(data, {
                pointToLayer: function (feature, latlng) {
                    // Use the custom icon for individual markers
                    return L.marker(latlng, {
                        icon: L.icon({
                            iconUrl: "./static/images/obstacle_icon.svg", // Path to your SVG
                            iconSize: [25, 25],
                            iconAnchor: [12, 12]
                        })
                    });
                }
            });
            markers.addLayer(obstaclesLayer); // Add obstacles to the markers cluster group
        })
        .catch(error => console.error('Error loading ZueriACT GeoJSON data:', error));

    // Load the WMS GeoJSON data and add it to the map
    const wmsUrl = 'https://baug-ikg-gis-01.ethz.ch:8443/geoserver/wms';
    const wmsParams = {
        service: 'WFS',
        version: '1.1.0',
        request: 'GetFeature',
        typeName: 'obstacles', // Replace with your actual layer name
        outputFormat: 'application/json'
    };
    const url = `${wmsUrl}?${new URLSearchParams(wmsParams).toString()}`;

    fetch(url)
        .then(response => response.json())
        .then(data => {
            wmsObstaclesLayer = L.geoJSON(data, {
                pointToLayer: function (feature, latlng) {
                    // Use the custom icon for individual markers
                    return L.marker(latlng, {
                        icon: L.icon({
                            iconUrl: "./static/images/obstacle_icon.svg", // Path to your SVG
                            iconSize: [25, 25],
                            iconAnchor: [12, 12]
                        })
                    }).bindPopup(`<b>Severity:</b> ${feature.properties.severity}`);
                }
            });
            markers.addLayer(wmsObstaclesLayer); // Add WMS obstacles to the markers cluster group
        })
        .catch(error => console.error('Error loading WMS GeoJSON data:', error));
}



/**
 * Hides all obstacles from the map.
 *
 * This function removes the obstacles layer from the markers cluster group
 * and sets the obstaclesLayer and wmsObstaclesLayer variables to null.
 */
function hideObstacles() {
    if (obstaclesLayer) {
        markers.removeLayer(obstaclesLayer); // Remove ZueriACT obstacles from the markers cluster group
        obstaclesLayer = null; // Set obstaclesLayer to null
    }
    if (wmsObstaclesLayer) {
        markers.removeLayer(wmsObstaclesLayer); // Remove WMS obstacles from the markers cluster group
        wmsObstaclesLayer = null; // Set wmsObstaclesLayer to null
    }
}

document.getElementById('show-obstacles').addEventListener('change', (event) => {
    if (event.target.checked) {
        showAllObstacles();
    } else {
        hideObstacles();
    }
});

document.getElementById('statistics-link').addEventListener('click', (event) => {
    event.preventDefault();
    showHeatMap();
});

// Add event listener to the map button to clear the heatmap when clicked
document.getElementById('map-button').addEventListener('click', () => {
    if (window.heatmapLayer) {
        map.removeLayer(window.heatmapLayer);
        window.heatmapLayer = null; // Clear the reference to the heatmap layer
    }
});

/**
 * Fetches heatmap data from the server and processes it for use with Leaflet.
 *
 * This function sends a request to the server to retrieve heatmap data in GeoJSON format.
 * It processes the data to convert coordinates from [longitude, latitude] to [latitude, longitude]
 * for compatibility with Leaflet. If there is an error during the fetch operation or if the server
 * returns an error, it logs the error to the console and returns an empty array.
 *
 * @async
 * @function fetchHeatmapData
 * @returns {Promise<Array<Array<number>>>} A promise that resolves to an array of [latitude, longitude] pairs.
 */
async function fetchHeatmapData() {
    try {
        const response = await fetch('/gta_project/heatmap-data');
        const data = await response.json();

        if (data.error) {
            console.error("Error fetching heatmap data:", data.error);
            return [];
        }

        return data.features.map(feature => {
            // Swap [lon, lat] to [lat, lon] for Leaflet
            if (feature.coordinates && Array.isArray(feature.coordinates)) {
                const [lat, lon] = feature.coordinates;
                return [lat, lon];
            }
            console.warn("Invalid feature coordinates:", feature);
            return null; // Filter out invalid features
        }).filter(coord => coord !== null); // Remove null entries
    } catch (error) {
        console.error("Error fetching heatmap data:", error);
        return [];
    }
}

/**
 * Displays a heatmap on the map using data fetched from the server.
 *
 * This function fetches heatmap data asynchronously and displays it on the map
 * using the Leaflet heatmap layer. If there is no heatmap data available, it logs
 * a warning message to the console. Before adding a new heatmap layer, it removes
 * any existing heatmap layer from the map.
 *
 * @async
 * @function showHeatMap
 * @returns {Promise<void>} A promise that resolves when the heatmap is displayed.
 */
async function showHeatMap() {
    const heatmapData = await fetchHeatmapData();
    if (heatmapData.length === 0) {
        console.warn("No heatmap data available.");
        return;
    }

    // Remove any existing heatmap layer before adding a new one
    if (window.heatmapLayer) {
        map.removeLayer(window.heatmapLayer);
    }

    // Create a new heatmap layer
    window.heatmapLayer = L.heatLayer(heatmapData, {
        radius: 25,
        blur: 15,
        maxZoom: 17,
    }).addTo(map);
}


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

document.addEventListener('DOMContentLoaded', (event) => {
    // Check if the cookies_accepted cookie is set
    if (getCookie('cookies_accepted')) {
        // Hide the cookie notification
        document.querySelector('.cookie-notification').style.display = 'none';
    }
});

/**
 * Retrieves the value of a specified cookie by name.
 *
 * This function searches the document's cookies for a cookie with the given name
 * and returns its value. If the cookie is not found, it returns undefined.
 *
 * @param {string} name - The name of the cookie to retrieve.
 * @returns {string|undefined} The value of the cookie, or undefined if not found.
 */
function getCookie(name) {
    const value = `; ${document.cookie}`;
    const parts = value.split(`; ${name}=`);
    if (parts.length === 2) return parts.pop().split(';').shift();
}

// Add event listener to the accept button to handle the click event
document.getElementById('accept-cookies').addEventListener('click', () => {
    // Hide the cookie notification
    document.querySelector('.cookie-notification').style.display = 'none';

    // Set a cookie to remember the user's choice
    document.cookie = "cookies_accepted=true; path=/; max-age=" + (60 * 60 * 24 * 365); // 1 year
});

document.addEventListener('DOMContentLoaded', function() {
    const infoContactLink = document.getElementById('info-contact-link');
    const infoContactDiv = document.getElementById('info-contact');

    infoContactLink.addEventListener('click', function(event) {
        event.preventDefault();
        infoContactDiv.classList.toggle('show');
    });
});

// Geolocation aktivieren und Standort tracken
if ("geolocation" in navigator) {
    navigator.geolocation.watchPosition(
        (position) => {
            currentLat = position.coords.latitude;
            currentLon = position.coords.longitude;

            if (!map.currentLocationMarker) {
                map.currentLocationMarker = L.marker([currentLat, currentLon], {icon: locationIcon}).addTo(map);
                map.setView([currentLat, currentLon], 15);
            } else {
                map.currentLocationMarker.setLatLng([currentLat, currentLon]);
            }

            if (isNavigating && pathCalculated) {
                if (targetLat !== null && targetLon !== null) {
                    const distanceToTarget = calculateDistance(currentLat, currentLon, targetLat, targetLon);
                    if (distanceToTarget <= 10) {
                        stopNavigation();
                    } else if (distanceToTarget > 10) {
                        updatePath(currentLat, currentLon, targetLat, targetLon, startTime);
                    }
                }
            }
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
    console.warn("Geolocation is not supported by this browser.");
}