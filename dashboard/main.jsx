git add .import React, { useState, useEffect } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, doc, onSnapshot, collection, query, limit, orderBy } from 'firebase/firestore';

// --- CRITICAL: PASTE YOUR FIREBASE CONFIG HERE ---
// !!! IMPORTANT !!! Replace the placeholder below with the config you copied from the Firebase Console.
// Ensure ALL keys (including storageBucket, messagingSenderId, and appId) are included and correctly quoted.
const firebaseConfig = {
    apiKey: "AIzaSyB0R-_ZOHKJwmifRAorPhVtGI5jeIBKDXg", // PASTE YOUR API KEY HERE
    authDomain: "iot-counter-259eb.firebaseapp.com", // PASTE YOUR AUTH DOMAIN HERE
    projectId: "iot-counter-259eb", // PASTE YOUR PROJECT ID HERE
    storageBucket: "your-storage-bucket.appspot.com", // MUST BE PRESENT
    messagingSenderId: "1234567890", // MUST BE PRESENT
    appId: "1:1234567890:web:abcdefg" // MUST BE PRESENT
    // You must include all other fields exactly as Firebase gave them to you.
};
// ----------------------------------------------------

// This fixed ID MUST MATCH the APP_ID set in your Python script ('trichy-iot-counter').
const APP_ID = "trichy-iot-counter"; 

// Helper function to format seconds into HH:MM:SS
const formatTime = (totalSeconds) => {
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    const pad = (num) => String(num).padStart(2, '0');
    return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
};

