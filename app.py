import numpy as np

import pyproj

from flask import Flask, jsonify,send_file, request
from flask_cors import CORS, cross_origin

app = Flask(__name__)
CORS(app, origins=["*", "null"])

# Home
@app.route('/', methods=["GET"])
def home():
    return "HOMEPAGE"
    # return send_file('index.html')

# Obstacle hinzufügen
@app.route('/update_obstacles', methods=["POST"])
def update_obstacles():
    position = request.get_json(force=True)
    return 0

# Input für Route
@app.route('/start_navigation', methods = ['GET'])
def start_navigation():
    start_pos = request.get_json(force=True)
    max_grad = request.args.get("max_grad", 100)
    dest = request.args.get("destination", "")
    return 0

if __name__ == '__main__':
    app.run()
