from flask import Flask, request, jsonify
from datetime import datetime
import threading
import asyncio
import websockets
import json
import time # Included the missing time import

# --- Configuration ---
RECEIVER_PORT = 5000 # Flask HTTP POST receiver for ESP8266
WEBSOCKET_PORT = 8001 # WebSocket server for HTML/Browser clients
# --- Flask App Setup ---
app = Flask(__name__)

# --- WebSocket Setup ---
# Global reference to the asyncio event loop running the WebSocket server (FIX)
ws_loop = None 
# Global set of connected WebSocket clients
websocket_clients = set()
# Store the last known data for new connections
last_data = {"count": 0, "usage_s": 0, "light": "OFF"}

async def websocket_handler(websocket, path):
    """Handles new WebSocket client connections (your web browser)."""
    websocket_clients.add(websocket)
    print(f"[{datetime.now().strftime('%H:%M:%S')}] WebSocket Client connected. Total: {len(websocket_clients)}")
    
    # Send the last known data to the new client immediately
    try:
        await websocket.send(json.dumps(last_data))
    except Exception:
        pass 
        
    try:
        await websocket.wait_closed()
    finally:
        websocket_clients.remove(websocket)
        print(f"[{datetime.now().strftime('%H:%M:%S')}] WebSocket Client disconnected.")

def start_websocket_server():
    """Initializes and runs the asyncio loop for the WebSocket server."""
    global ws_loop 
    print(f"Starting WebSocket Server on ws://0.0.0.0:{WEBSOCKET_PORT}")
    loop = asyncio.new_event_loop()
    ws_loop = loop # Store the loop reference globally
    asyncio.set_event_loop(loop)
    
    start_server = websockets.serve(websocket_handler, "0.0.0.0", WEBSOCKET_PORT)
    loop.run_until_complete(start_server)
    loop.run_forever()

@app.route('/api/data', methods=['POST'])
def receive_data():
    """Receives JSON data from the ESP8266 via HTTP POST."""
    global last_data
    global ws_loop 
    
    if request.is_json:
        data = request.get_json()
        
        # --- Update Global State ---
        last_data['count'] = data.get('count', 'N/A')
        last_data['usage_s'] = data.get('usage_s', 'N/A')
        last_data['light'] = data.get('light', 'N/A')
        
        timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        
        print("-" * 30)
        print(f"[{timestamp}] DATA RECEIVED (HTTP POST):")
        print(f"  People Count: {last_data['count']}")
        
        # --- Push Data to Web Clients (WebSocket) ---
        # Use the stored loop reference (ws_loop) for thread-safe operation
        if ws_loop and ws_loop.is_running():
            asyncio.run_coroutine_threadsafe(
                broadcast_data(json.dumps(last_data)),
                ws_loop
            )
        
        return jsonify({"message": "Data received and broadcasted"}), 200
    else:
        return jsonify({"error": "Request must be JSON"}), 400

async def broadcast_data(message):
    """Sends the latest data to all connected WebSocket clients."""
    if websocket_clients:
        await asyncio.gather(*[client.send(message) for client in websocket_clients])

if __name__ == '__main__':
    # 1. Start WebSocket Server in a separate thread
    ws_thread = threading.Thread(target=start_websocket_server, daemon=True)
    ws_thread.start()
    
    # Give asyncio time to start the loop
    time.sleep(1)

    # 2. Start Flask HTTP Server in the main thread
    print("\nStarting Flask HTTP Receiver...")
    print(f"Listening for ESP8266 POST requests on http://0.0.0.0:{RECEIVER_PORT}/api/data")
    
    # Run the server, accessible locally on port 5000
    app.run(host='0.0.0.0', port=RECEIVER_PORT, debug=False, use_reloader=False)