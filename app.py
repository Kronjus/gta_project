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
from flask import Flask, render_template, request, jsonify, session
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
    engine = create_engine(
        f"postgresql://{os.getenv('DB_USER')}:{os.getenv('DB_PASSWORD')}@{os.getenv('DB_HOST')}/{os.getenv('DB_NAME')}")

    nodes_gdf = gpd.read_postgis("SELECT * FROM gta_p1.zurich_nodes", engine, geom_col='geometry', index_col='osmid')
    edges_gdf = gpd.read_postgis("SELECT * FROM gta_p1.zurich_edges", engine, geom_col='geometry',
                                 index_col=['u', 'v', 'key'])
    obstacles_gdf = gpd.read_postgis("SELECT * FROM gta_p1.obstacles", engine, geom_col='geom', index_col='id')
    print("Retrieving data from database DONE!")
    return nodes_gdf, edges_gdf, obstacles_gdf


def create_graph(nodes: gpd.GeoDataFrame, edges: gpd.GeoDataFrame, obstacles: gpd.GeoDataFrame) -> nx.MultiDiGraph:
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
    global graph_cache
    global last_obstacles_update_time

    nodes, edges, obstacles = fetch_data()
    graph_cache = create_graph(nodes, edges, obstacles)
    last_obstacles_update_time = datetime.now()
    print("Graph initialized at startup")

def get_cached_graph() -> nx.MultiDiGraph:
    global graph_cache
    global last_obstacles_update_time

    if graph_cache is None or has_obstacles_updated(last_obstacles_update_time):
        nodes, edges, obstacles = fetch_data()
        graph_cache = create_graph(nodes, edges, obstacles)
        last_obstacles_update_time = datetime.now()
    return graph_cache


def find_shortest_path(G: nx.MultiDiGraph, start_lon: float, start_lat: float, end_lon: float, end_lat: float) -> \
        Optional[List[int]]:
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
    if 'user_id' not in session:
        session['user_id'] = str(uuid.uuid4())
    if 'target_lat' not in session:
        session['target_lat'] = None
    if 'target_lon' not in session:
        session['target_lon'] = None
    return render_template('index.html', time=time)


@app.route('/shortest-path', methods=['POST'])
def shortest_path():
    print("I'm getting called")
    data = request.json
    start_lat = float(data['start_lat'])
    start_lon = float(data['start_lon'])
    session['target_lat'] = end_lat = float(data['end_lat'])
    session['target_lon'] = end_lon = float(data['end_lon'])
    session['start_time'] = datetime.now()
    accessibility = data['accessibility']

    print(f"Received data: {start_lat}, {start_lon}, {end_lat}, {end_lon}, accessibility: {accessibility}")

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

    # Convert path to list of nodes with lat and lon properties
    path_coords = [{'lat': G.nodes[node]['y'], 'lon': G.nodes[node]['x']} for node in path]
    if 'calculated_path' not in session or not session['calculated_path']:
        session['calculated_path'] = path_coords
        print("The path is: ", path_coords)

    return jsonify({'path': path_coords})


@app.route('/stop-navigation', methods=['POST'])
def stop_navigation():
    data = request.json
    reached_destination = data.get('reachedDestination', False)
    accessibility = data.get('accessibility', False)
    user_id = session.get('user_id')

    engine = create_engine(
        f"postgresql://{os.getenv('DB_USER')}:{os.getenv('DB_PASSWORD')}@{os.getenv('DB_HOST')}/{os.getenv('DB_NAME')}",
        echo=False)
    try:
        with engine.begin() as conn:
            start_time = session.get('start_time')
            end_time = datetime.now(cet)
            end_time = end_time.astimezone(pytz.utc)
            print("End time: ", end_time)
            # Retrieve the trajectory for the specific user within the time interval, converting CET to GMT
            result = conn.execute(
                text(
                    "SELECT ST_AsText(geom) FROM gta_p1.user_trajectories WHERE user_id = :user_id AND timestamp >= :start_time AND timestamp <= :end_time"
                ).bindparams(user_id=user_id, start_time=start_time, end_time=end_time)
            )
            actual_path_points = [Point(float(lon), float(lat)) for lon, lat in (row[0].split() for row in result)]
            actual_line = LineString(actual_path_points)
            print("Actual path: ", actual_line.wkt)
            # Save the current path to the database if it exists
            if 'calculated_path' in session and session['calculated_path']:
                calculated_path = session['calculated_path']
                calculated_line = LineString([(point['lon'], point['lat']) for point in calculated_path])
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
            print("Updated user_paths table")
            print("-----------------")
            print("Actual path: ", actual_line.wkt)
    except SQLAlchemyError as e:
        print(f"Error saving path: {e}")
        return jsonify({'status': 'error'})

    # Clear session variables
    session.pop('calculated_path', None)
    session.pop('actual_path', None)
    session.pop('start_time', None)
    session.pop('target_lat', None)
    session.pop('target_lon', None)

    return jsonify({'status': 'success'})


@app.route('/save-location', methods=['POST'])
def save_location():
    data = request.json
    user_id = session['user_id']
    lat = data['lat']
    lon = data['lon']
    engine = create_engine(
        f"postgresql://{os.getenv('DB_USER')}:{os.getenv('DB_PASSWORD')}@{os.getenv('DB_HOST')}/{os.getenv('DB_NAME')}",
        echo=False)
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
    print("I'm getting called")
    data = request.json
    lat = data['lat']
    lon = data['lon']
    severity = data['severity']
    print(f"Received obstacle data: {lat}, {lon}, {severity}")
    engine = create_engine(
        f"postgresql://{os.getenv('DB_USER')}:{os.getenv('DB_PASSWORD')}@{os.getenv('DB_HOST')}/{os.getenv('DB_NAME')}",
        echo=False)
    point = Point(lon, lat)
    with engine.begin() as conn:
        conn.execute(
            text(
                "INSERT INTO gta_p1.obstacles (geom, severity, user_id) VALUES (ST_GeomFromText(:geom, 4326), :severity, :user_id)"
            ).bindparams(geom=point.wkt, severity=severity, user_id=session['user_id'])
        )
    return jsonify({'status': 'success'})


def create_app():
    initialize_graph()
    return app


if __name__ == '__main__':
    app.run()
