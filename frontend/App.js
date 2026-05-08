import React, { useRef, useEffect, useState } from "react";
import { View, Text, StyleSheet, SafeAreaView, Dimensions } from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import * as ImageManipulator from "expo-image-manipulator";
import io from "socket.io-client";

const SERVER_URL = "http://192.168.1.13:5000";
const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");

export default function App() {
  const [detections, setDetections] = useState([]);
  const [permission, requestPermission] = useCameraPermissions();
  const [isConnected, setIsConnected] = useState(false);
  
  const cameraRef = useRef(null);
  const socketRef = useRef(null);
  const nextFrameReady = useRef(true);

  useEffect(() => {
    requestPermission();

    socketRef.current = io(SERVER_URL, {
      transports: ["websocket"],
      forceNew: true,
      reconnection: true,
    });

    socketRef.current.on("connect", () => setIsConnected(true));
    socketRef.current.on("disconnect", () => setIsConnected(false));

    socketRef.current.on("result", (data) => {
      if (data.detections) {
        setDetections(data.detections);
      }
      nextFrameReady.current = true; 
    });

    return () => {
      if (socketRef.current) socketRef.current.disconnect();
    };
  }, []);

  const streamFrame = async () => {
    if (!cameraRef.current || !isConnected || !nextFrameReady.current) return;

    try {
      nextFrameReady.current = false;

      const photo = await cameraRef.current.takePictureAsync({
        quality: 0,
        skipProcessing: true,
        shutterSound: false,
      });

      const manipulated = await ImageManipulator.manipulateAsync(
        photo.uri,
        [{ resize: { width: 320 } }], 
        { compress: 0.5, format: ImageManipulator.SaveFormat.JPEG, base64: true }
      );

      if (manipulated.base64) {
        socketRef.current.emit("stream_frame", { 
          image: manipulated.base64,
          timestamp: Date.now() 
        });
      } else {
        nextFrameReady.current = true;
      }
    } catch (e) {
      console.error("Stream Error:", e);
      nextFrameReady.current = true;
    }
  };

  useEffect(() => {
    let interval;
    if (isConnected) {
      interval = setInterval(streamFrame, 100); 
    }
    return () => clearInterval(interval);
  }, [isConnected]);

  if (!permission?.granted) {
    return (
      <View style={styles.container}>
        <Text style={styles.text}>Awaiting Camera Permission...</Text>
      </View>
    );
  }

  const scaleX = SCREEN_WIDTH / 320;

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.mainContainer}>
        <CameraView
          ref={cameraRef}
          style={StyleSheet.absoluteFill}
          facing="back"
          mode="picture" 
        />


        {detections.map((det, index) => {
          const [x, y, w, h] = det.bbox;
          const MANUAL_Y_OFFSET = 30; 
          
          return (
            <View
              key={`det-${det.id}-${index}`}
              style={[
                styles.boundingBox,
                {
                  left: x * scaleX,
                  top: (y * scaleX) + MANUAL_Y_OFFSET,
                  width: w * scaleX,
                  height: h * scaleX,
                },
              ]}
            >
              <View style={styles.labelContainer}>
                <Text style={styles.labelText}>
                  {(det.label || "Vehicle").toUpperCase()} #{det.id || "?"}
                </Text>
                <Text style={styles.speedText}>
                  {det.speed > 0 ? `${det.speed.toFixed(1)} KM/H` : "CALCULATING..."}
                </Text>
              </View>
            </View>
          );
        })}

        {/* HUD Overlay */}
        <View style={styles.hud}>
          <View style={styles.header}>
            <Text style={styles.title}>V-STREAM RADAR</Text>
            <View style={[styles.statusBadge, { backgroundColor: isConnected ? '#00ffcc' : '#ff3300' }]}>
              <Text style={styles.statusText}>{isConnected ? 'STREAMING' : 'OFFLINE'}</Text>
            </View>
          </View>

          <View style={styles.footer}>
            <Text style={styles.footerText}>REAL-TIME SOCKETS ENABLED</Text>
          </View>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#000",
  },
  mainContainer: {
    flex: 1,
  },
  boundingBox: {
    position: "absolute",
    borderWidth: 3, 
    borderColor: "#00ffcc",
    borderRadius: 8,
    backgroundColor: "rgba(0, 255, 204, 0.08)",
  },
  labelContainer: {
    position: "absolute",
    top: -55, 
    left: -2,
    backgroundColor: "rgba(0,0,0,0.85)",
    paddingHorizontal: 12, 
    paddingVertical: 6,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: "#00ffcc",
    minWidth: 120,
  },
  labelText: {
    color: "#fff",
    fontSize: 12, 
    fontWeight: "bold",
    textTransform: "uppercase",
  },
  speedText: {
    color: "#00ffcc",
    fontSize: 22, 
    fontWeight: "900",
  },
  hud: {
    position: 'absolute',
    top: 50,
    left: 20,
    right: 20,
    bottom: 50,
    justifyContent: 'space-between',
    pointerEvents: 'none',
  },
  header: {
    width: '100%',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 12,
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderRadius: 8,
  },
  title: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "900",
    letterSpacing: 2,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
  },
  statusText: {
    color: '#000',
    fontSize: 9,
    fontWeight: 'bold',
  },
  footer: {
    width: '100%',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.6)',
    padding: 10,
    borderRadius: 8,
  },
  footerText: {
    color: '#fff',
    fontSize: 9,
    fontWeight: 'bold',
    letterSpacing: 1,
    opacity: 0.8,
  },
  text: {
    color: "#fff",
    fontSize: 18,
    textAlign: 'center',
    marginTop: '50%',
  },
});
