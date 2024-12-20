import json
import os
import time
import uuid
from datetime import datetime
from typing import List, Optional

import geopandas as gpd
import networkx as nx
import osmnx as ox
import pytz
from dotenv import load_dotenv
from flask import Flask, render_template, request, jsonify, session, make_response
from shapely import wkt
from shapely.geometry import Point, LineString
from sqlalchemy import create_engine, text
from sqlalchemy.exc import SQLAlchemyError

load_dotenv()
cet = pytz.timezone('CET')

app = Flask(__name__)
# app.config['APPLICATION_ROOT'] = '/gta_project'
app.secret_key = os.getenv('SECRET_KEY')

# Cache for the graph
graph_cache = None
last_obstacles_update_time = datetime.min


def fetch_data() -> (gpd.GeoDataFrame, gpd.GeoDataFrame, gpd.GeoDataFrame):
    """
    Fetch data from the PostgreSQL database.

    This function connects to the PostgreSQL database and retrieves data for nodes, edges, and obstacles.
    It returns the data as GeoDataFrames.

    Returns:
        Tuple[gpd.GeoDataFrame, gpd.GeoDataFrame, gpd.GeoDataFrame]: A tuple containing the nodes, edges, and obstacles data as GeoDataFrames.
    """
    engine = create_engine(
        f"postgresql://{os.getenv('DB_USER')}:{os.getenv('DB_PASSWORD')}@{os.getenv('DB_HOST')}/{os.getenv('DB_NAME')}"
    )

    nodes_gdf = gpd.read_postgis("SELECT * FROM gta_p1.zurich_nodes", engine, geom_col='geometry', index_col='osmid')
    edges_gdf = gpd.read_postgis("SELECT * FROM gta_p1.zurich_edges", engine, geom_col='geometry',
                                 index_col=['u', 'v', 'key'])
    obstacles_gdf = gpd.read_postgis("SELECT * FROM gta_p1.obstacles", engine, geom_col='geom', index_col='id')
    print("Retrieving data from database DONE!")
    return nodes_gdf, edges_gdf, obstacles_gdf


def create_graph(nodes: gpd.GeoDataFrame, edges: gpd.GeoDataFrame, obstacles: gpd.GeoDataFrame) -> nx.MultiDiGraph:
    """
    Create a graph from nodes, edges, and obstacles data.

    This function constructs a graph using the provided nodes and edges data.
    It then iterates through the obstacles data, finds the nearest edge for each obstacle,
    and adjusts the 'gain' attribute of the edge based on the severity of the obstacle.

    Args:
        nodes (gpd.GeoDataFrame): GeoDataFrame containing the nodes data.
        edges (gpd.GeoDataFrame): GeoDataFrame containing the edges data.
        obstacles (gpd.GeoDataFrame): GeoDataFrame containing the obstacles data.

    Returns:
        nx.MultiDiGraph: The constructed graph with updated 'gain' attributes for edges.
    """
    G = ox.graph_from_gdfs(nodes, edges)

    for _, obstacle in obstacles.iterrows():
        point = obstacle['geom']
        severity = obstacle['severity']
        nearest_edge = ox.nearest_edges(G, point.x, point.y)
        u, v, key = nearest_edge
        if G.has_edge(u, v, key):
            G[u][v][key]['gain'] = G[u][v][key]['gain'] + (severity / 5)

    print("Building graph DONE!")
    return G


def has_obstacles_updated(last_update_time: datetime) -> bool:
    """
    Check if the obstacles have been updated since the last update time.

    This function connects to the PostgreSQL database and checks the maximum timestamp
    of the obstacles. If the timestamp is greater than the provided last update time,
    it indicates that the obstacles have been updated.

    Args:
        last_update_time (datetime): The timestamp of the last obstacles update.

    Returns:
        bool: True if the obstacles have been updated, False otherwise.
    """
    engine = create_engine(
        f"postgresql://{os.getenv('DB_USER')}:{os.getenv('DB_PASSWORD')}@{os.getenv('DB_HOST')}/{os.getenv('DB_NAME')}")
    query = text("SELECT MAX(timestamp) FROM gta_p1.obstacles")
    with engine.connect() as conn:
        result = conn.execute(query).scalar()
        if result and result > last_update_time:
            return True
    return False


