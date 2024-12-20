# Accessible Navigation App

This is a flask project to create a accessible navigation app for the city of Zurich. The app searches for low elevation
paths to navigate the hilly city of Zurich. Additionally, it allows users to mark accessible features and obstacles on
the map and plan the route accordingly.

## Requirements

- Python
- flask
- numpy
- requests
- sqlalchemy
- scikit-learn
- geopandas
- osmnx
- networkx
- shapely
- python-dotenv
- PostgreSQL
- PostGIS

## Setup

1. Clone the repository:
    ```sh
   git clone https://github.com/Kronjus/gta_project.git
   cd gta_project
   ```
2. Create a virtual environment:
    ```sh
   python -m venv venv
   ```
3. Activate the virtual environment:
    - Windows:
        ```sh
       venv\Scripts\activate
       ```
    - MacOS/Linux:
        ```sh
       source venv/bin/activate
       ```
4. Install the dependencies:
    ```sh
   pip install -r requirements.txt
   ```

## Running the Application

1. Set the environment variables:
    - Windows:
        ```sh
       set FLASK_APP=app
       set FLASK_ENV=development
       ```
    - MacOS/Linux:
        ```sh
       export FLASK_APP=app
       export FLASK_ENV=development
       ```
2. Run the application:
   ```sh
   flask run
   ```

## Project Structure

- `app.py`: The main application file.
- `.env`: Environment variables file.
- `requirements.txt`: The dependencies of the project.
- `templates/`: The HTML templates of the application.
- `static/`: The static files of the application.

## License

This project is licensed under the MIT License.