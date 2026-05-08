# Speed Tracker AI App

This is a React Native app built with Expo that uses **Vision Camera** and **TensorFlow.js (COCO-SSD)** to track the speed of moving objects (cars, trucks, etc.) in real-time.

## 🚀 How to Run

Because this app uses high-performance native modules (`react-native-vision-camera`, `react-native-reanimated`, `react-native-worklets-core`), it **cannot run in Expo Go**. You must create a **Development Build**.

### 1. Install Dependencies
```bash
npm install
```

### 2. Create a Development Build
You can use Expo Orbit or run:
```bash
# For Android
npx expo run:android

# For iOS
npx expo run:ios
```

### 3. Calibration
The speed calculation uses a `PIXEL_TO_METER` constant. You **MUST** tune this based on your camera's height and distance from the road.
- Open `App.js`
- Find `const PIXEL_TO_METER = 0.03;`
- Adjust this value until the speed matches reality.

## 🧠 Technical Details

- **Object Detection**: Uses `@tensorflow-models/coco-ssd` to identify vehicles.
- **Speed Logic**: Calculates the Euclidean distance between centroids of detected objects across frames.
- **Performance**: Frame processing is throttled to 5 FPS to ensure smooth UI performance on mobile devices.

## 🛠️ Components Used
- `react-native-vision-camera`: High-performance camera access.
- `react-native-reanimated`: Smooth UI transitions and Worklets support.
- `@tensorflow/tfjs`: Machine Learning engine.
- `@tensorflow-models/coco-ssd`: Pre-trained object detection model.
