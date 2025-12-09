from flask import Flask, request, jsonify
from datetime import datetime

# --- Configuration ---
# The ESP8266 will post data to this port (must be the same as your Wi-Fi device)
RECEIVER_PORT = 5000

# --- Flask App Setup ---
app = Flask(__name__)

# The ESP8266 is configured to post to the path: /api/data
@app.route('/api/data', methods=['POST'])
def receive_data():
    """Receives JSON data from the ESP8266 and prints it to the console."""
    
    if request.is_json:
        # Get the JSON payload
        data = request.get_json()
        
        # --- Data Validation and Logging ---
        count = data.get('count', 'N/A')
        usage_s = data.get('usage_s', 'N/A')
        light = data.get('light', 'N/A')
        
        timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        
        print("-" * 30)
        print(f"[{timestamp}] DATA RECEIVED via Wi-Fi:")
        print(f"  People Count: {count}")
        print(f"  Total Usage: {usage_s} seconds")
        print(f"  Light Status: {light}")
        print("-" * 30)
        
        # The server must return a success response (HTTP 200)
        return jsonify({"message": "Data received successfully"}), 200
    else:
        # Handle non-JSON requests
        return jsonify({"error": "Request must be JSON"}), 400

if __name__ == '__main__':
    print("Starting local data receiver...")
    print(f"Listening for HTTP POST requests on http://127.0.0.1:{RECEIVER_PORT}/api/data")
    
    # Run the server, accessible locally on port 5000
    # host='0.0.0.0' makes it accessible on the local network IP (e.g., 192.168.1.5:5000)
    app.run(host='0.0.0.0', port=RECEIVER_PORT)