# Add this function to initialize the graph at startup
def initialize_graph():
    """
    Initialize the graph at startup.

    This function fetches the latest data for nodes, edges, and obstacles,
    creates a new graph, updates the graph cache, and sets the last obstacles update time to the current time.
    It is intended to be called at the application startup to ensure the graph is ready for use.

    Globals:
        graph_cache (nx.MultiDiGraph): The cached graph.
        last_obstacles_update_time (datetime): The timestamp of the last obstacles update.

    Returns:
        None
    """
    global graph_cache
    global last_obstacles_update_time

    nodes, edges, obstacles = fetch_data()
    graph_cache = create_graph(nodes, edges, obstacles)
    last_obstacles_update_time = datetime.now()
    print("Graph initialized at startup")


def get_cached_graph() -> nx.MultiDiGraph:
    """
    Retrieve the cached graph or create a new one if necessary.

    This function checks if the graph cache is empty or if the obstacles have been updated since the last cache update.
    If either condition is true, it fetches the latest data, creates a new graph, and updates the cache and the last update time.
    Otherwise, it returns the cached graph.

    Returns:
        nx.MultiDiGraph: The cached or newly created graph.
    """
    global graph_cache
    global last_obstacles_update_time

    if graph_cache is None or has_obstacles_updated(last_obstacles_update_time):
        nodes, edges, obstacles = fetch_data()
        graph_cache = create_graph(nodes, edges, obstacles)
        last_obstacles_update_time = datetime.now()
    return graph_cache


def find_shortest_path(G: nx.MultiDiGraph, start_lon: float, start_lat: float, end_lon: float, end_lat: float) -> \
        Optional[List[int]]:
    """
    Find the shortest path between two points.

    This function calculates the shortest path between the start and end coordinates
    using the provided graph.

    Args:
        G (nx.MultiDiGraph): The graph representing the network.
        start_lon (float): The longitude of the start point.
        start_lat (float): The latitude of the start point.
        end_lon (float): The longitude of the end point.
        end_lat (float): The latitude of the end point.

    Returns:
        Optional[List[int]]: A list of node IDs representing the shortest path, or None if no path is found.
    """
    try:
        print(f"Start coordinates: ({start_lat}, {start_lon})")
        print(f"End coordinates: ({end_lat}, {end_lon})")

        start_node = ox.nearest_nodes(G, start_lon, start_lat)
        print(f"Start node: {start_node}")

        end_node = ox.nearest_nodes(G, end_lon, end_lat)
        print(f"End node: {end_node}")

        path = ox.shortest_path(G, start_node, end_node)
        print(f"Shortest path: {path}")

        return path
    except ValueError as e:
        print(f"Invalid coordinate value: {e}")
        return None
    except nx.NetworkXNoPath:
        print("No path found between the specified nodes")
        return None


def find_shortest_accessible_path(G: nx.MultiDiGraph, start_lon: float, start_lat: float, end_lon: float,
                                  end_lat: float) -> Optional[List[int]]:
    """
    Find the shortest accessible path between two points.

    This function calculates the shortest accessible path between the start and end coordinates
    using the 'gain' attribute as the weight for the edges in the graph.

    Args:
        G (nx.MultiDiGraph): The graph representing the network.
        start_lon (float): The longitude of the start point.
        start_lat (float): The latitude of the start point.
        end_lon (float): The longitude of the end point.
        end_lat (float): The latitude of the end point.

    Returns:
        Optional[List[int]]: A list of node IDs representing the shortest accessible path, or None if no path is found.
    """
    try:
        start_node = ox.nearest_nodes(G, start_lon, start_lat)
        end_node = ox.nearest_nodes(G, end_lon, end_lat)

        path = ox.shortest_path(G, start_node, end_node, weight='gain')
        return path
    except ValueError as e:
        print(f"Invalid coordinate value: {e}")
        return None
    except nx.NetworkXNoPath:
        print("No path found between the specified nodes")
        return None


@app.route('/')
def home():
    """
    Endpoint to render the home page.

    This function handles GET requests to the root URL.
    It initializes the user session with a unique user ID if not already present.
    It also sets the target latitude and longitude in the session to None if not already set.

    Returns:
        Rendered HTML template for the home page.
    """
    user_id = request.cookies.get('user_id')
    if user_id:
        session['user_id'] = user_id
    else:
        user_id = str(uuid.uuid4())
        session['user_id'] = user_id

        engine = create_engine(
            f"postgresql://{os.getenv('DB_USER')}:{os.getenv('DB_PASSWORD')}@{os.getenv('DB_HOST')}/{os.getenv('DB_NAME')}",
            echo=True)
        try:
            with engine.begin() as conn:
                conn.execute(
                    text("INSERT INTO gta_p1.users (uuid) VALUES (:user_id)"
                         ).bindparams(user_id=user_id)
                )
        except SQLAlchemyError as e:
            print(f"Error saving user: {e}")

    if 'target_lat' not in session:
        session['target_lat'] = None
    if 'target_lon' not in session:
        session['target_lon'] = None

    response = make_response(render_template('index.html', time=time))
    response.set_cookie('user_id', session['user_id'], max_age=60 * 60 * 24 * 365)
    return response