// Main Application Component
const App = () => {
    const [db, setDb] = useState(null);
    const [isAuthReady, setIsAuthReady] = useState(false);
    const [sensorData, setSensorData] = useState({
        count: 0,
        usage_s: 0,
        light: 'OFF',
        lastUpdated: 'Loading...'
    });
    const [historyData, setHistoryData] = useState([]);
    const [loading, setLoading] = useState(true);
    const [configError, setConfigError] = useState(false); 

    // 1. Firebase Initialization and Authentication
    useEffect(() => {
        // Simple check for placeholder keys
        const isConfigValid = firebaseConfig.projectId && 
                              firebaseConfig.projectId !== "YOUR_PROJECT_ID" && 
                              firebaseConfig.apiKey !== "YOUR_API_KEY";

        if (!isConfigValid) {
            console.error("Firebase config not properly set up. Please replace placeholders for deployment.");
            setConfigError(true);
            setLoading(false);
            return;
        }
        
        setConfigError(false); 

        try {
            const app = initializeApp(firebaseConfig);
            const firestore = getFirestore(app);
            const authInstance = getAuth(app);
            setDb(firestore);

            const unsubscribeAuth = onAuthStateChanged(authInstance, (user) => {
                setIsAuthReady(true);
            });

            // Authentication is done anonymously since this is a public dashboard
            const authenticate = async () => {
                try {
                    await signInAnonymously(authInstance);
                } catch (error) {
                    console.error("Firebase authentication error:", error);
                }
            };
            authenticate();

            return () => unsubscribeAuth();
        } catch (error) {
            console.error("Firebase initialization failed:", error);
            setLoading(false);
        }
    }, []);

    // 2. Live Data Fetching (Firestore Listener)
    useEffect(() => {
        if (!isAuthReady || !db || configError) return;

        // Path for Live Sensor Data - Uses the fixed APP_ID
        // This path must match the WRITE path in your Python script.
        const sensorDocPath = `/artifacts/${APP_ID}/public/data/sensor_readings/latest`;
        const docRef = doc(db, sensorDocPath);

        const unsubscribe = onSnapshot(docRef, (docSnap) => {
            setLoading(false);
            if (docSnap.exists()) {
                const data = docSnap.data();
                setSensorData({
                    count: data.count || 0,
                    usage_s: data.usage_s || 0,
                    light: data.light || 'OFF',
                    lastUpdated: data.timestamp && data.timestamp.toDate ? new Date(data.timestamp.toDate()).toLocaleTimeString() : 'N/A'
                });
            } else {
                console.log("No live data found in Firestore. Waiting for Python bridge to post data.");
            }
        }, (error) => {
            console.error("Firestore snapshot error:", error);
            setLoading(false);
        });

        return () => unsubscribe();
    }, [isAuthReady, db, configError]);

    // 3. History Data Fetching
    useEffect(() => {
        if (!isAuthReady || !db || configError) return;

        // Path for Historical Log Data 
        const historyCollectionPath = `/artifacts/${APP_ID}/public/data/sensor_readings/latest/history`;
        const historyColRef = collection(db, historyCollectionPath);
        
        // Query to get the 10 most recent events, sorted by timestamp
        const q = query(historyColRef, orderBy('timestamp', 'desc'), limit(10));

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const log = snapshot.docs.map(doc => {
                const data = doc.data();
                return {
                    id: doc.id,
                    time: data.timestamp && data.timestamp.toDate ? new Date(data.timestamp.toDate()).toLocaleTimeString() : 'N/A',
                    date: data.timestamp && data.timestamp.toDate ? new Date(data.timestamp.toDate()).toLocaleDateString() : 'N/A',
                    count: data.count,
                    event: data.event,
                    usage_s: data.usage_s
                };
            });
            setHistoryData(log);
        }, (error) => {
            console.error("Firestore history snapshot error:", error);
        });

        return () => unsubscribe();
    }, [isAuthReady, db, configError]);


    const StatusCard = ({ title, value, colorClass, icon }) => (
        <div className="bg-white p-6 rounded-xl text-center border-b-4 data-card transition duration-300 hover:shadow-lg"
             style={{ borderColor: colorClass }}>
            {icon}
            <p className="text-lg text-gray-500">{title}</p>
            <div className={`text-5xl font-bold mt-1`} style={{ color: colorClass }}>{value}</div>
        </div>
    );

    const ConnectionStatus = () => (
        <div className="flex items-center space-x-3">
            <div className={`w-4 h-4 rounded-full ${loading && !configError ? 'bg-yellow-500' : 'bg-green-500'} ${loading && !configError ? 'animate-pulse' : ''}`}></div>
            <p className={`font-semibold ${loading && !configError ? 'text-yellow-700' : 'text-green-700'}`}>
                {loading && !configError ? 'Connecting to Firestore...' : 
                 configError ? 'Configuration Required' : 
                 `Live (${sensorData.lastUpdated})`}
            </p>
        </div>
    );

    const LightIcon = sensorData.light === 'ON' ? (
        <svg xmlns="http://www.w3.org/2000/svg" className="w-10 h-10 mx-auto mb-3 text-[#10b981]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 18V2m4 4-4-4-4 4"/><path d="M10 21h4"/><path d="M12 21a2 2 0 0 1-2-2v-2a2 2 0 0 1 4 0v2a2 2 0 0 1-2 2z"/></svg>
    ) : (
        <svg xmlns="http://www.w3.org/2000/svg" className="w-10 h-10 mx-auto mb-3 text-[#ef4444]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 6L14 18M10 6L10 18M12 2V22"/></svg>
    );
    
    // Conditional rendering for configuration error
    if (configError) {
        return (
            <div className="bg-gray-50 min-h-screen p-4 sm:p-8 font-inter flex items-center justify-center">
                <div className="max-w-xl mx-auto p-8 bg-white rounded-xl shadow-lg border-l-4 border-red-500">
                    <h1 className="text-3xl font-extrabold text-red-700 mb-4">Deployment Configuration Required</h1>
                    <p className="text-gray-700 mb-6">
                        The dashboard cannot connect to Firebase until you replace the placeholder values in the 
                        <code className="bg-gray-100 p-1 rounded font-mono text-sm">firebaseConfig</code> object within this file with your actual Firebase project credentials.
                    </p>
                    <p className="text-sm text-gray-500">
                        Please check your Firebase Console and ensure all 6 key-value pairs are pasted correctly, including quotes and commas.
                    </p>
                </div>
            </div>
        );
    }

    const HistoryLog = () => (
        <div className="mt-10 bg-white p-6 rounded-xl shadow-md border-t-4 border-blue-500">
            <h3 className="text-xl font-bold text-gray-800 mb-4 flex items-center">
                <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6 mr-2 text-blue-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 21a9 9 0 0 0 9-9c-.5-1.5-1-2-1.5-2.5"/><path d="M12 3a9 9 0 0 1 9 9c-.5 1.5-1 2-1.5 2.5"/><path d="M10 12h2l-2 5"/></svg>
                Recent Activity Log (Last 10 Events)
            </h3>
            {historyData.length === 0 ? (
                <p className="text-gray-500">No events logged yet. Ensure your Python bridge is running and sending data to Firestore.</p>
            ) : (
                <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50">
                            <tr>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Time</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Event</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Count After</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Total Usage (s)</th>
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                            {historyData.map((log) => (
                                <tr key={log.id} className={log.event === 'OCCUPIED' ? 'hover:bg-green-50' : 'hover:bg-red-50'}>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                                        {log.time} <span className="text-gray-500 text-xs hidden sm:inline">({log.date})</span>
                                    </td>
                                    <td className={`px-6 py-4 whitespace-nowrap text-sm font-semibold ${log.event === 'OCCUPIED' ? 'text-green-600' : 'text-red-600'}`}>
                                        {log.event}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{log.count}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{log.usage_s}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );


    return (
        <div className="bg-gray-50 min-h-screen p-4 sm:p-8 font-inter">
            <div className="max-w-5xl mx-auto">
                <header className="text-center mb-10">
                    <h1 className="text-3xl font-extrabold text-gray-800">IoT Room Activity Dashboard</h1>
                    <p className="text-gray-500 mt-2">Global Live Data via Vercel and Firebase Firestore</p>
                </header>

                {/* Status Bar */}
                <div className="mb-8 p-4 bg-white rounded-xl shadow-md flex justify-between items-center flex-wrap">
                    <ConnectionStatus />
                    <div className="text-xs text-gray-500 mt-2 sm:mt-0">
                        <p>Data Path ID: <span className="text-gray-700 font-mono text-[10px]">{APP_ID}</span></p>
                    </div>
                </div>

                {/* Data Visualization Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                    
                    <StatusCard 
                        title="People Inside" 
                        value={sensorData.count} 
                        colorClass="#4f46e5"
                        icon={<svg xmlns="http://www.w3.org/2000/svg" className="w-10 h-10 text-[#4f46e5] mx-auto mb-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>}
                    />

                    <StatusCard 
                        title="Light State" 
                        value={sensorData.light} 
                        colorClass={sensorData.light === 'ON' ? '#10b981' : '#ef4444'}
                        icon={LightIcon}
                    />

                    <StatusCard 
                        title="Total Usage Time" 
                        value={formatTime(sensorData.usage_s)} 
                        colorClass="#f59e0b"
                        icon={<svg xmlns="http://www.w3.org/2000/svg" className="w-10 h-10 text-[#f59e0b] mx-auto mb-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>}
                    />
                    
                </div>
                
                <HistoryLog />

                <div className="mt-12 p-6 bg-red-50 rounded-xl border border-red-200">
                    <h3 className="text-xl font-bold text-red-800 mb-4">BLANK SCREEN DIAGNOSIS:</h3>
                    <p className="text-gray-700 mb-2">
                        If your website is blank, it means the application crashed. The most likely cause is an **incorrectly formatted key** in the `firebaseConfig` object above.
                    </p>
                    <ol className="list-disc list-inside text-sm text-gray-700 space-y-1">
                        <li>**Check Quotes:** Ensure every key's value is wrapped in double quotes (e.g., `apiKey: "AIzaSy..."`).</li>
                        <li>**Check Commas:** Ensure every line ends with a comma, except the last one.</li>
                        <li>**Check ALL Keys:** Ensure keys like `storageBucket` and `appId` are present.</li>
                    </ol>
                </div>
            </div>
        </div>
    );
};

export default App;