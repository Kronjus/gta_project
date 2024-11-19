# Accessible Navigation App

This is a flask project to create a accessible navigation app for the city of Zurich. The app searches for low elevation
paths to navigate the hilly city of Zurich. Additionally, it allows users to mark accessible features and obstacles on
the map and plan the route accordingly.

## Requirements

- Python
- pip
- Flask
- numpy
- pandas
- geopandas
- osmnx
- networkx
- requests
- sqlalchemy
- psycopg2
- fiona
- shapely
- pyproj

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
- `instance/`: Contains instance-specific files.
- `.env`: Environment variables file.
- `.webassets-cache`: Cache for web assets.

## License

This project is licensed under the MIT License.