@app.route('/start-navigation', methods=['POST'])
def start_navigation():
    """
    Endpoint to find the shortest path.

    This function handles POST requests to find the shortest path between two points.
    It expects JSON data containing the start and end coordinates, start time, and accessibility preference.
    The function retrieves the graph, calculates the shortest path, and stores the calculated path in the session.

    Returns:
        JSON response containing the path coordinates or an error message.
    """
    data = request.json
    start_lat = float(data['start_lat'])
    start_lon = float(data['start_lon'])
    session['target_lat'] = end_lat = float(data['end_lat'])
    session['target_lon'] = end_lon = float(data['end_lon'])
    start_time_utc = datetime.fromisoformat(data['start_time']).astimezone(pytz.utc)  # Convert to UTC
    session['start_time'] = start_time_utc
    accessibility = data['accessibility']

    print(
        f"Received data: {start_lat}, {start_lon}, {end_lat}, {end_lon}, start_time: {session['start_time']}, accessibility: {accessibility}")

    G = get_cached_graph()
    if accessibility:
        print("Finding shortest accessible path")
        path = find_shortest_accessible_path(G, start_lon, start_lat, end_lon, end_lat)
        print("Path: ", path)
    else:
        print("Finding shortest path")
        path = find_shortest_path(G, start_lon, start_lat, end_lon, end_lat)
        print("Path: ", path)

    if path is None:
        return jsonify({'error': 'No path found'}), 404

    path_coords = [{'lat': G.nodes[node]['y'], 'lon': G.nodes[node]['x']} for node in path]
    if 'calculated_path' not in session or not session['calculated_path']:
        session['calculated_path'] = path_coords
        print("The path is: ", path_coords)

    return jsonify({'path': path_coords})


@app.route('/stop-navigation', methods=['POST'])
def stop_navigation():
    """
    Endpoint to stop navigation and save the user's path.

    This function handles POST requests to stop navigation and save the user's path to the database.
    It retrieves the calculated and actual paths, and inserts them into the `user_paths` table.
    The function also clears the session data related to the navigation.

    Returns:
        JSON response indicating the status of the operation.
    """
    data = request.json
    reached_destination = data.get('reachedDestination', False)
    accessibility = data.get('accessibility', False)
    user_id = session.get('user_id')

    # Create a new SQLAlchemy engine instance
    engine = create_engine(
        f"postgresql://{os.getenv('DB_USER')}:{os.getenv('DB_PASSWORD')}@{os.getenv('DB_HOST')}/{os.getenv('DB_NAME')}",
        echo=True)
    try:
        with engine.begin() as conn:
            start_time = session.get('start_time')
            end_time = datetime.now(pytz.utc)  # Use UTC for end time
            print("End time: ", end_time)
            result = conn.execute(
                text(
                    "SELECT ST_AsText(ST_MakeLine(geom)) AS linestring_geom FROM gta_p1.user_trajectories WHERE user_id = :user_id AND timestamp BETWEEN :start_time AND :end_time"
                ).bindparams(user_id=user_id, start_time=start_time, end_time=end_time)
            )
            linestring_wkt = result.scalar()
            actual_line = wkt.loads(linestring_wkt)
            print("-----------------")
            print("Actual path: ", actual_line.wkt)
            print("-----------------")
            if 'calculated_path' in session and session['calculated_path']:
                calculated_path = session['calculated_path']
                calculated_line = LineString([(point['lon'], point['lat']) for point in calculated_path])
                print("-----------------")
                print("Calculated path: ", calculated_line.wkt)
                print("-----------------")
                conn.execute(
                    text(
                        "INSERT INTO gta_p1.user_paths (user_id, calculated_path, actual_path, start_time, end_time, accessible, completed) VALUES (:user_id, ST_GeomFromText(:calculated_path, 4326), ST_GeomFromText(:actual_path, 4326), :start_time, :end_time, :accessible, :completed)"
                    ).bindparams(
                        user_id=user_id,
                        calculated_path=calculated_line.wkt,
                        actual_path=actual_line.wkt,
                        start_time=start_time,
                        end_time=end_time,
                        accessible=accessibility,
                        completed=reached_destination
                    )
                )
        print("Start Time: ", start_time)
        print("End Time: ", end_time)
        print("-----------------")
        print("Updated user_paths table")
        print("-----------------")
        print("Actual path: ", actual_line.wkt)
    except SQLAlchemyError as e:
        print(f"Error saving path: {e}")
        return jsonify({'status': 'error'})

    # Clear session data related to the navigation
    session.pop('calculated_path', None)
    session.pop('actual_path', None)
    session.pop('start_time', None)
    session.pop('target_lat', None)
    session.pop('target_lon', None)

    return jsonify({'status': 'success'})


