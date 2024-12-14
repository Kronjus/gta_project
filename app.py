import logging
import uuid
from flask import Flask, render_template, request, jsonify, session, redirect, url_for
import os
from sqlalchemy import create_engine, text
import geopandas as gpd
import networkx as nx
from networkx.readwrite import json_graph
import osmnx as ox
from dotenv import load_dotenv
from shapely.geometry import Point, LineString
from geoalchemy2 import Geometry, functions as geo_func
from sqlalchemy.exc import SQLAlchemyError
from datetime import datetime

load_dotenv()

app = Flask(__name__)
app.secret_key = os.getenv('SECRET_KEY')

# Cache for the graph
graph_cache = None


def fetch_data():
    engine = create_engine(
        f"postgresql://{os.getenv('DB_USER')}:{os.getenv('DB_PASSWORD')}@{os.getenv('DB_HOST')}/{os.getenv('DB_NAME')}")

    nodes_gdf = gpd.read_postgis("SELECT * FROM gta_p1.zurich_nodes", engine, geom_col='geometry', index_col='osmid')
    edges_gdf = gpd.read_postgis("SELECT * FROM gta_p1.zurich_edges", engine, geom_col='geometry',
                                 index_col=['u', 'v', 'key'])

    print("Retrieving data from database DONE!")
    return nodes_gdf, edges_gdf


def create_graph(nodes, edges):
    G = ox.graph_from_gdfs(nodes, edges)
    print("Building graph DONE!")
    print(G.graph['crs'])
    return G


def get_cached_graph():
    global graph_cache
    if graph_cache is None:
        nodes, edges = fetch_data()
        graph_cache = create_graph(nodes, edges)
    return graph_cache


def find_shortest_path(G, start_lon, start_lat, end_lon, end_lat):
    try:
        logging.debug(f"Start coordinates: ({start_lat}, {start_lon})")
        logging.debug(f"End coordinates: ({end_lat}, {end_lon})")

        start_node = ox.nearest_nodes(G, start_lon, start_lat)
        logging.debug(f"Start node: {start_node}")

        end_node = ox.nearest_nodes(G, end_lon, end_lat)
        logging.debug(f"End node: {end_node}")

        path = ox.shortest_path(G, start_node, end_node)
        logging.debug(f"Shortest path: {path}")

        return path
    except ValueError as e:
        logging.error(f"Invalid coordinate value: {e}")
        return None
    except nx.NetworkXNoPath:
        logging.error("No path found between the specified nodes")
        return None


def find_shortest_accessible_path(G, start_lon, start_lat, end_lon, end_lat):
    try:
        start_node = ox.nearest_nodes(G, start_lon, start_lat)
        end_node = ox.nearest_nodes(G, end_lon, end_lat)

        path = ox.shortest_path(G, start_node, end_node, weight='gain')
        return path
    except ValueError as e:
        logging.error(f"Invalid coordinate value: {e}")
        return None
    except nx.NetworkXNoPath:
        logging.error("No path found between the specified nodes")
        return None


@app.route('/')
def home():
    if 'user_id' not in session:
        session['user_id'] = str(uuid.uuid4())
    if 'target_lat' not in session:
        session['target_lat'] = None
    if 'target_lon' not in session:
        session['target_lon'] = None
    return render_template('index.html')


@app.route('/shortest-path', methods=['POST'])
def shortest_path():
    print("I'm getting called")
    data = request.json
    start_lat = float(data['start_lat'])
    start_lon = float(data['start_lon'])
    session['target_lat'] = end_lat = float(data['end_lat'])
    session['target_lon'] = end_lon = float(data['end_lon'])
    accessibility = data['accessibility']

    logging.debug(f"Received data: {start_lat}, {start_lon}, {end_lat}, {end_lon}, accessibility: {accessibility}")

    G = get_cached_graph()
    if accessibility:
        path = find_shortest_accessible_path(G, start_lon, start_lat, end_lon, end_lat)
    else:
        path = find_shortest_path(G, start_lon, start_lat, end_lon, end_lat)

    if path is None:
        return jsonify({'error': 'No path found'}), 404

    # Convert path to list of nodes with lat and lon properties
    path_coords = [{'lat': G.nodes[node]['y'], 'lon': G.nodes[node]['x']} for node in path]
    if 'calculated_path' not in session or not session['calculated_path']:
        session['calculated_path'] = path_coords

    return jsonify({'path': path_coords})


@app.route('/stop-navigation', methods=['POST'])
def stop_navigation():
    user_id = session.get('user_id')
    if user_id:
        engine = create_engine(
            f"postgresql://{os.getenv('DB_USER')}:{os.getenv('DB_PASSWORD')}@{os.getenv('DB_HOST')}/{os.getenv('DB_NAME')}",
            echo=True)
        try:
            with engine.begin() as conn:
                # Save the current path to the database if it exists
                if 'calculated_path' in session and session['calculated_path']:
                    path = session['calculated_path']
                    line = LineString([(point['lon'], point['lat']) for point in path])
                    conn.execute(
                        text(
                            "INSERT INTO gta_p1.user_paths (user_id, geom) VALUES (:user_id, ST_GeomFromText(:geom, 4326))"
                        ).bindparams(user_id=user_id, geom=line.wkt)
                    )
        except SQLAlchemyError as e:
            logging.error(f"Error saving path: {e}")
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
    from geopy.distance import geodesic  # For accurate distance calculations

    data = request.json
    user_id = session['user_id']
    lat = data['lat']
    lon = data['lon']

    engine = create_engine(
        f"postgresql://{os.getenv('DB_USER')}:{os.getenv('DB_PASSWORD')}@{os.getenv('DB_HOST')}/{os.getenv('DB_NAME')}",
        echo=True)
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
        logging.error(f"Error saving location: {e}")
        return jsonify({'status': 'error'})

    print(f"Location saved for user_id: {user_id}, {point.wkt}.")
    return jsonify({'status': 'success'})


@app.route('/save-path', methods=['POST'])
def save_path():
    data = request.json
    user_id = session['user_id']
    path = session['calculated_path']
    print(f"Received path data: {path}")
    engine = create_engine(
        f"postgresql://{os.getenv('DB_USER')}:{os.getenv('DB_PASSWORD')}@{os.getenv('DB_HOST')}/{os.getenv('DB_NAME')}",
        echo=False)
    line = LineString([(point['lon'], point['lat']) for point in path])
    with engine.begin() as conn:
        conn.execute(
            text(
                "INSERT INTO gta_p1.user_trajectories (user_id, geom) VALUES (:user_id, ST_GeomFromText(:geom, 4326))"
            ).bindparams(user_id=user_id, geom=line.wkt)
        )
    session['calculated_path'] = None
    return jsonify({'status': 'success'})


@app.route('/save-obstacle', methods=['POST'])
def add_obstacle():
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


if __name__ == '__main__':
    app.run()
