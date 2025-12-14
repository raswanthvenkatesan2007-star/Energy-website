from datetime import datetime
import firebase_admin
from firebase_admin import firestore
from firebase_admin import credentials 
import os 
import json
import time
import sys
import serial 

# --- CONFIGURATION ---
# IMPORTANT: This must be the COM port of your HC-05 (e.g., COM7). 
# Check Windows Device Manager for the correct port number.
SERIAL_PORT = 'COM8' # <-- RE-ENTER YOUR CORRECT COM PORT HERE (e.g., COM6)
BAUD_RATE = 9600 
RECONNECT_DELAY = 5 

# --- Firebase Initialization ---
db = None
# This file must be present locally for WRITE access.
SERVICE_ACCOUNT_KEY_FILE = 'serviceAccountKey.json'

# CRITICAL: This ID MUST match the ID hardcoded in the deployed React Dashboard (App.jsx)
APP_ID = 'trichy-iot-counter' 

try:
    if os.path.exists(SERVICE_ACCOUNT_KEY_FILE):
        cred = credentials.Certificate(SERVICE_ACCOUNT_KEY_FILE)
        firebase_admin.initialize_app(cred)
        db = firestore.client()
        print(f"Firebase Admin SDK initialized successfully using {SERVICE_ACCOUNT_KEY_FILE}.")
    else:
        # Fallback path only used in Canvas, but kept for completeness
        FIREBASE_CONFIG_STR = os.environ.get('__firebase_config', '{}')
        FIREBASE_CONFIG = json.loads(FIREBASE_CONFIG_STR)

        if FIREBASE_CONFIG and 'projectId' in FIREBASE_CONFIG:
            firebase_admin.initialize_app(options={'projectId': FIREBASE_CONFIG.get('projectId')})
            db = firestore.client()
            print("Firebase Admin SDK initialized successfully using Canvas config (READ-ONLY).")
        else:
            print(f"FATAL ERROR: Missing Firebase credentials. Please place your Service Account key file named '{SERVICE_ACCOUNT_KEY_FILE}' in this directory.", file=sys.stderr)
            
except Exception as e:
    print(f"FATAL ERROR: Failed to initialize Firebase Admin SDK. Error: {e}", file=sys.stderr)
    db = None


# --- Firestore Path References ---
def get_live_doc_ref():
    """Returns the document reference for the single, live data update (for the dashboard)."""
    return db.collection(f'artifacts/{APP_ID}/public/data/sensor_readings').document('latest')

def get_history_collection_ref():
    """Returns the collection reference for the historical log (for reports)."""
    # This creates a subcollection under the 'sensor_readings/latest' document
    return db.collection(f'artifacts/{APP_ID}/public/data/sensor_readings').document('latest').collection('history')


def write_to_history_log(payload):
    """Writes the full payload to the history collection using .add() to create a new record."""
    try:
        get_history_collection_ref().add(payload)
        print("  -> Logged historical record successfully.")
    except Exception as e:
        print(f"History Log Write Error: {e}", file=sys.stderr)


def write_to_firestore(data):
    """Handles both the live dashboard update and the history log."""
    if not db:
        print("Error: Database not initialized.", file=sys.stderr)
        return False

    timestamp = datetime.now()
    
    # 1. Prepare Payload
    count = data.get('count', 0)
    
    payload = {
        'count': count,
        'usage_s': data.get('usage_s', 0),
        'light': data.get('light', 'OFF'),
        'timestamp': timestamp,
        # Determine event type based on current state (0 or > 0)
        'event': 'OCCUPIED' if count > 0 else 'EMPTY' 
    }

    try:
        # 2. Write to Live Document (Overwrite for dashboard)
        get_live_doc_ref().set(payload)
        
        # 3. Write to History Log (New document for historical tracking)
        write_to_history_log(payload)

        print("-" * 30)
        print(f"[{timestamp.strftime('%H:%M:%S')}] Data received (BT) and saved to Firestore:")
        print(f"  People Count: {payload['count']}")
        return True
    except Exception as e:
        print(f"Firestore Live Write Error: {e}", file=sys.stderr)
        return False

def parse_csv_data(line):
    """Parses the COUNT:X,USAGE_S:Y,LIGHT:Z CSV-style string from the Arduino."""
    data = {}
    try:
        parts = line.split(',')
        for part in parts:
            key_value = part.split(':')
            if len(key_value) == 2:
                key = key_value[0].strip()
                value = key_value[1].strip()
                
                if key in ['COUNT', 'USAGE_S']:
                    data[key.lower()] = int(value)
                elif key == 'LIGHT':
                    data[key.lower()] = value
        
        if 'count' in data and 'usage_s' in data and 'light' in data:
            return data
        else:
            print(f"WARNING: Data packet missing critical keys: {line}", file=sys.stderr)
            return None
            
    except Exception as e:
        print(f"Error parsing serial data: {e} | Line: {line}", file=sys.stderr)
        return None


def serial_reader_loop():
    """Main loop to connect to the serial port and read data."""
    # Removed redundant check for 'COM_PORT_HERE' since the user has set the port number.

    while True:
        try:
            ser = serial.Serial(SERIAL_PORT, BAUD_RATE, timeout=None) 
            print(f"\nSuccessfully connected to Bluetooth on {SERIAL_PORT} at {BAUD_RATE} Baud.")
            
            while True:
                line = ser.readline().decode('utf-8').strip()
                
                if line.startswith('COUNT:'):
                    parsed_data = parse_csv_data(line)
                    if parsed_data:
                        write_to_firestore(parsed_data)
                elif line:
                    print(f"DEBUG: {line}")
        
        except serial.SerialException as e:
            print(f"\nError connecting to serial port {SERIAL_PORT}: {e}", file=sys.stderr)
            print(f"Retrying connection in {RECONNECT_DELAY} seconds...")
            time.sleep(RECONNECT_DELAY)
        
        except KeyboardInterrupt:
            print("\nExiting Serial Bridge.")
            if 'ser' in locals() and ser.is_open:
                ser.close()
            sys.exit(0)
        
        except Exception as e:
            print(f"An unexpected error occurred: {e}", file=sys.stderr)
            time.sleep(RECONNECT_DELAY)


if __name__ == '__main__':
    try:
        import serial
    except ImportError:
        print("\n!!! MISSING PYTHON LIBRARY !!!")
        print("Please install pyserial library by running:")
        print("pip install pyserial\n")
        sys.exit(1)

    if not db:
        print("Cannot start bridge due to Firebase initialization failure. Check serviceAccountKey.json and Internet connection.", file=sys.stderr)
        sys.exit(1)
    
    print("Starting Arduino Bluetooth Serial Bridge...")
    serial_reader_loop()