@app.route('/save-location', methods=['POST'])
def save_location():
    """
    Endpoint to save the user's current location.

    This function handles POST requests to save the user's current location to the database.
    It expects JSON data containing latitude and longitude of the location.
    The location is then inserted into the `user_trajectories` table in the database.

    Returns:
        JSON response indicating the status of the operation.
    """
    data = request.json
    user_id = session['user_id']
    lat = data['lat']
    lon = data['lon']

    # Create a new SQLAlchemy engine instance
    engine = create_engine(
        f"postgresql://{os.getenv('DB_USER')}:{os.getenv('DB_PASSWORD')}@{os.getenv('DB_HOST')}/{os.getenv('DB_NAME')}",
        echo=False)

    # Create a Point object from the latitude and longitude
    point = Point(lon, lat)

    try:
        with engine.begin() as conn:
            # Save the current location to the database
            conn.execute(
                text(
                    "INSERT INTO gta_p1.user_trajectories (user_id, geom) VALUES (:user_id, ST_GeomFromText(:geom,4326))"
                ).bindparams(user_id=user_id, geom=point.wkt)
            )
    except SQLAlchemyError as e:
        print(f"Error saving location: {e}")
        return jsonify({'status': 'error'})

    print(f"Location saved for user_id: {user_id}, {point.wkt}.")
    return jsonify({'status': 'success'})


@app.route('/save-obstacle', methods=['POST'])
def add_obstacle():
    """
    Endpoint to save an obstacle.

    This function handles POST requests to save obstacle data to the database.
    It expects JSON data containing latitude, longitude, and severity of the obstacle.
    The obstacle is then inserted into the `obstacles` table in the database.

    Returns:
        JSON response indicating the status of the operation.
    """
    print("I'm getting called")
    data = request.json
    lat = data['lat']
    lon = data['lon']
    severity = data['severity']
    print(f"Received obstacle data: {lat}, {lon}, {severity}")

    # Create a new SQLAlchemy engine instance
    engine = create_engine(
        f"postgresql://{os.getenv('DB_USER')}:{os.getenv('DB_PASSWORD')}@{os.getenv('DB_HOST')}/{os.getenv('DB_NAME')}",
        echo=True)

    # Create a Point object from the latitude and longitude
    point = Point(lon, lat)

    # Insert the obstacle data into the database
    with engine.begin() as conn:
        conn.execute(
            text(
                "INSERT INTO gta_p1.obstacles (geom, severity, user_id) VALUES (ST_GeomFromText(:geom, 4326), :severity, :user_id)"
            ).bindparams(geom=point.wkt, severity=severity, user_id=session['user_id'])
        )

    # Return a success response
    return jsonify({'status': 'success'})


@app.route('/heatmap-data', methods=['GET'])
def heatmap_data():
    """
    Endpoint to retrieve heatmap data.

    This function connects to the PostgreSQL database, executes a query to fetch
    the avoided segments as GeoJSON, and returns the data as a JSON response.

    Returns:
        JSON response containing the avoided segments data or an error message.
    """
    try:
        # Create a new SQLAlchemy engine instance
        engine = create_engine(
            f"postgresql://{os.getenv('DB_USER')}:{os.getenv('DB_PASSWORD')}@{os.getenv('DB_HOST')}/{os.getenv('DB_NAME')}",
            echo=True
        )

        # Execute the query to fetch avoided segments as GeoJSON
        with engine.begin() as conn:
            results = conn.execute(
                text("SELECT ST_AsGeoJSON(avoided_segments) AS avoided_segments FROM gta_p1.avoided_segments"))

        # Retrieve the result as a scalar value

        data = [json.loads(row[0]) for row in results]
        # Return the data as a JSON response
        return jsonify(data)
    except Exception as e:
        # Return an error message in case of an exception
        return jsonify({'error': str(e)}), 500


def create_app():
    initialize_graph()
    return app


if __name__ == '__main__':
    initialize_graph()
    app.run()
